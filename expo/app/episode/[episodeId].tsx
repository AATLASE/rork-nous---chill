import { useLocalSearchParams, useRouter } from "expo-router";
import {
  Camera,
  CheckCircle2,
  ChevronLeft,
  Clock,
  CornerDownRight,
  Heart,
  Hourglass,
  ImagePlus,
  Lock,
  MapPin,
  MessageCircle,
  PenLine,
  Send,
  Sparkles,
  Trash2,
  UserPlus,
  Users,
  X,
} from "lucide-react-native";
import { useMemo, useState } from "react";
import { ScrollView, TextInput, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CoverAdjustModal } from "@/components/CoverAdjustModal";
import { MediaGallery, MediaGrid } from "@/components/MediaGallery";
import { RatingStars } from "@/components/RatingStars";
import { Avatar } from "@/components/ui/Avatar";
import { Badge, RoleBadge } from "@/components/ui/Badge";
import { Button, IconButton } from "@/components/ui/Button";
import { Card, Divider, SectionHeader } from "@/components/ui/Card";
import { Loader } from "@/components/ui/Feedback";
import { noWebOutline, useAutoGrow } from "@/components/ui/Input";
import { FadeIn, Pulse, PressableScale } from "@/components/ui/motion";
import { AppText } from "@/components/ui/Text";
import { colors, radius, spacing } from "@/constants/theme";
import { friendlyError } from "@/lib/errors";
import { formatDate, formatDuration, normalizeTags } from "@/lib/format";
import { pickCoverImage, pickFromLibrary, type PickedAsset } from "@/lib/media";
import { enqueueEpisodeMedia } from "@/lib/uploadQueue";
import { confirmAction } from "@/lib/confirm";
import { usePendingUploadCount } from "@/hooks/useUploadQueue";
import {
  applyMention,
  matchMentions,
  mentionQuery,
  mentionedIds,
  type MentionCandidate,
} from "@/lib/mentions";
import {
  canParticipate,
  effectiveRole,
  isOwner,
  reviewersOf,
  type EpisodeMedia,
  type MemberRole,
  type Profile,
  type SpaceMember,
} from "@/lib/types";
import {
  useDeleteEpisode,
  useDeleteEpisodeMedia,
  useEpisode,
  useEpisodeLikes,
  useSetEpisodeCover,
  useToggleLike,
} from "@/hooks/useEpisodes";
import { useMembers } from "@/hooks/useMembers";
import { useEpisodeReviewAuthors, useEpisodeReviews, useMyReview, useRevealEpisodeNow } from "@/hooks/useReviews";
import { useAddComment, useComments, useDeleteComment, useToggleReaction } from "@/hooks/useSocial";
import { useSpace } from "@/hooks/useSpaces";
import { useAuth } from "@/providers/auth";
import { useToast } from "@/providers/toast";
import { CommentItem } from "@/components/episode/CommentItem";
import { RevealedReviews } from "@/components/episode/RevealedReviews";


/** A member as the "@" list shows them: a name to insert, a face, a role. */
type MemberCandidate = MentionCandidate & { profile: Profile | null; role: MemberRole };

