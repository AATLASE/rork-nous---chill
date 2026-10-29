import { CornerDownRight, SmilePlus, Trash2 } from "lucide-react-native";
import { useMemo, useState } from "react";
import { TouchableOpacity, View } from "react-native";
import { Avatar } from "@/components/ui/Avatar";
import { PressableScale } from "@/components/ui/motion";
import { AppText } from "@/components/ui/Text";
import { colors, radius, spacing } from "@/constants/theme";
import { formatRelative } from "@/lib/format";
import { splitMentions, type MentionCandidate } from "@/lib/mentions";
import { type EpisodeComment } from "@/lib/types";

const REACTION_EMOJIS = ["❤️", "😂", "😮", "🔥", "🥹", "👏"];

/**
 * A comment body with its "@quelqu'un" picked out of the sentence. The names
 * come from the space's members, so a stray "@quelquechose" stays plain text
 * instead of pretending to be somebody.
 */
function CommentBody({ body, people }: { body: string; people: MentionCandidate[] }) {
  const parts = useMemo(() => splitMentions(body, people), [body, people]);
  return (
    <AppText variant="body">
      {parts.map((part, i) =>
        part.mention ? (
          <AppText key={i} style={{ color: colors.primary, fontWeight: "700" }}>
            {part.text}
          </AppText>
        ) : (
          part.text
        )
      )}
    </AppText>
  );
}

export function CommentItem({
  comment,
  rootId,
  meId,
  people,
  canReply,
  canModerate,
  isReply = false,
  onReact,
  onDelete,
  onReply,
}: {
  comment: EpisodeComment;
  /** The comment a "Répondre" here should hang under: threads stay one deep. */
  rootId: string;
  meId: string | null;
  people: MentionCandidate[];
  canReply: boolean;
  /** The space owner can remove anyone's comment (the database already allows it). */
  canModerate: boolean;
  isReply?: boolean;
  onReact: (commentId: string, emoji: string, active: boolean) => void;
  onDelete: (commentId: string) => void;
  onReply: (rootId: string, authorName: string) => void;
}) {
  const grouped = useMemo(() => {
    const map: Record<string, { count: number; mine: boolean }> = {};
    for (const r of comment.reactions ?? []) {
      if (!map[r.emoji]) map[r.emoji] = { count: 0, mine: false };
      map[r.emoji].count += 1;
      if (r.user_id === meId) map[r.emoji].mine = true;
    }
    return map;
  }, [comment.reactions, meId]);

  const [showPicker, setShowPicker] = useState<boolean>(false);
  const authorName = comment.profile?.name ?? "Membre";
  const canDelete = comment.author_id === meId || canModerate;
  const replies = comment.replies ?? [];

  return (
    <View style={{ gap: spacing.md }}>
      <View style={{ flexDirection: "row", gap: spacing.md }}>
        <Avatar profile={comment.profile} size={isReply ? 28 : 36} />
        <View style={{ flex: 1, gap: 6 }}>
          <View style={{ backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.md, gap: 3 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <AppText style={{ fontWeight: "700", fontSize: 13.5, color: colors.text }}>{authorName}</AppText>
              <AppText variant="caption">{formatRelative(comment.created_at)}</AppText>
            </View>
            <CommentBody body={comment.body} people={people} />
          </View>

          <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            {Object.entries(grouped).map(([emoji, info]) => (
              <PressableScale key={emoji} onPress={() => onReact(comment.id, emoji, info.mine)} withHaptic style={{ flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 9, paddingVertical: 4, borderRadius: radius.pill, backgroundColor: info.mine ? colors.primarySoft : colors.surface, borderWidth: info.mine ? 1 : 0, borderColor: colors.primary }}>
                <AppText style={{ fontSize: 13 }}>{emoji}</AppText>
                <AppText style={{ fontSize: 12, fontWeight: "700", color: info.mine ? colors.primary : colors.textMuted }}>{info.count}</AppText>
              </PressableScale>
            ))}
            {/* A smiley rather than a bare "+": the plus said "add something", the
                face says what. Same faint grey as before — it stays an aside next
                to the reactions people actually left. */}
            <TouchableOpacity
              onPress={() => setShowPicker((v) => !v)}
              hitSlop={8}
              style={{ paddingHorizontal: 8, paddingVertical: 4 }}
              accessibilityRole="button"
              accessibilityLabel="Ajouter une réaction"
              accessibilityState={{ expanded: showPicker }}
            >
              <SmilePlus size={16} color={colors.textFaint} />
            </TouchableOpacity>
            {canReply ? (
              <TouchableOpacity
                onPress={() => onReply(rootId, authorName)}
                hitSlop={8}
                style={{ flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 4, paddingVertical: 4 }}
                accessibilityRole="button"
                accessibilityLabel={`Répondre à ${authorName}`}
              >
                <CornerDownRight size={13} color={colors.textFaint} />
                <AppText style={{ fontSize: 12, fontWeight: "700", color: colors.textMuted }}>Répondre</AppText>
              </TouchableOpacity>
            ) : null}
            {canDelete ? (
              <TouchableOpacity onPress={() => onDelete(comment.id)} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Supprimer le commentaire de ${authorName}`} style={{ paddingHorizontal: 4, paddingVertical: 4 }}>
                <Trash2 size={14} color={colors.textFaint} />
              </TouchableOpacity>
            ) : null}
          </View>

          {showPicker ? (
            <View style={{ flexDirection: "row", gap: 4, backgroundColor: colors.cardElevated, borderRadius: radius.pill, padding: 6, alignSelf: "flex-start", borderWidth: 1, borderColor: colors.border }}>
              {REACTION_EMOJIS.map((emoji) => (
                <TouchableOpacity
                  key={emoji}
                  onPress={() => {
                    onReact(comment.id, emoji, grouped[emoji]?.mine ?? false);
                    setShowPicker(false);
                  }}
                  style={{ padding: 4 }}
                >
                  <AppText style={{ fontSize: 19 }}>{emoji}</AppText>
                </TouchableOpacity>
              ))}
            </View>
          ) : null}
        </View>
      </View>

      {/* Answers, indented under the comment they answer. The rail on the left
          is what carries the nesting — a second one under it would only make
          the conversation narrower with every reply, so replies to a reply go
          back onto this same level. */}
      {replies.length > 0 ? (
        <View style={{ marginLeft: 18, paddingLeft: spacing.md, borderLeftWidth: 1, borderLeftColor: colors.border, gap: spacing.md }}>
          {replies.map((reply) => (
            <CommentItem
              key={reply.id}
              comment={reply}
              rootId={rootId}
              meId={meId}
              people={people}
              canReply={canReply}
              canModerate={canModerate}
              isReply
              onReact={onReact}
              onDelete={onDelete}
              onReply={onReply}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}
