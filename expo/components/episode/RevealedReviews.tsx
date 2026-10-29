import { Music } from "lucide-react-native";
import React, { useMemo, useState } from "react";
import { View } from "react-native";
import { ReviewContentRows } from "@/components/episode/ReviewContentRows";
import { RatingStars } from "@/components/RatingStars";
import { Avatar } from "@/components/ui/Avatar";
import { Card } from "@/components/ui/Card";
import { SegmentedToggle } from "@/components/ui/SegmentedToggle";
import { AppText } from "@/components/ui/Text";
import { colors, spacing } from "@/constants/theme";
import type { Profile, Review, SpaceMember } from "@/lib/types";

type ReviewsView = "question" | "person";

type Reviewer = Pick<SpaceMember, "user_id"> & { profile?: Profile | null };

const QUESTIONS: { key: "favorite_moment" | "awkward_moment" | "funny_quote" | "summary"; title: string }[] = [
  { key: "favorite_moment", title: "Moments préférés" },
  { key: "awkward_moment", title: "Moments gênants" },
  { key: "funny_quote", title: "Citations" },
  { key: "summary", title: "Résumés" },
];

const nameOf = (r: Reviewer) => r.profile?.name?.trim() || "Membre";

/** People type their own « » or "" around a quote; the screen adds them once. */
const unquote = (q: string) => q.trim().replace(/^[«"“\s]+|[»"”\s]+$/g, "");

/** 4.2 → "4,2": a French screen. */
const decimal = (n: number) => (Math.round(n * 10) / 10).toLocaleString("fr-FR", { maximumFractionDigits: 1 });

function Answer({ who, children }: { who: Reviewer; children: React.ReactNode }) {
  return (
    <View style={{ flexDirection: "row", gap: 10, alignItems: "flex-start" }}>
      <Avatar profile={who.profile} size={28} />
      <View style={{ flex: 1, gap: 2 }}>
        <AppText variant="caption">{nameOf(who)}</AppText>
        {children}
      </View>
    </View>
  );
}

/**
 * The revealed reviews, grouped by question by default: everyone's favourite
 * moment side by side is where the reveal gets funny. "Par personne" keeps
 * the former one-card-per-member view. Works from rows the screen has already
 * loaded; nothing extra is fetched.
 */
export function RevealedReviews({ reviewers, reviews }: { reviewers: Reviewer[]; reviews: Review[] }) {
  const [view, setView] = useState<ReviewsView>("question");

  const byAuthor = useMemo(() => new Map(reviews.map((r) => [r.author_id, r])), [reviews]);
  const written = reviewers.filter((m) => byAuthor.has(m.user_id));
  const silent = reviewers.filter((m) => !byAuthor.has(m.user_id));

  // A rating of 0 means "not rated", not "zero stars".
  const rated = written
    .map((m) => ({ who: m, rating: byAuthor.get(m.user_id)?.rating ?? 0 }))
    .filter((x) => x.rating > 0);
  const ratings = rated.map((x) => x.rating);
  const average = ratings.length ? ratings.reduce((a, b) => a + b, 0) / ratings.length : null;

  return (
    <View style={{ gap: spacing.md }}>
      <View style={{ alignItems: "flex-start" }}>
        <SegmentedToggle<ReviewsView>
          options={[
            { value: "question", label: "Par question" },
            { value: "person", label: "Par personne" },
          ]}
          value={view}
          onChange={setView}
        />
      </View>

      {view === "person" ? (
        reviewers.map((member) => {
          const review = byAuthor.get(member.user_id);
          return (
            <Card key={member.user_id} style={{ gap: spacing.md }}>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                  <Avatar profile={member.profile} size={36} />
                  <AppText variant="h3">{nameOf(member)}</AppText>
                </View>
                {review?.rating ? <RatingStars value={review.rating} size={16} /> : null}
              </View>
              {review ? <ReviewContentRows review={review} /> : <AppText variant="bodyMuted">N&apos;a pas rédigé de review.</AppText>}
            </Card>
          );
        })
      ) : (
        <>
          {average !== null ? (
            <Card style={{ gap: spacing.md }}>
              <AppText variant="overline">Note du groupe</AppText>
              <View style={{ flexDirection: "row", alignItems: "baseline", gap: spacing.sm }}>
                <AppText style={{ fontSize: 34, fontWeight: "800", color: colors.text, letterSpacing: -1 }}>{decimal(average)}</AppText>
                {/* A text star: an SVG on a baseline row froze Chrome while painting. */}
                <AppText style={{ fontSize: 24, fontWeight: "800", color: colors.accent }}>★</AppText>
                {ratings.length > 1 && Math.min(...ratings) !== Math.max(...ratings) ? (
                  <AppText variant="bodyMuted">
                    de {Math.min(...ratings)} à {Math.max(...ratings)}
                  </AppText>
                ) : null}
              </View>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.lg }}>
                {rated.map(({ who, rating }) => (
                  <View key={who.user_id} style={{ alignItems: "center", gap: 4 }} accessible accessibilityLabel={`${nameOf(who)} : ${rating} sur 5`}>
                    <Avatar profile={who.profile} size={34} />
                    <AppText style={{ fontWeight: "700", fontSize: 13, color: colors.text }}>{rating} ★</AppText>
                  </View>
                ))}
              </View>
            </Card>
          ) : null}

          {QUESTIONS.map((q) => {
            const answers = written
              .map((m) => ({ who: m, text: byAuthor.get(m.user_id)?.[q.key]?.trim() }))
              .filter((a): a is { who: Reviewer; text: string } => !!a.text);
            if (answers.length === 0) return null;
            const isQuote = q.key === "funny_quote";
            return (
              <Card key={q.key} style={{ gap: spacing.md }}>
                <AppText variant="overline">{q.title}</AppText>
                {answers.map(({ who, text }) => (
                  <Answer key={who.user_id} who={who}>
                    {isQuote ? (
                      <AppText style={{ fontSize: 18, lineHeight: 25, fontWeight: "700", fontStyle: "italic", color: colors.text }}>
                        « {unquote(text)} »
                      </AppText>
                    ) : (
                      <AppText variant="body">{text}</AppText>
                    )}
                  </Answer>
                ))}
              </Card>
            );
          })}

          {written.some((m) => byAuthor.get(m.user_id)?.song) ? (
            <Card style={{ gap: spacing.md }}>
              <AppText variant="overline">Chansons</AppText>
              {written
                .filter((m) => byAuthor.get(m.user_id)?.song)
                .map((m) => (
                  <Answer key={m.user_id} who={m}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                      <Music size={14} color={colors.accent} />
                      <AppText style={{ flex: 1, color: colors.accent, fontWeight: "600", fontSize: 14 }} numberOfLines={2}>
                        {byAuthor.get(m.user_id)?.song}
                      </AppText>
                    </View>
                  </Answer>
                ))}
            </Card>
          ) : null}

          {silent.length > 0 ? (
            <AppText variant="caption">Pas de review : {silent.map(nameOf).join(", ")}</AppText>
          ) : null}
        </>
      )}
    </View>
  );
}
