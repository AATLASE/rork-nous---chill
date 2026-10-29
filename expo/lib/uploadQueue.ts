import AsyncStorage from "@react-native-async-storage/async-storage";
import * as FileSystem from "expo-file-system/legacy";
import { AppState, Platform } from "react-native";
import { qk } from "./keys";
import { extensionFor, uploadMediaAll, type PickedAsset } from "./media";
import { queryClient } from "./queryClient";
import { supabase } from "./supabase";

/**
 * The photos someone added but that have not reached the server yet.
 *
 * Uploading used to happen while the screen waited: twelve photos meant twelve
 * uploads of hesitation before "Enregistrer ma review" did anything visible,
 * and leaving the screen — or the app — during that window lost the lot. The
 * queue moves the waiting out of the way. The review is saved, the screen
 * closes, and the files leave on their own.
 *
 * What the queue guarantees on iOS and Android: nothing is lost. A job survives
 * the screen closing, the app being killed, a flight-mode tunnel, a failed
 * request. It is retried when the app comes back to the foreground, and again
 * at the next launch, until it lands or gives up loudly.
 *
 * On the web the files only exist as long as the page (a `blob:` URI dies with
 * it), so the queue lives in memory: it retries when the tab becomes visible
 * again or the network comes back, and the browser asks before the page is
 * closed while something is still waiting.
 *
 * What it does NOT guarantee: transfers do not continue while the app is
 * suspended. iOS stops JavaScript seconds after backgrounding; a transfer in
 * flight is cut and resumes on return. Making it survive suspension needs the
 * system's own uploader (NSURLSession background session, iOS only) — a layer
 * that would sit on top of this one, not replace it.
 */
export interface UploadJob {
  id: string;
  /**
   * Who added the file. Only that account's session uploads it: with a second
   * account signed in on the same phone, the job waits instead of going out
   * under the wrong name. Missing on jobs queued before this field existed.
   */
  userId?: string;
  episodeId: string;
  spaceId: string;
  /** Durable copy of the file — see keepFile. */
  uri: string;
  type: "image" | "video";
  mimeType: string;
  width?: number;
  height?: number;
  /**
   * Set once the bytes are in storage but the row is not. Storage succeeded and
   * the database did not: retrying the upload would leave the first copy behind
   * as an orphan, so a job that got this far only ever retries the insert.
   */
  url?: string;
  attempts: number;
  createdAt: number;
}

const QUEUE_KEY = "gather.media.upload-queue.v1";

/**
 * Where the files wait. The picker hands back a path in the cache directory,
 * which the OS is free to empty whenever it needs room — precisely the file a
 * deferred upload would come back for. So each job gets its own copy somewhere
 * the system does not touch.
 */
const PENDING_DIR = FileSystem.documentDirectory ? `${FileSystem.documentDirectory}pending-uploads/` : null;

/** After this many failed passes a job is dropped rather than retried forever. */
const MAX_ATTEMPTS = 5;

/** Web has no durable file: a `blob:` URI dies with the page, so persisting one would only restore a broken job. */
const PERSISTS = Platform.OS !== "web";

let queue: UploadJob[] = [];
let loading: Promise<void> | null = null;
let draining: Promise<void> | null = null;
let started = false;

// ── State, readable by the UI ──────────────────────────────────────────────

type Listener = () => void;
const listeners = new Set<Listener>();

export function subscribeUploadQueue(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** What a stretch of uploading amounted to, once the queue is empty again. */
export interface UploadRunResult {
  sent: number;
  /** Files given up on for good — never a silent loss. */
  failed: number;
}

type RunListener = (result: UploadRunResult) => void;
const runListeners = new Set<RunListener>();

/**
 * Called once when the queue empties, not once per file: someone who dropped
 * twelve photos wants one "c'est envoyé", not twelve.
 */
export function subscribeUploadRuns(listener: RunListener): () => void {
  runListeners.add(listener);
  return () => {
    runListeners.delete(listener);
  };
}

let sentThisRun = 0;
let failedThisRun = 0;

/** Stable between changes: every mutation replaces the array rather than editing it. */
export function uploadQueueSnapshot(): UploadJob[] {
  return queue;
}

/**
 * Awaitable on purpose. The queue is only a promise to the user once it is on
 * disk: between "envoi en cours" and the write landing, killing the app would
 * leave a durable copy nobody claims — which the orphan sweep would then
 * delete. Callers who tell someone their photos are safe await this.
 */
function commit(next: UploadJob[]): Promise<void> {
  queue = next;
  for (const listener of listeners) listener();
  if (!PERSISTS) return Promise.resolve();
  return AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue)).catch((e) => {
    console.log("[upload-queue] could not persist the queue:", e);
  });
}

// ── Persistence ────────────────────────────────────────────────────────────