export default function EpisodeDetailScreen() {
  const { episodeId } = useLocalSearchParams<{ episodeId: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const { userId } = useAuth();

  const { data: episode, isLoading } = useEpisode(episodeId);
  const spaceId = episode?.space_id ?? "";
  const { data: space } = useSpace(spaceId);
  const { data: members } = useMembers(spaceId);
  const { data: reviews } = useEpisodeReviews(episodeId);
  const { data: reviewAuthors } = useEpisodeReviewAuthors(episodeId);
  const revealNow = useRevealEpisodeNow(episodeId, episode?.space_id ?? "");
  const { data: myReview } = useMyReview(episodeId);
  const { data: comments } = useComments(episodeId);
  const { data: likes } = useEpisodeLikes(episodeId);

  const toggleLike = useToggleLike(episodeId);
  const addComment = useAddComment(episodeId, spaceId);
  const deleteComment = useDeleteComment(episodeId);
  const toggleReaction = useToggleReaction(episodeId);
  /**
   * Files handed to the upload queue and not yet in the gallery. The banner
   * announces them; all this screen owes them is not to claim, underneath it,
   * that there is nothing here.
   */
  const uploading = usePendingUploadCount(episodeId);

  const setCover = useSetEpisodeCover(episodeId, spaceId);
  const deleteMedia = useDeleteEpisodeMedia(episodeId, spaceId);
  const deleteEpisode = useDeleteEpisode(spaceId);

  const [pendingCover, setPendingCover] = useState<PickedAsset | null>(null);
  const [draft, setDraft] = useState<string>("");
  // Where the caret is, tracked because the "@" picker reads the word just
  // before it. onSelectionChange lands a render after onChangeText, so the
  // estimate is kept in step by hand as the text changes.
  const [caret, setCaret] = useState<number>(0);
  const [replyTo, setReplyTo] = useState<{ rootId: string; name: string } | null>(null);
  const [draftFocused, setDraftFocused] = useState<boolean>(false);
  // The composer sits in the page scroll, so it can grow with the comment
  // rather than trapping a long one behind an inner scrollbar.
  const draftGrow = useAutoGrow({ enabled: true, value: draft, minHeight: 47, extraHeight: 3 });

  const participate = canParticipate(space?.membership);
  const isObserver = effectiveRole(space?.membership) === "observer";
  // Destructive actions stay with the space owner and the person who wrote the
  // episode — not with every participant.
  const canManage = isOwner(space?.membership) || (!!userId && episode?.created_by === userId);

  /**
   * Who has published, whatever the caller is allowed to read. `reviewAuthors`
   * is the authoritative list (a function that returns ids only); the rows from
   * `reviews` are folded in as a fallback so your own "A répondu" still shows if
   * that call fails.
   */
  const answeredIds = useMemo(
    () => new Set([...(reviewAuthors ?? []), ...(reviews ?? []).map((r) => r.author_id)]),
    [reviewAuthors, reviews]
  );
  const reviewers: SpaceMember[] = useMemo(() => reviewersOf(members), [members]);
  // Alone in the space: the reveal has nobody to wait for, so the card talks
  // about inviting the group instead of "you are the last one to answer".
  const alone = reviewers.length === 1;
  const pendingCount = useMemo(
    () => reviewers.filter((m) => !answeredIds.has(m.user_id)).length,
    [reviewers, answeredIds]
  );

  /**
   * Everybody in the space can be named with "@" — observers included. They read
   * the whole thread and are part of the group; being unmentionable would make
   * them invisible in a conversation they are watching. Whether they may *write*
   * is a separate rule, enforced elsewhere.
   */
  const people: MemberCandidate[] = useMemo(
    () =>
      (members ?? []).map((m) => ({
        id: m.user_id,
        name: m.profile?.name?.trim() || "Membre",
        profile: m.profile ?? null,
        role: effectiveRole(m),
      })),
    [members]
  );
  // Yourself excluded from the picker only: your own name still highlights when
  // somebody else writes it.
  const mentionables = useMemo(() => people.filter((p) => p.id !== userId), [people, userId]);

  // The header counts the conversation, not the number of threads in it.
  const commentCount = useMemo(
    () => (comments ?? []).reduce((total, c) => total + 1 + (c.replies?.length ?? 0), 0),
    [comments]
  );

  const mentionCtx = useMemo(() => mentionQuery(draft, caret), [draft, caret]);
  const suggestions = useMemo(
    () => (mentionCtx ? matchMentions(mentionables, mentionCtx.query) : []),
    [mentionCtx, mentionables]
  );

  if (isLoading || !episode) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <Loader label="Chargement de l'épisode…" />
      </View>
    );
  }

  // The reveal is per episode: the last participant to publish opens it for
  // everyone. Unlocking the season stays the owner's escape hatch for episodes
  // somebody never answered.
  const revealed = !!episode.reviews_revealed_at || !!space?.season_unlocked;

  /**
   * Observers write comments only once the episode is revealed. Before that,
   * an outside reaction would land on a moment its own participants have not
   * finished describing — and could nudge what they are about to write. The
   * database enforces the same rule (see the episode_comments policies).
   */
  const canComment = participate || (!!space?.membership && revealed);

  const tags = normalizeTags(episode.tags);
  const media = episode.media ?? [];
  const mediaCount = media.length;

  // The cover is the episode's poster and stays what it was at creation:
  // media added later fills the album below, it never rewrites the top of the
  // screen. `cover_url` may point at a row that is not loaded (or no longer
  // exists), so fall back to a stand-in item rather than dropping the image.
  const coverItem: EpisodeMedia | null = episode.cover_url
    ? media.find((m) => m.url === episode.cover_url) ?? {
        id: "cover",
        episode_id: episode.id,
        url: episode.cover_url,
        type: "image",
        created_at: episode.created_at,
      }
    : null;

  // Two distinct actions on purpose: this one replaces the poster at the top of
  // the screen, the album button below feeds the gallery. Neither touches the
  // other.
  const onPickCover = async () => {
    try {
      const asset = await pickCoverImage();
      if (asset) setPendingCover(asset);
    } catch (e) {
      toast.error(friendlyError(e));
    }
  };

  const onCoverAdjusted = async (cropped: PickedAsset) => {
    setPendingCover(null);
    try {
      await setCover.mutateAsync(cropped);
      toast.success("Couverture mise à jour");
    } catch (e) {
      toast.error(friendlyError(e));
    }
  };

  const onAddMedia = async () => {
    try {
      const picked = await pickFromLibrary(true);
      if (picked.length) {
        // Handed to the upload queue, which survives leaving this screen and
        // closing the app. The grid shows the count until they land.
        await enqueueEpisodeMedia(episodeId, spaceId, picked);
        toast.success("Envoi des médias en cours, garde l'application ouverte");
      }
    } catch (e) {
      toast.error(friendlyError(e));
    }
  };

  const confirmDeleteMedia = (item: EpisodeMedia) => {
    confirmAction(
      item.type === "video" ? "Supprimer cette vidéo ?" : "Supprimer cette photo ?",
      "Elle disparaîtra de la galerie pour tout le monde. Cette action est irréversible.",
      "Supprimer",
      async () => {
        try {
          await deleteMedia.mutateAsync(item.id);
          toast.success("Média supprimé");
        } catch (e) {
          toast.error(friendlyError(e));
        }
      },
    );
  };

  const confirmDeleteEpisode = () => {
    confirmAction(
      "Supprimer cet épisode ?",
      `« ${episode.title} », ses photos, ses commentaires et les reviews associées seront définitivement supprimés.`,
      "Supprimer",
      async () => {
        try {
          await deleteEpisode.mutateAsync(episodeId);
          toast.success("Épisode supprimé");
          router.back();
        } catch (e) {
          toast.error(friendlyError(e));
        }
      },
    );
  };

  // The caret moves with the text one render before onSelectionChange says so.
  const onChangeDraft = (next: string) => {
    setCaret((c) => (c >= draft.length ? next.length : Math.max(0, c + (next.length - draft.length))));
    setDraft(next);
  };

  const chooseMention = (person: MemberCandidate) => {
    if (!mentionCtx) return;
    const next = applyMention(draft, mentionCtx.start, caret, person.name);
    setDraft(next.text);
    setCaret(next.cursor);
    draftGrow.ref.current?.focus();
  };

  /** "Répondre" — the thread stays one level deep, so this always targets the root. */
  const startReply = (rootId: string, authorName: string) => {
    setReplyTo({ rootId, name: authorName });
    // Naming the person is what the reply would open with anyway, and it makes
    // the mention explicit for anyone reading the thread later. Only when the
    // box is empty: a draft in progress is the writer's, not ours to rewrite.
    if (!draft.trim()) {
      const prefix = `@${authorName} `;
      setDraft(prefix);
      setCaret(prefix.length);
    }
    draftGrow.ref.current?.focus();
  };

  const cancelReply = () => setReplyTo(null);

  /**
   * Deleting a comment takes its answers with it (the foreign key cascades), so
   * a thread is never removed without saying how much of it goes. A lone
   * comment still goes in one tap.
   */
  const confirmDeleteComment = (commentId: string) => {
    const all = (comments ?? []).flatMap((c) => [c, ...(c.replies ?? [])]);
    const target = all.find((c) => c.id === commentId);
    const replyCount = (comments ?? []).find((c) => c.id === commentId)?.replies?.length ?? 0;
    // The owner removing somebody else's words always gets asked first.
    if (target && target.author_id !== userId) {
      confirmAction(
        "Supprimer ce commentaire ?",
        `Le commentaire de ${target.profile?.name ?? "ce membre"}${replyCount > 0 ? ` et ses ${replyCount} réponse${replyCount > 1 ? "s" : ""}` : ""} sera supprimé pour tout le monde.`,
        "Supprimer",
        () => deleteComment.mutate(commentId),
      );
      return;
    }
    if (replyCount === 0) {
      deleteComment.mutate(commentId);
      return;
    }
    confirmAction(
      "Supprimer ce commentaire ?",
      `Ses ${replyCount} réponse${replyCount > 1 ? "s" : ""} seront supprimée${replyCount > 1 ? "s" : ""} avec lui.`,
      "Supprimer",
      () => deleteComment.mutate(commentId),
    );
  };

  const onSendComment = async () => {
    const body = draft.trim();
    // Enter and the send button can both fire while the first send is on its way.
    if (!body || addComment.isPending) return;
    try {
      await addComment.mutateAsync({
        body,
        parentId: replyTo?.rootId ?? null,
        mentions: mentionedIds(body, people),
      });
      setDraft("");
      setCaret(0);
      setReplyTo(null);
    } catch (e) {
      toast.error(friendlyError(e));
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: spacing.xxxl }} automaticallyAdjustKeyboardInsets>
        {/* Hero gallery */}
        <View>
          <MediaGallery media={coverItem ? [coverItem] : []} height={380} />
          <View style={{ position: "absolute", top: insets.top + 6, left: spacing.lg, right: spacing.lg, flexDirection: "row", justifyContent: "space-between" }}>
            <IconButton icon={<ChevronLeft size={22} color="#fff" />} onPress={() => router.back()} size={42} style={{ backgroundColor: "rgba(0,0,0,0.45)" }} accessibilityLabel="Retour" />
            {participate ? (
              <IconButton
                icon={<Camera size={20} color="#fff" />}
                onPress={onPickCover}
                size={42}
                style={{ backgroundColor: "rgba(0,0,0,0.45)" }}
                accessibilityLabel={coverItem ? "Changer la photo de couverture" : "Ajouter une photo de couverture"}
              />
            ) : null}
          </View>
        </View>

        <View style={{ paddingHorizontal: spacing.lg, gap: spacing.xxl, marginTop: spacing.xl }}>
          {/* Meta */}
          <FadeIn>
            <View style={{ gap: spacing.sm }}>
              <AppText variant="title">{episode.title}</AppText>
              <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md, flexWrap: "wrap" }}>
                {episode.date ? <AppText variant="bodyMuted">{formatDate(episode.date)}</AppText> : null}
                {episode.place ? (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                    <MapPin size={14} color={colors.textMuted} />
                    <AppText variant="bodyMuted">{episode.place}</AppText>
                  </View>
                ) : null}
                {episode.duration ? (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                    <Clock size={14} color={colors.textMuted} />
                    <AppText variant="bodyMuted">{formatDuration(episode.duration)}</AppText>
                  </View>
                ) : null}
              </View>
              {tags.length > 0 ? (
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 2 }}>
                  {tags.map((t) => (
                    <Badge key={t} label={t} tone="muted" />
                  ))}
                </View>
              ) : null}
            </View>
          </FadeIn>

          {/* Like / comment counts */}
          <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.xl }}>
            <PressableScale
              onPress={() => {
                if (toggleLike.isPending) return;
                toggleLike.mutate(likes?.liked ?? false, { onError: (e) => toast.error(friendlyError(e)) });
              }} style={{ flexDirection: "row", alignItems: "center", gap: 7 }}>
              <Heart size={22} color={likes?.liked ? colors.primary : colors.textMuted} fill={likes?.liked ? colors.primary : "transparent"} />
              <AppText style={{ fontWeight: "700", color: likes?.liked ? colors.primary : colors.textMuted }}>{likes?.count ?? 0}</AppText>
            </PressableScale>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 7 }}>
              <MessageCircle size={21} color={colors.textMuted} />
              <AppText style={{ fontWeight: "700", color: colors.textMuted }}>{comments?.length ?? 0}</AppText>
            </View>
          </View>

          <Divider />

          {/* Reviews / private mechanic */}
          <View style={{ gap: spacing.md }}>
            <SectionHeader
              title={revealed ? "Les reviews révélées" : "Reviews"}
              subtitle={
                !revealed
                  ? undefined
                  : episode.reviews_revealed_at
                  ? "Tout le monde a publié — voici ce que chacun a écrit"
                  : "Révélées par le déverrouillage de la saison"
              }
            />

            {revealed ? (
              reviewers.length === 0 ? (
                <AppText variant="bodyMuted">Personne n&apos;a participé à cet épisode.</AppText>
              ) : (
                <RevealedReviews reviewers={reviewers} reviews={reviews ?? []} />
              )
            ) : (
              <>
                {/* My review status card */}
                {participate ? (
                  myReview ? (
                    <Card glow style={{ gap: spacing.md }}>
                      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                          <Lock size={16} color={colors.accent} />
                          <AppText variant="h3">Ta review est scellée</AppText>
                        </View>
                        {myReview.rating ? <RatingStars value={myReview.rating} size={15} /> : null}
                      </View>
                      <AppText variant="bodyMuted">
                        {pendingCount === 1
                          ? "Il ne manque plus qu'une review : dès qu'elle arrive, tout se révèle d'un coup."
                          : pendingCount > 1
                          ? `Encore ${pendingCount} reviews à écrire dans le groupe, puis tout se révèle d'un coup.`
                          : "Elle se révélera en même temps que celles des autres."}
                        {" Toi seul(e) peux la voir d'ici là."}
                      </AppText>
                      <Button title="Modifier ma review" variant="secondary" icon={<PenLine size={16} color={colors.text} />} onPress={() => router.push({ pathname: "/review/[episodeId]", params: { episodeId } })} />
                    </Card>
                  ) : (
                    alone ? (
                      <Card glow style={{ gap: spacing.md, alignItems: "center" }}>
                        <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: colors.primarySoft, alignItems: "center", justifyContent: "center" }}>
                          <Users size={24} color={colors.primary} />
                        </View>
                        <AppText variant="h3" center>Les reviews se révèlent ensemble</AppText>
                        <AppText variant="bodyMuted" center>
                          Chacun écrit la sienne en secret, puis tout se dévoile d&apos;un coup… mais tu es seul(e) ici pour l&apos;instant. Invite ta bande pour jouer le jeu.
                        </AppText>
                        {isOwner(space?.membership) ? (
                          <Button title="Inviter mon groupe" icon={<UserPlus size={18} color={colors.primaryFg} />} onPress={() => router.push({ pathname: "/space-members/[spaceId]", params: { spaceId } })} fullWidth />
                        ) : null}
                        <Button
                          title="Écrire quand même"
                          variant={isOwner(space?.membership) ? "ghost" : "primary"}
                          onPress={() => router.push({ pathname: "/review/[episodeId]", params: { episodeId } })}
                          fullWidth
                        />
                      </Card>
                    ) : (
                    <Pulse>
                      <Card glow style={{ gap: spacing.md, alignItems: "center" }}>
                        <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: colors.primarySoft, alignItems: "center", justifyContent: "center" }}>
                          <PenLine size={24} color={colors.primary} />
                        </View>
                        <AppText variant="h3" center>Écris ta review en privé</AppText>
                        <AppText variant="bodyMuted" center>
                          {pendingCount === 1
                            ? "Ce que tu ressens, ta note, ta citation préférée. Tu es la dernière personne à répondre : ta review révèle celles de tout le monde."
                            : "Ce que tu ressens, ta note, ta citation préférée. Personne ne la verra tant que le groupe entier n'a pas publié la sienne."}
                        </AppText>
                        <Button title="Écrire ma review" onPress={() => router.push({ pathname: "/review/[episodeId]", params: { episodeId } })} fullWidth />
                      </Card>
                    </Pulse>
                    )
                  )
                ) : (
                  <Card style={{ flexDirection: "row", gap: 10, alignItems: "center" }}>
                    <Lock size={18} color={colors.textMuted} />
                    <AppText variant="bodyMuted" style={{ flex: 1 }}>
                      {isObserver
                        ? "En tant qu'observateur, tu ne rédiges pas de review. Tu pourras commenter l'épisode une fois que tout le groupe aura publié la sienne."
                        : "Tu pourras écrire ta review une fois promu."}
                    </AppText>
                  </Card>
                )}

                {/* Who answered — nothing to track with a single participant. */}
                {reviewers.length > 1 ? (
                  <Card style={{ gap: spacing.md }}>
                    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                      <AppText variant="overline">Qui a déjà répondu</AppText>
                      <AppText variant="caption">
                        {reviewers.length - pendingCount}/{reviewers.length}
                      </AppText>
                    </View>
                    {reviewers.map((member) => {
                      const answered = answeredIds.has(member.user_id);
                      return (
                        <View key={member.user_id} style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                          <Avatar profile={member.profile} size={30} />
                          <AppText style={{ flex: 1, fontWeight: "600", color: colors.text }}>{member.profile?.name ?? "Membre"}</AppText>
                          {answered ? (
                            <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
                              <CheckCircle2 size={16} color={colors.success} />
                              <AppText style={{ color: colors.success, fontWeight: "600", fontSize: 12.5 }}>A répondu</AppText>
                            </View>
                          ) : (
                            <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
                              <Hourglass size={15} color={colors.textFaint} />
                              <AppText style={{ color: colors.textFaint, fontWeight: "600", fontSize: 12.5 }}>En attente</AppText>
                            </View>
                          )}
                        </View>
                      );
                    })}
                    <AppText variant="caption">
                      {pendingCount === 0
                        ? "Tout le monde a répondu — la révélation arrive."
                        : pendingCount === 1
                        ? "Une review manque encore. La dernière publiée révèle toutes les autres."
                        : `${pendingCount} reviews manquent encore. La dernière publiée révèle toutes les autres.`}
                    </AppText>
                    {pendingCount > 0 && reviewers.length - pendingCount > 0 ? (
                      <AppText variant="caption">Les retardataires reçoivent deux rappels automatiques.</AppText>
                    ) : null}
                    {/* When someone will never write, the owner can open the episode
                        anyway rather than leave everyone else's reviews sealed. */}
                    {isOwner(space?.membership) && pendingCount > 0 && reviewers.length - pendingCount > 0 ? (
                      <Button
                        title="Révéler maintenant"
                        variant="secondary"
                        loading={revealNow.isPending}
                        onPress={() =>
                          confirmAction(
                            "Révéler cet épisode ?",
                            `Les reviews déjà écrites seront visibles par tout l'espace, même s'il en manque ${pendingCount}.`,
                            "Révéler",
                            () =>
                              revealNow.mutate(undefined, {
                                onSuccess: () => toast.success("Épisode révélé ✨"),
                                onError: (e) => toast.error(friendlyError(e)),
                              }),
                          )
                        }
                      />
                    ) : null}
                  </Card>
                ) : null}
              </>
            )}
          </View>

          <Divider />

          {/* Album — everything shot that day, cover included. Sits under the
              reviews so the top of the screen stays the poster. */}
          <View style={{ gap: spacing.md }}>
            <SectionHeader
              title={`Photos & vidéos${mediaCount > 0 ? ` · ${mediaCount}` : ""}`}
              subtitle="La couverture, elle, ne bouge plus"
            />
            <MediaGrid
              media={media}
              emptyLabel={uploading > 0 ? "" : "Aucune photo ni vidéo pour l'instant."}
              onDelete={canManage ? confirmDeleteMedia : undefined}
            />
            {participate ? (
              <Button
                title={mediaCount > 0 ? "Ajouter des photos ou vidéos" : "Ajouter les premières photos"}
                variant="secondary"
                icon={<ImagePlus size={18} color={colors.text} />}
                onPress={onAddMedia}
                fullWidth
                style={{ marginTop: spacing.xs }}
              />
            ) : null}
          </View>

          <Divider />

          {/* Comments */}
          <View style={{ gap: spacing.lg }}>
            <SectionHeader title={`Commentaires${commentCount > 0 ? ` · ${commentCount}` : ""}`} />

            {comments && comments.length > 0 ? (
              comments.map((c) => (
                <CommentItem
                  key={c.id}
                  comment={c}
                  rootId={c.id}
                  meId={userId}
                  people={people}
                  canReply={canComment}
                  canModerate={isOwner(space?.membership)}
                  onReact={(commentId, emoji, active) => {
                    if (toggleReaction.isPending) return;
                    toggleReaction.mutate({ commentId, emoji, active }, { onError: (e) => toast.error(friendlyError(e)) });
                  }}
                  onDelete={confirmDeleteComment}
                  onReply={startReply}
                />
              ))
            ) : (
              <AppText variant="bodyMuted">Sois le premier à réagir à ce moment.</AppText>
            )}

            {canComment ? (
              <View style={{ marginTop: spacing.sm }}>
                {replyTo ? (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: colors.surface, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: 8, marginBottom: spacing.sm }}>
                    <CornerDownRight size={14} color={colors.primary} />
                    <AppText variant="caption" style={{ flex: 1 }}>
                      Réponse à {replyTo.name}
                    </AppText>
                    <TouchableOpacity onPress={cancelReply} hitSlop={10} accessibilityRole="button" accessibilityLabel="Annuler la réponse">
                      <X size={14} color={colors.textMuted} />
                    </TouchableOpacity>
                  </View>
                ) : null}

                {/* The composer and its floating "@" list share this box so the
                    list can sit exactly on top of the input, whatever height the
                    text has grown to. */}
                <View>
                  {suggestions.length > 0 ? (
                    <View
                      style={{
                        position: "absolute",
                        left: 0,
                        right: 0,
                        bottom: "100%",
                        marginBottom: 8,
                        zIndex: 30,
                        elevation: 12,
                        backgroundColor: colors.cardElevated,
                        borderRadius: radius.lg,
                        borderWidth: 1,
                        borderColor: colors.borderStrong,
                        overflow: "hidden",
                      }}
                    >
                      {suggestions.map((person, i) => (
                        <TouchableOpacity
                          key={person.id}
                          onPress={() => chooseMention(person)}
                          style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingHorizontal: spacing.md, paddingVertical: 9, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: colors.border }}
                          accessibilityRole="button"
                          accessibilityLabel={`Mentionner ${person.name}`}
                        >
                          <Avatar profile={person.profile} size={26} />
                          <AppText style={{ flex: 1, fontSize: 14, fontWeight: "600", color: colors.text }} numberOfLines={1}>
                            {person.name}
                          </AppText>
                          <RoleBadge role={person.role} />
                        </TouchableOpacity>
                      ))}
                    </View>
                  ) : null}

                  <View style={{ flexDirection: "row", alignItems: "flex-end", gap: spacing.sm }}>
                    <TextInput
                      ref={draftGrow.ref}
                      value={draft}
                      onChangeText={onChangeDraft}
                      onSelectionChange={(e) => setCaret(e.nativeEvent.selection.end)}
                      placeholder={replyTo ? `Répondre à ${replyTo.name}…` : "Ajouter un commentaire… (@ pour mentionner)"}
                      placeholderTextColor={colors.textFaint}
                      onSubmitEditing={onSendComment}
                      onFocus={() => setDraftFocused(true)}
                      onBlur={() => setDraftFocused(false)}
                      onContentSizeChange={draftGrow.onContentSizeChange}
                      returnKeyType="send"
                      multiline
                      textAlignVertical="top"
                      style={[{ flex: 1, color: colors.text, fontSize: 15, backgroundColor: colors.bgElevated, borderRadius: radius.xl, borderWidth: 1.5, borderColor: replyTo ? colors.primary : draftFocused ? colors.focus : colors.border, paddingHorizontal: spacing.lg, paddingTop: 12, paddingBottom: 12, minHeight: draftGrow.minHeight, height: draftGrow.height }, noWebOutline]}
                    />
                    <IconButton icon={<Send size={18} color={colors.primaryFg} />} variant="primary" onPress={onSendComment} accessibilityLabel="Envoyer le commentaire" />
                  </View>
                </View>
              </View>
            ) : isObserver ? (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: spacing.sm }}>
                <Sparkles size={15} color={colors.textFaint} />
                <AppText variant="caption" style={{ flex: 1 }}>
                  {pendingCount === 1
                    ? "Il manque encore une review : dès qu'elle arrive, tu pourras commenter. En attendant, tu peux réagir aux commentaires existants."
                    : pendingCount > 1
                    ? `Il manque encore ${pendingCount} reviews : dès que le groupe a terminé, tu pourras commenter. En attendant, tu peux réagir aux commentaires existants.`
                    : "Tu pourras commenter dès que le groupe aura publié ses reviews. En attendant, tu peux réagir aux commentaires existants."}
                </AppText>
              </View>
            ) : null}
          </View>

          {canManage ? (
            <>
              <Divider />
              <Button
                title="Supprimer l'épisode"
                variant="destructive"
                icon={<Trash2 size={17} color="#fff" />}
                onPress={confirmDeleteEpisode}
                loading={deleteEpisode.isPending}
                fullWidth
              />
            </>
          ) : null}
        </View>
      </ScrollView>

      <CoverAdjustModal
        asset={pendingCover}
        onCancel={() => setPendingCover(null)}
        onDone={onCoverAdjusted}
      />
    </View>
  );
}

