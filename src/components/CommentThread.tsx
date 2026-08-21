import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleProp, StyleSheet, Text, TextInput, View, ViewStyle } from "react-native";
import { Maximize2, Minimize2, SmilePlus } from "lucide-react-native";
import { useAuth } from "../auth/AuthContext";
import {
  createComment,
  loadCommentThread,
  setCommentReaction,
  softDeleteComment,
  subscribeToCommentThread,
} from "../collaboration/comments";
import { emojiCategories } from "../data/emojiPalette";
import { getSupabase } from "../lib/supabase";
import { spacing, ThemeColors } from "../theme/theme";
import { useThemeColors } from "../theme/ThemeContext";
import type { CommentAuthor, CommentReactionType, CommentTargetType, TroveComment } from "../types/models";
import { MediaImage } from "./MediaImage";

type Props = {
  targetId: string;
  targetType: CommentTargetType;
  hideHeader?: boolean;
  style?: StyleProp<ViewStyle>;
};

type ComposerProps = {
  autoFocus?: boolean;
  disabled?: boolean;
  onCancel?: () => void;
  onSubmit: (body: string) => Promise<void>;
  placeholder: string;
};

const legacyReactionEmoji: Record<string, string> = {
  done: "✅",
  like: "👍",
  love: "❤️",
  seen: "👀",
};

const authorName = (comment: TroveComment): string =>
  comment.author?.displayName || comment.author?.email || "Someone";

const timestamp = (value: string): string =>
  new Date(value).toLocaleString(undefined, {
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    month: "short",
  });

const reactionDisplay = (reaction: CommentReactionType): string =>
  legacyReactionEmoji[reaction] ?? reaction;

const initialsForAuthor = (author: CommentAuthor): string => {
  const label = author.displayName || author.email || "Someone";
  const parts = label.split(/[ @._-]+/).filter(Boolean);
  return (parts[0]?.[0] ?? "S").concat(parts[1]?.[0] ?? "").toUpperCase();
};

const CommentComposer = ({
  autoFocus = false,
  disabled = false,
  onCancel,
  onSubmit,
  placeholder,
}: ComposerProps) => {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [body, setBody] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const canSubmit = body.trim().length > 0 && !disabled && !isSubmitting;

  const submit = useCallback(async () => {
    if (!canSubmit) return;
    setIsSubmitting(true);
    try {
      await onSubmit(body);
      setBody("");
    } finally {
      setIsSubmitting(false);
    }
  }, [body, canSubmit, onSubmit]);

  return (
    <View style={styles.composer}>
      <TextInput
        accessibilityLabel={placeholder}
        autoFocus={autoFocus}
        editable={!disabled && !isSubmitting}
        multiline
        onChangeText={setBody}
        placeholder={placeholder}
        placeholderTextColor={colors.muted}
        style={styles.input}
        value={body}
      />
      <View style={styles.composerActions}>
        {!!onCancel && (
          <Pressable onPress={onCancel} style={({ pressed }) => [styles.textButton, pressed && styles.pressed]}>
            <Text style={styles.textButtonLabel}>Cancel</Text>
          </Pressable>
        )}
        <Pressable
          disabled={!canSubmit}
          onPress={submit}
          style={({ pressed }) => [
            styles.submitButton,
            pressed && canSubmit && styles.pressed,
            !canSubmit && styles.disabled,
          ]}
        >
          <Text style={styles.submitButtonLabel}>{isSubmitting ? "Posting" : "Post"}</Text>
        </Pressable>
      </View>
    </View>
  );
};

type CommentRowProps = {
  comment: TroveComment;
  currentUserId: string;
  isReply?: boolean;
  onDelete: (commentId: string) => void;
  onReply: (commentId: string) => void;
  onToggleReaction: (commentId: string, reaction: CommentReactionType, shouldReact: boolean) => void;
};

type EmojiReactionPickerProps = {
  comment: TroveComment;
  onSelectReaction: (reaction: CommentReactionType) => void;
};

type ReactionRosterSheetProps = {
  comment: TroveComment;
  onClose: () => void;
};

const categoryNavGlyphs: Record<string, string> = {
  activity: "🏈",
  flags: "🏳️",
  food: "🍔",
  nature: "🍃",
  objects: "💡",
  people: "😀",
  recent: "◷",
  smileys: "☺",
  symbols: "☮",
  travel: "✈",
};

