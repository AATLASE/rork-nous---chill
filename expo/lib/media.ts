import AsyncStorage from "@react-native-async-storage/async-storage";
import { decode, encode } from "base64-arraybuffer";
import * as FileSystem from "expo-file-system/legacy";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import { Platform } from "react-native";
import { MEDIA_BUCKET, supabase } from "./supabase";

export interface PickedAsset {
  uri: string;
  type: "image" | "video";
  mimeType: string;
  /** Pixel dimensions when known (used by the crop/adjust UI). */
  width?: number;
  height?: number;
}

/**
 * Largest video the app accepts. Supabase storage refuses bigger files (50 MB
 * per file on the current plan), and the whole file is read into memory before
 * it is sent: a 4K clip of a few hundred MB crashed the PWA tab, or failed five
 * times in the background before being dropped.
 */
export const MAX_VIDEO_BYTES = 50 * 1024 * 1024;

/** File extension that matches what the bytes are (an iPhone .mov stays .mov). */
export function extensionFor(type: "image" | "video", mimeType: string): string {
  if (type === "video") {
    if (mimeType.includes("quicktime")) return "mov";
    if (mimeType.includes("webm")) return "webm";
    return "mp4";
  }
  return mimeType.includes("png") ? "png" : "jpg";
}

/** Refuses the selection when a video is over MAX_VIDEO_BYTES, before anything is queued. */
function checkVideoSizes(assets: ImagePicker.ImagePickerAsset[]): void {
  const tooBig = assets.some((a) => {
    if (a.type !== "video") return false;
    const size = a.fileSize ?? (a as { file?: { size?: number } }).file?.size;
    return typeof size === "number" && size > MAX_VIDEO_BYTES;
  });
  if (tooBig) {
    throw new Error(`Cette vidéo est trop lourde (${MAX_VIDEO_BYTES / 1024 / 1024} Mo maximum). Choisis un extrait plus court.`);
  }
}

function toPicked(asset: ImagePicker.ImagePickerAsset): PickedAsset {
  const isVideo = asset.type === "video";
  return {
    uri: asset.uri,
    type: isVideo ? "video" : "image",
    mimeType: asset.mimeType ?? (isVideo ? "video/mp4" : "image/jpeg"),
    width: asset.width || undefined,
    height: asset.height || undefined,
  };
}

/**
 * Pick one or more photos/videos from the library.
 *
 * No `quality` is asked for on purpose. Below 1, the picker decodes and
 * re-encodes every selected file before handing it back — ten photos of that,
 * before the screen even reappears, for a result `prepareImage` immediately
 * re-encodes anyway on its way to 1600px. Taking the originals moves the whole
 * cost to that single pass, which shrinks them far more.
 */
export async function pickFromLibrary(multiple = true): Promise<PickedAsset[]> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images", "videos"],
    allowsMultipleSelection: multiple,
    selectionLimit: 10,
    videoExportPreset: ImagePicker.VideoExportPreset.H264_1280x720,
  });
  if (result.canceled) return [];
  checkVideoSizes(result.assets);
  return result.assets.map(toPicked);
}

/** Capture a single photo with the camera (no camera in the cloud simulator). */
export async function captureWithCamera(): Promise<PickedAsset[]> {
  const perm = await ImagePicker.requestCameraPermissionsAsync();
  if (!perm.granted) throw new Error("L'accès à la caméra a été refusé.");
  const result = await ImagePicker.launchCameraAsync({
    mediaTypes: ["images", "videos"],
    videoExportPreset: ImagePicker.VideoExportPreset.H264_1280x720,
  });
  if (result.canceled) return [];
  checkVideoSizes(result.assets);
  return result.assets.map(toPicked);
}

/**
 * Pick a single image for a cover. Returns the raw image (no system cropper):
 * framing is done afterwards in the in-app adjust screen (CoverAdjustModal),
 * which crops via cropImageAsset.
 */
export async function pickCoverImage(): Promise<PickedAsset | null> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images"],
    quality: 0.7,
  });
  if (result.canceled || result.assets.length === 0) return null;
  return toPicked(result.assets[0]);
}

export interface CropRect {
  originX: number;
  originY: number;
  width: number;
  height: number;
}

/**
 * Crops an image asset to the given rectangle (in source pixels) and returns
 * a new local asset. Values are rounded and clamped to the image bounds.
 */
