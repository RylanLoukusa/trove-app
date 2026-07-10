import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";
import type {
  CommentAuthor,
  CommentReactionDetail,
  CommentReactionType,
  CommentTargetType,
  WaitingListComment,
} from "../types/models";

type CommentRow = {
  author_id: string;
  body: string;
  created_at: string;
  deleted_at: string | null;
  id: string;
  parent_comment_id: string | null;
  target_id: string;
  target_type: CommentTargetType;
  updated_at: string;
};

type ReactionRow = {
  comment_id: string;
  reaction: CommentReactionType;
  user_id: string;
};

type ProfileRow = {
  avatar_url: string | null;
  display_name: string | null;
  email: string | null;
  id: string;
};

const mapAuthor = (row: ProfileRow): CommentAuthor => ({
  avatarUrl: row.avatar_url,
  displayName: row.display_name,
  email: row.email,
  id: row.id,
});

const fallbackAuthor = (authorId: string): CommentAuthor => ({
  avatarUrl: null,
  displayName: null,
  email: null,
  id: authorId,
});

const reactionSummaryForComment = (
  reactions: ReactionRow[],
  commentId: string,
  currentUserId: string,
) => {
  const grouped = new Map<CommentReactionType, { count: number; reactedByMe: boolean; type: CommentReactionType }>();

  reactions
    .filter((reaction) => reaction.comment_id === commentId)
    .forEach((reaction) => {
      const current = grouped.get(reaction.reaction) ?? {
        count: 0,
        reactedByMe: false,
        type: reaction.reaction,
      };
      grouped.set(reaction.reaction, {
        ...current,
        count: current.count + 1,
        reactedByMe: current.reactedByMe || reaction.user_id === currentUserId,
      });
    });

  return Array.from(grouped.values()).sort((first, second) => {
    if (second.count !== first.count) return second.count - first.count;
    return first.type.localeCompare(second.type);
  });
};

const reactionDetailsForComment = (
  reactions: ReactionRow[],
  commentId: string,
  profilesById: Map<string, CommentAuthor>,
): CommentReactionDetail[] =>
  reactions
    .filter((reaction) => reaction.comment_id === commentId)
    .map((reaction) => ({
      reaction: reaction.reaction,
      user: profilesById.get(reaction.user_id) ?? fallbackAuthor(reaction.user_id),
      userId: reaction.user_id,
    }))
    .sort((first, second) => {
      const firstName = first.user.displayName ?? first.user.email ?? "";
      const secondName = second.user.displayName ?? second.user.email ?? "";
      return firstName.localeCompare(secondName);
    });

const errorMessage = (error: unknown, fallback: string): string => {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error !== null && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string") return message;
  }
  return fallback;
};

export const loadCommentThread = async (
  supabase: SupabaseClient,
  input: {
    currentUserId: string;
    targetId: string;
    targetType: CommentTargetType;
  },
): Promise<{ comments: WaitingListComment[]; error?: string }> => {
  const { data, error } = await supabase
    .from("waiting_list_comments")
    .select("id, target_type, target_id, parent_comment_id, author_id, body, created_at, updated_at, deleted_at")
    .eq("target_type", input.targetType)
    .eq("target_id", input.targetId)
    .order("created_at", { ascending: true });

  if (error) return { comments: [], error: error.message };

  const rows = (data ?? []) as CommentRow[];
  const commentIds = rows.map((comment) => comment.id);

  const reactionsResult = await (commentIds.length
      ? supabase
          .from("waiting_list_comment_reactions")
          .select("comment_id, user_id, reaction")
          .in("comment_id", commentIds)
      : Promise.resolve({ data: [], error: null }));

  if (reactionsResult.error) {
    return { comments: [], error: reactionsResult.error.message };
  }

  const reactions = (reactionsResult.data ?? []) as ReactionRow[];
  const profileIds = Array.from(
    new Set([
      ...rows.map((comment) => comment.author_id),
      ...reactions.map((reaction) => reaction.user_id),
    ]),
  );

  const profilesResult = profileIds.length
    ? await supabase
        .from("profiles")
        .select("id, email, display_name, avatar_url")
        .in("id", profileIds)
    : { data: [], error: null };

  if (profilesResult.error) {
    return { comments: [], error: profilesResult.error.message };
  }

  const authorsById = new Map(
    ((profilesResult.data ?? []) as ProfileRow[]).map((profile) => [
      profile.id,
      mapAuthor(profile),
    ]),
  );

  return {
    comments: rows.map((row) => ({
      author: authorsById.get(row.author_id) ?? fallbackAuthor(row.author_id),
      authorId: row.author_id,
      body: row.body,
      createdAt: row.created_at,
      deletedAt: row.deleted_at,
      id: row.id,
      parentCommentId: row.parent_comment_id,
      reactionDetails: reactionDetailsForComment(reactions, row.id, authorsById),
      reactions: reactionSummaryForComment(reactions, row.id, input.currentUserId),
      targetId: row.target_id,
      targetType: row.target_type,
      updatedAt: row.updated_at,
    })),
  };
};