const collapsedCategoryLimit = 56;
const doubleTapWindowMs = 280;
const heartReaction = "❤️";

const EmojiReactionPicker = ({ comment, onSelectReaction }: EmojiReactionPickerProps) => {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const scrollRef = useRef<ScrollView>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const [hasHydratedFullPicker, setHasHydratedFullPicker] = useState(false);
  const [sectionOffsets, setSectionOffsets] = useState<Record<string, number>>({});
  const reactionByDisplay = useMemo(
    () =>
      new Map(
        comment.reactions.map((reaction) => [
          reactionDisplay(reaction.type),
          reaction,
        ]),
      ),
    [comment.reactions],
  );
  const visibleEmojiCategories = useMemo(() => {
    if (isExpanded || hasHydratedFullPicker) {
      return emojiCategories;
    }

    return emojiCategories.map((category) => ({
      ...category,
      emoji: category.emoji.slice(0, category.key === "recent" ? category.emoji.length : collapsedCategoryLimit),
    }));
  }, [hasHydratedFullPicker, isExpanded]);

  useEffect(() => {
    if (isExpanded) {
      setHasHydratedFullPicker(true);
    }
  }, [isExpanded]);

  const scrollToSection = useCallback(
    (categoryKey: string) => {
      if (!hasHydratedFullPicker) {
        setHasHydratedFullPicker(true);
      }

      scrollRef.current?.scrollTo({
        animated: true,
        y: Math.max((sectionOffsets[categoryKey] ?? 0) - spacing.sm, 0),
      });
    },
    [hasHydratedFullPicker, sectionOffsets],
  );

  return (
    <View style={[styles.reactionPicker, isExpanded && styles.reactionPickerExpanded]}>
      <Pressable
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        onPress={() => setIsExpanded((current) => !current)}
        style={({ pressed }) => [styles.reactionPickerHandleButton, pressed && styles.pressed]}
      >
        <View style={styles.reactionPickerHandle} />
      </Pressable>

      <View style={styles.reactionPickerHeader}>
        <Pressable
          accessibilityLabel={isExpanded ? "Collapse emoji picker" : "Expand emoji picker"}
          accessibilityRole="button"
          hitSlop={8}
          onPress={() => setIsExpanded((current) => !current)}
          style={({ pressed }) => [styles.reactionPickerSizeButton, pressed && styles.pressed]}
        >
          {isExpanded ? (
            <Minimize2 color={colors.muted} size={18} strokeWidth={2.6} />
          ) : (
            <Maximize2 color={colors.muted} size={18} strokeWidth={2.6} />
          )}
        </Pressable>
      </View>

      <ScrollView
        ref={scrollRef}
        nestedScrollEnabled
        showsVerticalScrollIndicator
        style={[styles.reactionEmojiScroll, isExpanded && styles.reactionEmojiScrollExpanded]}
        contentContainerStyle={styles.reactionEmojiScrollContent}
      >
        {visibleEmojiCategories.map((category) => (
          <View
            key={category.key}
            onLayout={(event) => {
              const offset = event.nativeEvent.layout.y;
              setSectionOffsets((current) =>
                current[category.key] === offset ? current : { ...current, [category.key]: offset },
              );
            }}
            style={styles.reactionEmojiSection}
          >
            <Text style={styles.reactionEmojiSectionTitle}>{category.label}</Text>
            <View style={styles.reactionEmojiGrid}>
              {category.emoji.map((reactionType) => {
                const existingReaction = reactionByDisplay.get(reactionType);
                const reactedByMe = !!existingReaction?.reactedByMe;
                return (
                  <Pressable
                    key={reactionType}
                    accessibilityLabel={reactedByMe ? `Remove ${reactionType} reaction` : `React with ${reactionType}`}
                    onPress={() => onSelectReaction(reactionType)}
                    style={({ pressed }) => [
                      styles.reactionPickerButton,
                      reactedByMe && styles.reactionPickerButtonSelected,
                      pressed && styles.pressed,
                    ]}
                  >
                    <Text style={styles.reactionPickerGlyph}>{reactionType}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        ))}
      </ScrollView>

      <View style={styles.reactionNavBar}>
        {emojiCategories.map((category) => (
          <Pressable
            key={category.key}
            accessibilityLabel={`Jump to ${category.label}`}
            onPress={() => scrollToSection(category.key)}
            style={({ pressed }) => [styles.reactionNavButton, pressed && styles.pressed]}
          >
            <Text style={styles.reactionNavGlyph}>{categoryNavGlyphs[category.key] ?? "•"}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
};

const ReactionRosterSheet = ({ comment, onClose }: ReactionRosterSheetProps) => {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [selectedFilter, setSelectedFilter] = useState<CommentReactionType | null>(null);
  const reactionCounts = comment.reactions.filter((reaction) => reaction.count > 0);
  const visibleDetails = selectedFilter
    ? comment.reactionDetails.filter((detail) => detail.reaction === selectedFilter)
    : comment.reactionDetails;

  return (
    <View style={styles.reactionRosterSheet}>
      <Pressable
        accessibilityLabel="Close reactions"
        onPress={onClose}
        style={({ pressed }) => [styles.reactionRosterHandleButton, pressed && styles.pressed]}
      >
        <View style={styles.reactionPickerHandle} />
      </Pressable>
      <Text style={styles.reactionRosterTitle}>
        Reactions ({selectedFilter ? visibleDetails.length : comment.reactionDetails.length})
      </Text>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.reactionRosterFilters}>
        <Pressable
          onPress={() => setSelectedFilter(null)}
          style={({ pressed }) => [
            styles.reactionRosterFilter,
            selectedFilter === null && styles.reactionRosterFilterSelected,
            pressed && styles.pressed,
          ]}
        >
          <Text style={[styles.reactionRosterFilterText, selectedFilter === null && styles.reactionRosterFilterTextSelected]}>
            All
          </Text>
        </Pressable>
        {reactionCounts.map((reaction) => {
          const isSelected = selectedFilter === reaction.type;
          return (
            <Pressable
              key={reaction.type}
              onPress={() => setSelectedFilter(reaction.type)}
              style={({ pressed }) => [
                styles.reactionRosterFilter,
                isSelected && styles.reactionRosterFilterSelected,
                pressed && styles.pressed,
              ]}
            >
              <Text style={[styles.reactionRosterFilterText, isSelected && styles.reactionRosterFilterTextSelected]}>
                {reactionDisplay(reaction.type)} {reaction.count}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <ScrollView nestedScrollEnabled style={styles.reactionRosterList}>
        {visibleDetails.map((detail) => (
          <View key={`${detail.userId}:${detail.reaction}`} style={styles.reactionRosterRow}>
            {detail.user.avatarUrl ? (
              <MediaImage
                source={{ uri: detail.user.avatarUrl }}
                skeletonRadius={16}
                style={styles.reactionRosterAvatar}
                accessibilityLabel={`${detail.user.displayName || detail.user.email || "Someone"}'s profile photo`}
              />
            ) : (
              <View style={styles.reactionRosterAvatarFallback}>
                <Text style={styles.reactionRosterAvatarText}>{initialsForAuthor(detail.user)}</Text>
              </View>
            )}
            <Text numberOfLines={1} style={styles.reactionRosterName}>
              {detail.user.displayName || detail.user.email || "Someone"}
            </Text>
            <Text style={styles.reactionRosterReaction}>{reactionDisplay(detail.reaction)}</Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
};

const CommentRow = ({
  comment,
  currentUserId,
  isReply = false,
  onDelete,
  onReply,
  onToggleReaction,
}: CommentRowProps) => {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const isOwnComment = comment.authorId === currentUserId;
  const isDeleted = !!comment.deletedAt;
  const [isReactionPickerOpen, setIsReactionPickerOpen] = useState(false);
  const [reactionRosterFilter, setReactionRosterFilter] = useState<CommentReactionType | null>(null);
  const lastCommentPressAtRef = useRef(0);
  const longPressedReactionRef = useRef<CommentReactionType | null>(null);
  const visibleReactions = comment.reactions.filter((reaction) => reaction.count > 0);

  const toggleReaction = useCallback(
    (reaction: CommentReactionType, reactedByMe: boolean) => {
      onToggleReaction(comment.id, reaction, !reactedByMe);
    },
    [comment.id, onToggleReaction],
  );

  const selectReaction = useCallback(
    (reactionType: CommentReactionType) => {
      const existingReaction = comment.reactions.find((reaction) => reactionDisplay(reaction.type) === reactionType);
      onToggleReaction(comment.id, existingReaction?.type ?? reactionType, !existingReaction?.reactedByMe);
      setIsReactionPickerOpen(false);
    },
    [comment.id, comment.reactions, onToggleReaction],
  );

  const openReactionRoster = useCallback((reactionType: CommentReactionType | null) => {
    longPressedReactionRef.current = reactionType;
    setIsReactionPickerOpen(false);
    setReactionRosterFilter(reactionType);
  }, []);

  const onPressCommentContent = useCallback(() => {
    const now = Date.now();
    const isDoubleTap = now - lastCommentPressAtRef.current <= doubleTapWindowMs;
    lastCommentPressAtRef.current = now;

    if (!isDoubleTap) return;

    const existingHeartReaction = comment.reactions.find((reaction) => reactionDisplay(reaction.type) === heartReaction);
    if (existingHeartReaction?.reactedByMe) return;

    onToggleReaction(comment.id, existingHeartReaction?.type ?? heartReaction, true);
    setIsReactionPickerOpen(false);
  }, [comment.id, comment.reactions, onToggleReaction]);

  return (
    <View style={[styles.comment, isReply && styles.reply]}>
      <Pressable
        disabled={isDeleted}
        onPress={onPressCommentContent}
        style={({ pressed }) => pressed && !isDeleted && styles.commentContentPressed}
      >
        <View style={styles.commentHeader}>
          <Text style={styles.commentAuthor}>{isDeleted ? "Deleted comment" : authorName(comment)}</Text>
          <Text style={styles.commentDate}>{timestamp(comment.createdAt)}</Text>
        </View>
        <Text style={[styles.commentBody, isDeleted && styles.deletedBody]}>
          {isDeleted ? "This comment was deleted." : comment.body}
        </Text>
      </Pressable>
      {!isDeleted && (
        <>
          {visibleReactions.length > 0 && (
            <View style={styles.reactionSummary}>
              {visibleReactions.map((reaction) => (
                <Pressable
                  key={reaction.type}
                  accessibilityLabel={`${reactionDisplay(reaction.type)} reaction: ${reaction.count}`}
                  delayLongPress={240}
                  onPress={() => {
                    if (longPressedReactionRef.current === reaction.type) {
                      longPressedReactionRef.current = null;
                      return;
                    }
                    toggleReaction(reaction.type, reaction.reactedByMe);
                  }}
                  onLongPress={() => openReactionRoster(reaction.type)}
                  style={({ pressed }) => [
                    styles.reactionChip,
                    reaction.reactedByMe && styles.reactionChipSelected,
                    pressed && styles.pressed,
                  ]}
                >
                  <Text style={styles.reactionGlyph}>{reactionDisplay(reaction.type)}</Text>
                  <Text style={[styles.reactionChipText, reaction.reactedByMe && styles.reactionChipTextSelected]}>
                    {reaction.count}
                  </Text>
                </Pressable>
              ))}
            </View>
          )}

          <View style={styles.commentActions}>
            <Pressable
              accessibilityRole="button"
              hitSlop={8}
              onPress={() => setIsReactionPickerOpen((current) => !current)}
              style={({ pressed }) => [styles.actionButton, isReactionPickerOpen && styles.actionButtonActive, pressed && styles.pressed]}
            >
              <SmilePlus color={isReactionPickerOpen ? colors.accentDark : colors.muted} size={16} strokeWidth={2.6} />
              <Text style={[styles.actionText, isReactionPickerOpen && styles.actionTextActive]}>React</Text>
            </Pressable>

            {!isReply && (
              <Pressable onPress={() => onReply(comment.id)} style={({ pressed }) => [styles.textButton, pressed && styles.pressed]}>
                <Text style={styles.textButtonLabel}>Reply</Text>
              </Pressable>
            )}
            {isOwnComment && (
              <Pressable onPress={() => onDelete(comment.id)} style={({ pressed }) => [styles.textButton, pressed && styles.pressed]}>
                <Text style={[styles.textButtonLabel, styles.deleteLabel]}>Delete</Text>
              </Pressable>
            )}
          </View>

          {isReactionPickerOpen && (
            <EmojiReactionPicker comment={comment} onSelectReaction={selectReaction} />
          )}

          {reactionRosterFilter !== null && (
            <ReactionRosterSheet
              comment={comment}
              onClose={() => setReactionRosterFilter(null)}
            />
          )}
        </>
      )}
    </View>
  );
};

export const CommentThread = ({ targetId, targetType, hideHeader = false, style }: Props) => {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { session } = useAuth();
  const [comments, setComments] = useState<TroveComment[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [replyingToCommentId, setReplyingToCommentId] = useState<string | null>(null);
  const supabase = getSupabase();
  const currentUserId = session?.user.id ?? null;

  const reload = useCallback(async () => {
    if (!supabase || !currentUserId) {
      setComments([]);
      setIsLoading(false);
      return;
    }

    const result = await loadCommentThread(supabase, {
      currentUserId,
      targetId,
      targetType,
    });
    setComments(result.comments);
    setError(result.error ?? null);
    setIsLoading(false);
  }, [currentUserId, supabase, targetId, targetType]);

  useEffect(() => {
    setIsLoading(true);
    void reload();
  }, [reload]);

  useEffect(() => {
    if (!supabase || !currentUserId) return;

    const channel = subscribeToCommentThread(supabase, {
      onChange: () => void reload(),
      targetId,
      targetType,
    });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [currentUserId, reload, supabase, targetId, targetType]);

  const repliesByParentId = useMemo(() => {
    const grouped = new Map<string, TroveComment[]>();
    comments
      .filter((comment) => comment.parentCommentId)
      .forEach((reply) => {
        const parentId = reply.parentCommentId;
        if (!parentId) return;
        grouped.set(parentId, [...(grouped.get(parentId) ?? []), reply]);
      });
    return grouped;
  }, [comments]);

  const topLevelComments = useMemo(
    () => comments.filter((comment) => !comment.parentCommentId),
    [comments],
  );

  const submitComment = useCallback(
    async (body: string, parentCommentId?: string | null) => {
      if (!supabase || !currentUserId) return;
      const result = await createComment(supabase, {
        authorId: currentUserId,
        body,
        parentCommentId,
        targetId,
        targetType,
      });

      if (result.error) {
        Alert.alert("Could not post comment", result.error);
        return;
      }

      setReplyingToCommentId(null);
      await reload();
    },
    [currentUserId, reload, supabase, targetId, targetType],
  );

  const onDelete = useCallback(
    (commentId: string): void => {
      if (!supabase) return;
      Alert.alert("Delete comment?", "Replies and reactions will stay visible.", [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            void (async () => {
              const result = await softDeleteComment(supabase, commentId);
              if (result.error) {
                Alert.alert("Could not delete comment", result.error);
                return;
              }
              await reload();
            })();
          },
        },
      ]);
    },
    [reload, supabase],
  );

  const onToggleReaction = useCallback(
    (commentId: string, reaction: CommentReactionType, shouldReact: boolean): void => {
      if (!supabase || !currentUserId) return;
      void (async () => {
        const result = await setCommentReaction(supabase, {
          commentId,
          reaction,
          shouldReact,
          userId: currentUserId,
        });
        if (result.error) {
          Alert.alert("Could not update reaction", result.error);
          return;
        }
        await reload();
      })();
    },
    [currentUserId, reload, supabase],
  );

  return (
    <View style={[styles.thread, style]}>
      {!hideHeader && (
        <View style={styles.header}>
          <Text style={styles.title}>Comments</Text>
          <Text style={styles.count}>{comments.length}</Text>
        </View>
      )}

      {!supabase || !currentUserId ? (
        <Text style={styles.notice}>Sign in to view and join the discussion.</Text>
      ) : (
        <>
          <CommentComposer
            disabled={isLoading}
            onSubmit={(body) => submitComment(body)}
            placeholder={`Comment on this ${targetType}`}
          />

          {isLoading ? (
            <View style={styles.loading}>
              <ActivityIndicator color={colors.accentDark} />
            </View>
          ) : error ? (
            <Text style={styles.notice}>{error}</Text>
          ) : topLevelComments.length === 0 ? (
            <Text style={styles.notice}>No comments yet.</Text>
          ) : (
            <View style={styles.list}>
              {topLevelComments.map((comment) => (
                <View key={comment.id}>
                  <CommentRow
                    comment={comment}
                    currentUserId={currentUserId}
                    onDelete={onDelete}
                    onReply={setReplyingToCommentId}
                    onToggleReaction={onToggleReaction}
                  />
                  {(repliesByParentId.get(comment.id) ?? []).map((reply) => (
                    <CommentRow
                      key={reply.id}
                      comment={reply}
                      currentUserId={currentUserId}
                      isReply
                      onDelete={onDelete}
                      onReply={setReplyingToCommentId}
                      onToggleReaction={onToggleReaction}
                    />
                  ))}
                  {replyingToCommentId === comment.id && (
                    <View style={styles.replyComposer}>
                      <CommentComposer
                        autoFocus
                        disabled={isLoading}
                        onCancel={() => setReplyingToCommentId(null)}
                        onSubmit={(body) => submitComment(body, comment.id)}
                        placeholder="Write a reply"
                      />
                    </View>
                  )}
                </View>
              ))}
            </View>
          )}
        </>
      )}
    </View>
  );
};

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
  thread: {
    marginTop: spacing.lg,
  },
  header: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  title: {
    color: colors.ink,
    fontSize: 18,
    fontWeight: "900",
  },
  count: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 999,
    borderWidth: 1,
    color: colors.muted,
    fontSize: 12,
    fontWeight: "900",
    overflow: "hidden",
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
  },
  composer: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 16,
    borderWidth: 1,
    padding: spacing.sm,
  },
  input: {
    color: colors.ink,
    fontSize: 15,
    lineHeight: 21,
    minHeight: 76,
    padding: spacing.sm,
    textAlignVertical: "top",
  },
  composerActions: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.sm,
    justifyContent: "flex-end",
  },
  submitButton: {
    alignItems: "center",
    backgroundColor: colors.accentDark,
    borderRadius: 999,
    minHeight: 38,
    justifyContent: "center",
    paddingHorizontal: spacing.md,
  },
  submitButtonLabel: {
    color: colors.surface,
    fontSize: 13,
    fontWeight: "900",
  },
  textButton: {
    borderRadius: 999,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  textButtonLabel: {
    color: colors.accentDark,
    fontSize: 13,
    fontWeight: "900",
  },
  deleteLabel: {
    color: colors.danger,
  },
  disabled: {
    opacity: 0.45,
  },
  pressed: {
    opacity: 0.72,
  },
  loading: {
    padding: spacing.lg,
  },
  list: {
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  comment: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 16,
    borderWidth: 1,
    padding: spacing.md,
  },
  reply: {
    backgroundColor: colors.background,
    marginLeft: spacing.lg,
    marginTop: spacing.xs,
  },
  replyComposer: {
    marginLeft: spacing.lg,
    marginTop: spacing.xs,
  },
  commentHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.sm,
    justifyContent: "space-between",
  },
  commentContentPressed: {
    opacity: 0.8,
  },
  commentAuthor: {
    color: colors.ink,
    flex: 1,
    fontSize: 14,
    fontWeight: "900",
  },
  commentDate: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "800",
    textAlign: "right",
  },
  commentBody: {
    color: colors.ink,
    fontSize: 15,
    lineHeight: 22,
    marginTop: spacing.xs,
  },
  deletedBody: {
    color: colors.muted,
    fontStyle: "italic",
  },
  commentActions: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  actionButton: {
    alignItems: "center",
    backgroundColor: colors.background,
    borderColor: colors.border,
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: "row",
    gap: 4,
    minHeight: 32,
    justifyContent: "center",
    paddingHorizontal: spacing.sm,
  },
  actionButtonActive: {
    backgroundColor: colors.surface,
    borderColor: colors.accentDark,
  },
  actionText: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "900",
  },
  actionTextActive: {
    color: colors.accentDark,
  },
  reactionSummary: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  reactionChip: {
    alignItems: "center",
    backgroundColor: colors.background,
    borderColor: colors.border,
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: "row",
    gap: 4,
    minHeight: 28,
    paddingHorizontal: spacing.sm,
  },
  reactionChipSelected: {
    backgroundColor: colors.surface,
    borderColor: colors.accentDark,
  },
  reactionGlyph: {
    fontSize: 15,
    lineHeight: 18,
  },
  reactionChipText: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "900",
  },
  reactionChipTextSelected: {
    color: colors.accentDark,
  },
  reactionRosterSheet: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 22,
    borderWidth: 1,
    marginTop: spacing.sm,
    padding: spacing.md,
  },
  reactionRosterHandleButton: {
    alignItems: "center",
    justifyContent: "center",
    marginTop: -spacing.xs,
    paddingBottom: spacing.sm,
  },
  reactionRosterTitle: {
    color: colors.ink,
    fontSize: 22,
    fontWeight: "900",
  },
  reactionRosterFilters: {
    gap: spacing.xs,
    paddingVertical: spacing.md,
  },
  reactionRosterFilter: {
    alignItems: "center",
    backgroundColor: colors.background,
    borderColor: colors.border,
    borderRadius: 999,
    borderWidth: 1,
    minHeight: 42,
    justifyContent: "center",
    paddingHorizontal: spacing.md,
  },
  reactionRosterFilterSelected: {
    backgroundColor: colors.accentDark,
    borderColor: colors.accentDark,
  },
  reactionRosterFilterText: {
    color: colors.ink,
    fontSize: 15,
    fontWeight: "900",
  },
  reactionRosterFilterTextSelected: {
    color: colors.surface,
  },
  reactionRosterList: {
    maxHeight: 360,
  },
  reactionRosterRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.sm,
    minHeight: 58,
  },
  reactionRosterAvatar: {
    borderRadius: 20,
    height: 40,
    width: 40,
  },
  reactionRosterAvatarFallback: {
    alignItems: "center",
    backgroundColor: colors.background,
    borderRadius: 20,
    height: 40,
    justifyContent: "center",
    width: 40,
  },
  reactionRosterAvatarText: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: "900",
  },
  reactionRosterName: {
    color: colors.ink,
    flex: 1,
    fontSize: 16,
    fontWeight: "900",
  },
  reactionRosterReaction: {
    fontSize: 28,
    lineHeight: 32,
  },
  reactionPicker: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 22,
    borderWidth: 1,
    marginTop: spacing.sm,
    overflow: "hidden",
    paddingHorizontal: spacing.xs,
    paddingTop: spacing.xs,
  },
  reactionPickerExpanded: {
    borderRadius: 24,
  },
  reactionPickerHandleButton: {
    alignItems: "center",
    justifyContent: "center",
    paddingBottom: spacing.xs,
    paddingTop: 2,
  },
  reactionPickerHandle: {
    backgroundColor: colors.border,
    borderRadius: 999,
    height: 5,
    width: 58,
  },
  reactionPickerHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "flex-end",
    paddingBottom: spacing.sm,
  },
  reactionPickerSizeButton: {
    alignItems: "center",
    borderRadius: 999,
    height: 44,
    justifyContent: "center",
    width: 44,
  },
  reactionEmojiSection: {
    paddingBottom: spacing.md,
  },
  reactionEmojiSectionTitle: {
    color: colors.muted,
    fontSize: 14,
    fontWeight: "900",
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  reactionEmojiScroll: {
    maxHeight: 260,
  },
  reactionEmojiScrollExpanded: {
    maxHeight: 560,
  },
  reactionEmojiScrollContent: {
    paddingBottom: 58,
  },
  reactionEmojiGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
    paddingBottom: spacing.xs,
  },
  reactionPickerButton: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: "transparent",
    borderRadius: 999,
    borderWidth: 1,
    height: 42,
    justifyContent: "center",
    width: 42,
  },
  reactionPickerButtonSelected: {
    backgroundColor: colors.background,
    borderColor: colors.accentDark,
  },
  reactionPickerGlyph: {
    fontSize: 22,
    lineHeight: 26,
    textAlign: "center",
  },
  reactionNavBar: {
    alignItems: "center",
    backgroundColor: "rgba(29, 27, 24, 0.74)",
    borderRadius: 999,
    bottom: spacing.sm,
    flexDirection: "row",
    justifyContent: "space-around",
    left: spacing.sm,
    minHeight: 44,
    paddingHorizontal: 6,
    position: "absolute",
    right: spacing.sm,
  },
  reactionNavButton: {
    alignItems: "center",
    borderRadius: 999,
    height: 36,
    justifyContent: "center",
    width: 30,
  },
  reactionNavGlyph: {
    color: colors.surface,
    fontSize: 18,
    fontWeight: "900",
    lineHeight: 22,
    textAlign: "center",
  },
  notice: {
    color: colors.muted,
    fontSize: 14,
    fontWeight: "800",
    marginTop: spacing.sm,
  },
});