export async function cropImageAsset(asset: PickedAsset, rect: CropRect, imageWidth: number, imageHeight: number): Promise<PickedAsset> {
  const width = Math.max(1, Math.min(Math.round(rect.width), imageWidth));
  const height = Math.max(1, Math.min(Math.round(rect.height), imageHeight));
  const originX = Math.max(0, Math.min(Math.round(rect.originX), imageWidth - width));
  const originY = Math.max(0, Math.min(Math.round(rect.originY), imageHeight - height));

  const context = ImageManipulator.manipulate(asset.uri);
  context.crop({ originX, originY, width, height });
  const rendered = await context.renderAsync();
  const saved = await rendered.saveAsync({ format: SaveFormat.JPEG, compress: 0.85 });
  try {
    rendered.release?.();
    context.release?.();
  } catch {
    // Releasing shared objects is a memory optimization only.
  }

  return {
    uri: saved.uri,
    type: "image",
    mimeType: "image/jpeg",
    width: saved.width,
    height: saved.height,
  };
}

/**
 * Pick a single image for an avatar. Returns the raw image (no system
 * cropper): framing is done afterwards in the in-app adjust screen
 * (CoverAdjustModal with shape="circle"), which crops via cropImageAsset.
 */
export async function pickAvatarImage(): Promise<PickedAsset | null> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images"],
    quality: 0.7,
  });
  if (result.canceled || result.assets.length === 0) return null;
  return toPicked(result.assets[0]);
}

/**
 * Reads a picked asset into an ArrayBuffer, whatever the URI type.
 * Pickers return `file://` paths on native, but `data:`/`blob:` URIs on web.
 * `fetch` handles all of these on every platform, so it is the primary path;
 * on native we fall back to the legacy base64 file reader if fetch fails.
 * The new expo-file-system `File` API is deliberately avoided: it throws
 * "invalid path" for non-file URIs and "this.validatePath is not a function"
 * on web.
 */
async function readAssetBytes(uri: string): Promise<ArrayBuffer> {
  try {
    const response = await fetch(uri);
    const buffer = await response.arrayBuffer();
    if (buffer.byteLength > 0) return buffer;
    console.log("[media] fetch returned an empty buffer, trying fallback");
  } catch (e) {
    console.log("[media] fetch read failed, trying fallback:", e);
  }

  if (Platform.OS !== "web") {
    try {
      const base64 = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      return decode(base64);
    } catch (e) {
      console.log("[media] legacy file read failed:", e);
    }
  }

  throw new Error("Impossible de lire le fichier sélectionné. Réessaie avec une autre image.");
}

/**
 * Longest edge kept when uploading a photo. Straight out of a phone camera an
 * image is 4000px and several megabytes, while nothing in the app ever renders
 * it wider than a screen. Shrinking first makes the upload far more likely to
 * succeed on mobile data — and keeps the base64 fallback path from holding a
 * huge string in memory.
 *
 * 1600px is the largest thing anyone sees: the fullscreen viewer draws with
 * `contentFit="contain"` at window size and there is no pinch-zoom, so even a
 * 3x phone in landscape asks for less. Every pixel above that is upload time
 * paid for nothing — which is why this used to be 2000 and no longer is.
 */
const MAX_UPLOAD_DIMENSION = 1600;

/**
 * JPEG quality for that resize. At 1600px the difference between 0.7 and 0.85
 * is invisible on a phone and roughly a factor two on the wire.
 */
const UPLOAD_COMPRESSION = 0.7;

/**
 * Brings a picked photo down to what the app actually shows: at most
 * MAX_UPLOAD_DIMENSION on the longest edge, JPEG at UPLOAD_COMPRESSION.
 *
 * It runs even on an image that is already small enough, and that is the point.
 * The pickers hand back an untouched original — a 1200px PNG screenshot can
 * weigh more than the 4000px photo next to it — so "already small" says nothing
 * about the number of bytes. One pass here is also the *only* re-encode in the
 * whole path, which is why the pickers no longer ask for a compression of their
 * own: they used to decode and re-encode every selected file before returning,
 * and this function then threw that work away by encoding it a second time.
 */
