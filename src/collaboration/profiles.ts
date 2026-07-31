import type { SupabaseClient, User } from "@supabase/supabase-js";
import { friendlyErrorMessage } from "../utils/errorMessages";

export type UserProfile = {
  avatarUrl: string | null;
  displayName: string | null;
  email: string | null;
  id: string;
  updatedAt: string | null;
};

type ProfileRow = {
  avatar_url: string | null;
  display_name: string | null;
  email: string | null;
  id: string;
  updated_at: string | null;
};

const stringMetadata = (
  metadata: User["user_metadata"] | undefined,
  key: string,
): string | null => {
  const value = metadata?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
};

const mapProfileRow = (row: ProfileRow): UserProfile => ({
  avatarUrl: row.avatar_url,
  displayName: row.display_name,
  email: row.email,
  id: row.id,
  updatedAt: row.updated_at,
});

export const loadCurrentProfile = async (
  supabase: SupabaseClient,
  userId: string,
): Promise<{ error?: string; profile?: UserProfile }> => {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, email, display_name, avatar_url, updated_at")
    .eq("id", userId)
    .maybeSingle();

  if (error) return { error: friendlyErrorMessage(error.message) };
  if (!data) return {};

  return { profile: mapProfileRow(data as ProfileRow) };
};

export const updateCurrentProfile = async (
  supabase: SupabaseClient,
  input: {
    displayName: string | null;
    email?: string | null;
    userId: string;
  },
): Promise<{ error?: string; profile?: UserProfile }> => {
  const cleanDisplayName = input.displayName?.trim() || null;
  const { data, error } = await supabase
    .from("profiles")
    .upsert({
      email: input.email ?? null,
      display_name: cleanDisplayName,
      id: input.userId,
    }, { onConflict: "id" })
    .select("id, email, display_name, avatar_url, updated_at")
    .single();

  if (error) return { error: friendlyErrorMessage(error.message) };

  return { profile: mapProfileRow(data as ProfileRow) };
};

export const upsertProfileForUser = async (
  supabase: SupabaseClient,
  user: User,
): Promise<void> => {
  const metadata = user.user_metadata;
  const existing = await loadCurrentProfile(supabase, user.id);
  const displayName =
    existing.profile?.displayName ??
    stringMetadata(metadata, "full_name") ??
    stringMetadata(metadata, "name") ??
    [stringMetadata(metadata, "given_name"), stringMetadata(metadata, "family_name")]
      .filter(Boolean)
      .join(" ")
      .trim() ??
    null;

  const { error } = await supabase.from("profiles").upsert(
    {
      id: user.id,
      email: user.email ?? null,
      display_name: displayName || null,
      avatar_url: stringMetadata(metadata, "avatar_url") ?? stringMetadata(metadata, "picture"),
    },
    { onConflict: "id" },
  );

  if (error) {
    console.warn("Failed to update profile", error);
  }
};