async function load(): Promise<void> {
  if (!loading) {
    loading = (async () => {
      if (!PERSISTS) return;
      try {
        const raw = await AsyncStorage.getItem(QUEUE_KEY);
        if (raw) queue = JSON.parse(raw) as UploadJob[];
      } catch (e) {
        console.log("[upload-queue] unreadable queue, starting empty:", e);
        queue = [];
      }
    })();
  }
  return loading;
}

async function keepFile(asset: PickedAsset, id: string): Promise<string> {
  if (!PENDING_DIR) return asset.uri;
  try {
    await FileSystem.makeDirectoryAsync(PENDING_DIR, { intermediates: true });
    const ext = extensionFor(asset.type, asset.mimeType);
    const to = `${PENDING_DIR}${id}.${ext}`;
    await FileSystem.copyAsync({ from: asset.uri, to });
    return to;
  } catch (e) {
    // Better to queue the cache path and risk it being swept than to refuse the
    // photo outright.
    console.log("[upload-queue] no durable copy, keeping the picker's path:", e);
    return asset.uri;
  }
}

function forgetFile(job: UploadJob): void {
  if (!PENDING_DIR || !job.uri.startsWith(PENDING_DIR)) return;
  FileSystem.deleteAsync(job.uri, { idempotent: true }).catch(() => {});
}

// ── Adding ────────────────────────────────────────────────────────────────

/**
 * Hands photos and videos to the queue and returns immediately. The caller can
 * close its screen: from here on the files are the queue's problem.
 */
export async function enqueueEpisodeMedia(
  episodeId: string,
  spaceId: string,
  assets: PickedAsset[],
): Promise<void> {
  if (assets.length === 0) return;
  await load();
  const { data } = await supabase.auth.getSession();
  const userId = data.session?.user?.id;

  const jobs: UploadJob[] = [];
  for (const asset of assets) {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    jobs.push({
      id,
      userId,
      episodeId,
      spaceId,
      uri: await keepFile(asset, id),
      type: asset.type,
      mimeType: asset.mimeType,
      width: asset.width,
      height: asset.height,
      attempts: 0,
      createdAt: Date.now(),
    });
  }

  // Awaited: when the caller's toast appears, the queue is on disk and the app
  // can be closed on the spot without losing anything.
  await commit([...queue, ...jobs]);
  void drainUploadQueue();
}

// ── Sending ────────────────────────────────────────────────────────────────

/**
 * Sends every job of one episode, then writes their rows in a single insert.
 * Returns false when something is left behind, which stops the pass: whatever
 * failed will fail again right now, and the next trigger is soon enough.
 */
async function sendEpisodeGroup(group: UploadJob[], userId: string): Promise<boolean> {
  const { episodeId, spaceId } = group[0];

  // Jobs already in storage skip straight to the insert that failed last time.
  const todo = group.filter((job) => !job.url);
  const uploaded = new Map<string, string>();
  for (const job of group) {
    if (job.url) uploaded.set(job.id, job.url);
  }

  if (todo.length > 0) {
    const assets: PickedAsset[] = todo.map((job) => ({
      uri: job.uri,
      type: job.type,
      mimeType: job.mimeType,
      width: job.width,
      height: job.height,
    }));
    const outcomes = await uploadMediaAll({ kind: "episodes", spaceId, userId, episodeId }, assets);
    outcomes.forEach((outcome, i) => {
      if (outcome.url) uploaded.set(todo[i].id, outcome.url);
    });
  }

  const done = group.filter((job) => uploaded.has(job.id));
  const missed = group.filter((job) => !uploaded.has(job.id));

  if (done.length > 0) {
    const rows = done.map((job) => ({
      episode_id: episodeId,
      space_id: spaceId,
      url: uploaded.get(job.id) as string,
      filename: (uploaded.get(job.id) as string).split("/").pop() || "media",
      type: job.type,
      uploaded_by: userId,
    }));
    const { error } = await supabase.from("episode_media").insert(rows);
    if (error) {
      // The bytes are up, the rows are not. Remember the URLs so the retry does
      // not upload a second copy of everything — and count the attempt, or an
      // insert the database will never accept would be retried at every launch
      // for the life of the install.
      console.log("[upload-queue] media rows insert failed, will retry the insert only:", error);
      const spent = new Set(
        done.filter((job) => job.attempts + 1 >= MAX_ATTEMPTS).map((job) => job.id),
      );
      for (const job of done) {
        if (spent.has(job.id)) forgetFile(job);
      }
      failedThisRun += spent.size;
      await commit(
        queue
          .filter((job) => !spent.has(job.id))
          .map((job) => {
            const url = uploaded.get(job.id);
            return url ? { ...job, url, attempts: job.attempts + 1 } : job;
          }),
      );
      return false;
    }
  }

  sentThisRun += done.length;

  // Anything not retried again is done with, one way or the other.
  const abandoned = missed.filter((job) => job.attempts + 1 >= MAX_ATTEMPTS);
  failedThisRun += abandoned.length;
  const settled = new Set([...done, ...abandoned].map((job) => job.id));
  for (const job of done) forgetFile(job);
  for (const job of abandoned) {
    console.log(`[upload-queue] giving up on a ${job.type} after ${MAX_ATTEMPTS} attempts`);
    forgetFile(job);
  }

  const retrying = new Set(missed.filter((job) => !settled.has(job.id)).map((job) => job.id));
  await commit(
    queue
      .filter((job) => !settled.has(job.id))
      .map((job) => (retrying.has(job.id) ? { ...job, attempts: job.attempts + 1 } : job)),
  );

  if (done.length > 0) {
    queryClient.invalidateQueries({ queryKey: qk.episode(episodeId) });
    queryClient.invalidateQueries({ queryKey: qk.episodes(spaceId) });
  }

  return retrying.size === 0;
}