async function prepareImage(asset: PickedAsset): Promise<PickedAsset> {
  try {
    const context = ImageManipulator.manipulate(asset.uri);
    const longestEdge = Math.max(asset.width ?? 0, asset.height ?? 0);
    if (longestEdge > MAX_UPLOAD_DIMENSION) {
      const landscape = (asset.width ?? 0) >= (asset.height ?? 0);
      context.resize(landscape ? { width: MAX_UPLOAD_DIMENSION } : { height: MAX_UPLOAD_DIMENSION });
    }
    const rendered = await context.renderAsync();
    const saved = await rendered.saveAsync({ format: SaveFormat.JPEG, compress: UPLOAD_COMPRESSION });
    try {
      rendered.release?.();
      context.release?.();
    } catch {
      // Releasing shared objects is a memory optimization only.
    }
    return { uri: saved.uri, type: "image", mimeType: "image/jpeg", width: saved.width, height: saved.height };
  } catch (e) {
    // Never block an upload on the resize step.
    console.log("[media] image preparation failed, sending the original:", e);
    return asset;
  }
}

export type UploadKind = "covers" | "avatars" | "episodes";

export interface UploadContext {
  kind: UploadKind;
  spaceId?: string | null;
  userId?: string | null;
  episodeId?: string | null;
}

interface PathCandidate {
  template: string;
  folder: string;
}

const TEMPLATE_CACHE_KEY = "gather.media.upload-template.v1";

/** Inline data-URL fallback is only used for small images (covers/avatars). */
const INLINE_FALLBACK_MAX_BYTES = 900_000;

/**
 * Ordered candidate folders for an upload. The storage security rules live in
 * an external Supabase project we cannot inspect; empirical probing showed:
 * - anonymous inserts fail on the membership check (auth.uid()) before any cast,
 * - authenticated inserts fail with `invalid input syntax for type uuid` on the
 *   SECOND path segment when it is not a uuid (e.g. "{spaceId}/covers/.."),
 * - "covers/..." alone fails the policy without a cast error.
 * So the policy matches the 2nd segment against the user's space memberships.
 * Every candidate therefore puts a uuid in position 2, with different prefixes
 * in position 1 to cover the possible policy variants. The first template that
 * succeeds is cached and tried first on the next upload.
 */
function buildCandidates(ctx: UploadContext): PathCandidate[] {
  const { kind, spaceId, userId, episodeId } = ctx;
  const list: PathCandidate[] = [];
  if (spaceId) {
    // The storage rules (supabase/migrations/20261029070000) require the space
    // as the FIRST folder, so those two layouts come first; the others only
    // remain as a fallback for a policy change.
    if (episodeId) list.push({ template: "space-episode", folder: `${spaceId}/${episodeId}` });
    list.push({ template: "space-kind", folder: `${spaceId}/${kind}` });
    list.push({ template: "kind-first", folder: `${kind}/${spaceId}` });
    if (userId) list.push({ template: "user-first", folder: `${userId}/${spaceId}` });
    if (kind !== "episodes") list.push({ template: "episodes-first", folder: `episodes/${spaceId}` });
    list.push({ template: "spaces-first", folder: `spaces/${spaceId}` });
  }
  return list;
}

/** True when the failure comes from the storage security rules (worth trying another path). */
function isPolicyRejection(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e);
  return /row-level security|invalid input syntax|unauthorized|not allowed|violates|policy|uuid/i.test(msg);
}

/** `undefined` while the stored value has never been read. */
let templateMemo: string | null | undefined;

async function readCachedTemplate(): Promise<string | null> {
  if (templateMemo !== undefined) return templateMemo;
  try {
    templateMemo = await AsyncStorage.getItem(TEMPLATE_CACHE_KEY);
  } catch {
    templateMemo = null;
  }
  return templateMemo;
}

function writeCachedTemplate(template: string): void {
  templateMemo = template;
  AsyncStorage.setItem(TEMPLATE_CACHE_KEY, template).catch(() => {});
}

async function uploadBytes(folder: string, bytes: ArrayBuffer, mimeType: string, ext: string): Promise<string> {
  const path = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await supabase.storage.from(MEDIA_BUCKET).upload(path, bytes, {
    contentType: mimeType,
    upsert: false,
  });
  if (error) throw error;
  return supabase.storage.from(MEDIA_BUCKET).getPublicUrl(path).data.publicUrl;
}

/**
 * Uploads a picked asset and returns a displayable URL.
 * Tries every candidate path format accepted by the backend (cached winner
 * first), and for small images falls back to an inline data URL so covers and
 * avatars keep working even if the storage rules refuse every path.
 */