export const createComment = async (
  supabase: SupabaseClient,
  input: {
    authorId: string;
    body: string;
    parentCommentId?: string | null;
    targetId: string;
    targetType: CommentTargetType;
  },
): Promise<{ comment?: WaitingListComment; error?: string }> => {
  const { data, error } = await supabase
    .from("waiting_list_comments")
    .insert({
      author_id: input.authorId,
      body: input.body.trim(),
      parent_comment_id: input.parentCommentId ?? null,
      target_id: input.targetId,
      target_type: input.targetType,
    })
    .select("id, target_type, target_id, parent_comment_id, author_id, body, created_at, updated_at, deleted_at")
    .single();

  if (error) return { error: error.message };

  const row = data as CommentRow;
  return {
    comment: {
      author: fallbackAuthor(row.author_id),
      authorId: row.author_id,
      body: row.body,
      createdAt: row.created_at,
      deletedAt: row.deleted_at,
      id: row.id,
      parentCommentId: row.parent_comment_id,
      reactionDetails: [],
      reactions: reactionSummaryForComment([], row.id, input.authorId),
      targetId: row.target_id,
      targetType: row.target_type,
      updatedAt: row.updated_at,
    },
  };
};

export const softDeleteComment = async (
  supabase: SupabaseClient,
  commentId: string,
): Promise<{ error?: string }> => {
  const { error } = await supabase
    .from("waiting_list_comments")
    .update({ body: "", deleted_at: new Date().toISOString() })
    .eq("id", commentId);

  return error ? { error: error.message } : {};
};

export const setCommentReaction = async (
  supabase: SupabaseClient,
  input: {
    commentId: string;
    reaction: CommentReactionType;
    shouldReact: boolean;
    userId: string;
  },
): Promise<{ error?: string }> => {
  if (input.shouldReact) {
    const { error } = await supabase.from("waiting_list_comment_reactions").upsert(
      {
        comment_id: input.commentId,
        reaction: input.reaction,
        user_id: input.userId,
      },
      { onConflict: "comment_id,user_id,reaction" },
    );
    return error ? { error: error.message } : {};
  }

  const { error } = await supabase
    .from("waiting_list_comment_reactions")
    .delete()
    .eq("comment_id", input.commentId)
    .eq("reaction", input.reaction)
    .eq("user_id", input.userId);

  return error ? { error: error.message } : {};
};

export const subscribeToCommentThread = (
  supabase: SupabaseClient,
  input: {
    onChange: () => void;
    targetId: string;
    targetType: CommentTargetType;
  },
): RealtimeChannel => {
  const channel = supabase
    .channel(`waiting-list-comments:${input.targetType}:${input.targetId}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        filter: `target_id=eq.${input.targetId}`,
        schema: "public",
        table: "waiting_list_comments",
      },
      (payload) => {
        const change = payload as {
          new?: Partial<CommentRow>;
          old?: Partial<CommentRow>;
        };
        const record = change.new ?? change.old;
        if ((record as Partial<CommentRow> | null)?.target_type === input.targetType) {
          input.onChange();
        }
      },
    )
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "waiting_list_comment_reactions",
      },
      () => input.onChange(),
    )
    .subscribe();

  return channel;
};

export const commentActionError = (error: unknown): string =>
  errorMessage(error, "Unable to update comments.");
