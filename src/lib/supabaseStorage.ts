import { getSupabase } from "./supabase";
import type { SavedItem } from "../types/models";
import { friendlyErrorMessage } from "../utils/errorMessages";
import { collectStoredMediaPaths, MEDIA_STORAGE_BUCKET } from "../utils/storedMedia";

const STORAGE_BUCKET = MEDIA_STORAGE_BUCKET;

/**
 * Upload a file from the device to Supabase Storage.
 * @param fileUri - local file URI (e.g., from image picker or camera roll)
 * @param itemId - item ID to organize files
 * @param fileType - "image" or "video"
 * @returns storage path on success, null on error
 */
export async function uploadMediaToSupabase(
  fileUri: string,
  itemId: string,
  fileType: "image" | "video"
): Promise<{ storagePath: string } | { error: string }> {
  const supabase = getSupabase();
  if (!supabase) {
    return { error: "Supabase not configured" };
  }

  try {
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError) {
      return { error: userError.message };
    }

    if (!user) {
      return { error: "You must be signed in to upload media" };
    }

    // Read the file directly into an ArrayBuffer, avoiding a base64 round trip
    const response = await fetch(fileUri);
    const arrayBuffer = await response.arrayBuffer();

    // Determine file extension
    const ext = fileUri.split(".").pop() || (fileType === "video" ? "mp4" : "jpg");
    const fileName = `${user.id}/${itemId}/${Date.now()}.${ext}`;

    // Upload to Supabase Storage
    const { error } = await supabase.storage.from(STORAGE_BUCKET).upload(fileName, arrayBuffer, {
      contentType: fileType === "video" ? "video/mp4" : "image/jpeg",
      upsert: false,
    });

    if (error) {
      return { error: friendlyErrorMessage(error.message) };
    }

    return { storagePath: fileName };
  } catch (err) {
    return { error: friendlyErrorMessage(err instanceof Error ? err.message : undefined, "Upload failed") };
  }
}

/**
 * Get a signed URL for a stored file (valid for 1 hour by default).
 * @param storagePath - path returned from uploadMediaToSupabase
 * @param expiresIn - seconds until URL expires (default: 3600)
 * @returns signed URL or null
 */
export async function getSignedMediaUrl(storagePath: string, expiresIn: number = 3600): Promise<string | null> {
  const supabase = getSupabase();
  if (!supabase || !storagePath) return null;

  try {
    const { data, error } = await supabase.storage
      .from(STORAGE_BUCKET)
      .createSignedUrl(storagePath, expiresIn);

    if (error) {
      console.error("Failed to create signed URL:", error.message);
      return null;
    }

    return data?.signedUrl || null;
  } catch (err) {
    console.error("Error creating signed URL:", err);
    return null;
  }
}

/**
 * Delete a file from Supabase Storage.
 * @param storagePath - path to delete
 * @returns true if deleted, false otherwise
 */
export async function deleteMediaFromSupabase(storagePath: string): Promise<boolean> {
  const supabase = getSupabase();
  if (!supabase || !storagePath) return false;

  try {
    const { error } = await supabase.storage.from(STORAGE_BUCKET).remove([storagePath]);
    if (error) {
      console.error("Failed to delete file:", error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.error("Error deleting file:", err);
    return false;
  }
}

export async function deleteStoredMediaForItems(items: SavedItem[]): Promise<{ ok: boolean; error?: string }> {
  const paths = collectStoredMediaPaths(items);
  if (!paths.length) return { ok: true };

  const supabase = getSupabase();
  if (!supabase) return { ok: false, error: "Supabase not configured" };

  const { error } = await supabase.storage.from(STORAGE_BUCKET).remove(paths);
  if (error) {
    return { ok: false, error: friendlyErrorMessage(error.message) };
  }

  return { ok: true };
}
