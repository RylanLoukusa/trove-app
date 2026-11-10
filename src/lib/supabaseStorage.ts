import { getSupabase } from "./supabase";
import type { SavedItem } from "../types/models";
import { friendlyErrorMessage } from "../utils/errorMessages";
import { collectStoredMediaPaths, MEDIA_STORAGE_BUCKET } from "../utils/storedMedia";

// Removes the photos and videos an item kept in storage. Trove holds lists
// only now, so this matters for lists that still carry media from before.
export async function deleteStoredMediaForItems(items: SavedItem[]): Promise<{ ok: boolean; error?: string }> {
  const paths = collectStoredMediaPaths(items);
  if (!paths.length) return { ok: true };

  const supabase = getSupabase();
  if (!supabase) return { ok: false, error: "Supabase not configured" };

  const { error } = await supabase.storage.from(MEDIA_STORAGE_BUCKET).remove(paths);
  if (error) {
    return { ok: false, error: friendlyErrorMessage(error.message) };
  }

  return { ok: true };
}
