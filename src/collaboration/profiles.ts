import type { SupabaseClient, User } from "@supabase/supabase-js";

const stringMetadata = (
  metadata: User["user_metadata"] | undefined,
  key: string,
): string | null => {
  const value = metadata?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
};

export const upsertProfileForUser = async (
  supabase: SupabaseClient,
  user: User,
): Promise<void> => {
  const metadata = user.user_metadata;
  const displayName =
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