export async function uploadMedia(ctx: UploadContext, asset: PickedAsset): Promise<string> {
  const source = asset.type === "image" ? await prepareImage(asset) : asset;
  const ext = extensionFor(source.type, source.mimeType);
  const bytes = await readAssetBytes(source.uri);
  if (!bytes || bytes.byteLength === 0) {
    throw new Error("Le fichier sélectionné est vide.");
  }

  const candidates = buildCandidates(ctx);
  const cached = await readCachedTemplate();
  if (cached) {
    const idx = candidates.findIndex((c) => c.template === cached);
    if (idx > 0) {
      const [hit] = candidates.splice(idx, 1);
      candidates.unshift(hit);
    }
  }

  let lastError: unknown = null;
  for (const candidate of candidates) {
    try {
      const url = await uploadBytes(candidate.folder, bytes, source.mimeType, ext);
      console.log(`[media] upload OK via template "${candidate.template}" (${candidate.folder})`);
      if (candidate.template !== cached) writeCachedTemplate(candidate.template);
      return url;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.log(`[media] template "${candidate.template}" (${candidate.folder}) rejected: ${msg}`);
      lastError = e;
      if (!isPolicyRejection(e)) break;
    }
  }

  // Storage refused every path (or none was buildable). Small images can be
  // stored inline as a data URL — renders everywhere (web, RN, iOS) and keeps
  // the feature usable no matter what the storage rules are.
  if (ctx.kind !== "episodes" && source.type === "image" && bytes.byteLength <= INLINE_FALLBACK_MAX_BYTES) {
    console.log("[media] all storage paths refused — using inline image fallback");
    return `data:${source.mimeType};base64,${encode(bytes)}`;
  }

  console.log("[media] upload failed on every candidate:", lastError);
  throw new Error("Le stockage a refusé l'envoi du fichier. Réessaie — et si ça persiste, dis-le nous.");
}

export interface UploadOutcome {
  asset: PickedAsset;
  /** The displayable URL, or null when this one file could not be sent. */
  url: string | null;
  error?: unknown;
}

/**
 * How many files travel at once. Uploading a review's photos one after the
 * other spends most of its time waiting on a round trip that is not using the
 * connection — three in flight fills it without starving the UI thread or
 * making a weak network drop everything at once.
 */
const UPLOAD_CONCURRENCY = 3;

/**
 * Uploads several picked assets and reports each one separately, in the order
 * they were given. Never throws: one unsendable file must not discard the ones
 * that went through, so failures come back as `url: null`.
 */
export async function uploadMediaAll(
  ctx: UploadContext,
  assets: PickedAsset[],
  concurrency: number = UPLOAD_CONCURRENCY,
): Promise<UploadOutcome[]> {
  const results: UploadOutcome[] = new Array(assets.length);
  if (assets.length === 0) return results;

  let next = 0;
  const run = async (i: number): Promise<void> => {
    try {
      results[i] = { asset: assets[i], url: await uploadMedia(ctx, assets[i]) };
    } catch (e) {
      console.log("[media] media upload failed:", e);
      results[i] = { asset: assets[i], url: null, error: e };
    }
  };

  // Nothing cached yet means the first upload has to discover which path the
  // storage rules accept, probing up to six of them. Letting it do that alone
  // costs one file's latency; letting three do it at once costs three times the
  // probing.
  if ((await readCachedTemplate()) === null) {
    await run(0);
    next = 1;
  }

  const worker = async (): Promise<void> => {
    for (let i = next++; i < assets.length; i = next++) {
      await run(i);
    }
  };
  const lanes = Math.max(0, Math.min(concurrency, assets.length - next));
  await Promise.all(Array.from({ length: lanes }, worker));

  return results;
}

/** Storage path of a file served by its public URL, or null for anything else (data: URLs…). */
function storagePathOf(url: string | null | undefined): string | null {
  if (!url) return null;
  const marker = `/storage/v1/object/public/${MEDIA_BUCKET}/`;
  const at = url.indexOf(marker);
  if (at < 0) return null;
  return decodeURIComponent(url.slice(at + marker.length).split("?")[0]);
}

/**
 * Deletes the files behind these URLs, best-effort. Rows go with ON DELETE
 * CASCADE, the files do not: without this, every deleted episode or space left
 * its photos in the bucket for good. Files the storage rules do not let this
 * user delete simply stay; nothing here can fail the deletion it follows.
 */
export async function removeStoredFiles(urls: (string | null | undefined)[]): Promise<void> {
  const paths = [...new Set(urls.map(storagePathOf).filter((p): p is string => !!p))];
  if (paths.length === 0) return;
  try {
    const { error } = await supabase.storage.from(MEDIA_BUCKET).remove(paths);
    if (error) console.log("[media] storage cleanup failed:", error.message);
  } catch (e) {
    console.log("[media] storage cleanup failed:", e);
  }
}