async function runDrain(): Promise<void> {
  await load();
  if (queue.length === 0) return;

  // Signed out, or the token has not been restored yet: everything waits. The
  // auth listener below brings us back.
  const { data } = await supabase.auth.getSession();
  const userId = data.session?.user?.id ?? null;
  if (!userId) return;

  // Another account's files wait for that account to sign in again.
  const mine = (job: UploadJob) => !job.userId || job.userId === userId;

  // One episode at a time so their rows stay one insert, as they were when the
  // upload was inline.
  for (let next = queue.find(mine); next; next = queue.find(mine)) {
    const episodeId = next.episodeId;
    const group = queue.filter((job) => job.episodeId === episodeId && mine(job));
    const cleared = await sendEpisodeGroup(group, userId);
    if (!cleared) break;
  }

  // Silence until there is nothing left: announcing anything while files are
  // still waiting would be announcing something untrue.
  if (queue.length === 0 && sentThisRun + failedThisRun > 0) {
    const result: UploadRunResult = { sent: sentThisRun, failed: failedThisRun };
    sentThisRun = 0;
    failedThisRun = 0;
    for (const listener of runListeners) listener(result);
  }
}

/** Runs a pass, or joins the one already running. Never throws. */
export function drainUploadQueue(): Promise<void> {
  if (!draining) {
    draining = runDrain()
      .catch((e) => {
        console.log("[upload-queue] pass failed:", e);
      })
      .finally(() => {
        draining = null;
      });
  }
  return draining;
}

// ── Start-up ───────────────────────────────────────────────────────────────

/**
 * Deletes copies no job claims any more. Without this, a queue lost to a failed
 * write would leave its files behind for good.
 */
async function sweepOrphans(): Promise<void> {
  if (!PENDING_DIR) return;
  try {
    const dir = await FileSystem.getInfoAsync(PENDING_DIR);
    if (!dir.exists) return;
    const names = await FileSystem.readDirectoryAsync(PENDING_DIR);
    const claimed = new Set(queue.map((job) => job.uri));
    const cutoff = Date.now() / 1000 - 300;

    await Promise.all(
      names.map(async (name) => {
        const uri = `${PENDING_DIR}${name}`;
        if (claimed.has(uri)) return;
        // A copy younger than five minutes belongs to an enqueue happening
        // right now: its job is not in the list read a moment ago, and deleting
        // the file under it would lose the photo the sweep exists to protect.
        const info = await FileSystem.getInfoAsync(uri);
        if (info.exists && info.modificationTime && info.modificationTime > cutoff) return;
        await FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {});
      }),
    );
  } catch (e) {
    console.log("[upload-queue] sweep failed:", e);
  }
}

/**
 * Wires the queue to the app's lifecycle. Idempotent — call it once from the
 * root layout.
 */
export function startUploadQueue(): void {
  if (started) return;
  started = true;

  void load().then(() => {
    void sweepOrphans();
    void drainUploadQueue();
  });

  if (Platform.OS !== "web") {
    AppState.addEventListener("change", (state) => {
      if (state === "active") void drainUploadQueue();
    });
  } else if (typeof window !== "undefined") {
    // The web has no AppState: coming back to the tab and getting the network
    // back are the moments a stalled pass can succeed.
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") void drainUploadQueue();
    });
    window.addEventListener("online", () => void drainUploadQueue());
    // Closing the page loses whatever is still waiting: let the browser ask.
    window.addEventListener("beforeunload", (event) => {
      if (queue.length === 0) return;
      event.preventDefault();
      event.returnValue = "";
    });
  }

  // A pass that stopped for want of a session picks up here.
  supabase.auth.onAuthStateChange((event) => {
    if (event === "SIGNED_IN" || event === "INITIAL_SESSION" || event === "TOKEN_REFRESHED") {
      void drainUploadQueue();
    }
  });
}
