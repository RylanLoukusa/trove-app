import AsyncStorage from "@react-native-async-storage/async-storage";
import * as ImagePicker from "expo-image-picker";
import { File, Paths } from "expo-file-system";
import { useEffect, useState } from "react";
import { Platform } from "react-native";

import { getSupabase } from "../lib/supabase";
import type { LineImage } from "../types/models";
import { MEDIA_STORAGE_BUCKET } from "../utils/storedMedia";

// Photos on lines. A photo is copied into the app's documents when it is
// added, so it always shows on the device that added it, and uploaded to the
// person's folder in storage (when signed in) so their other devices can show
// it too. Uploads that couldn't happen yet wait in a queue.

const FOLDER = "line-images";
const QUEUE_KEY = "trove:lineImageUploads:v1";
const SIGNED_URL_SECONDS = 60 * 60;

const newId = () => `img-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

// Pictures picked on the web have no file to copy; they are kept here for the
// session instead.
const webUris = new Map<string, string>();

const localFile = (id: string): File | null => {
  if (Platform.OS === "web") return null;
  try {
    return new File(Paths.document, FOLDER, `${id}.jpg`);
  } catch {
    return null;
  }
};

const localUri = (id: string): string | null => {
  if (Platform.OS === "web") return webUris.get(id) ?? null;
  const file = localFile(id);
  try {
    return file?.exists ? file.uri : null;
  } catch {
    return null;
  }
};

const signedInUserId = async (): Promise<string | null> => {
  const supabase = getSupabase();
  if (!supabase) return null;
  try {
    const { data } = await supabase.auth.getSession();
    return data.session?.user?.id ?? null;
  } catch {
    return null;
  }
};

type QueuedUpload = { id: string; path: string };

const readQueue = async (): Promise<QueuedUpload[]> => {
  try {
    const stored = await AsyncStorage.getItem(QUEUE_KEY);
    return stored ? (JSON.parse(stored) as QueuedUpload[]) : [];
  } catch {
    return [];
  }
};

const writeQueue = async (queue: QueuedUpload[]) => {
  try {
    await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  } catch (error) {
    console.warn("Failed to remember photos waiting to upload", error);
  }
};

let uploading: Promise<void> | null = null;

// Sends up every photo still waiting. Safe to call often.
export const uploadPendingLineImages = (): Promise<void> => {
  if (uploading) return uploading;
  uploading = (async () => {
    const supabase = getSupabase();
    if (!supabase) return;
    const queue = await readQueue();
    const left: QueuedUpload[] = [];
    for (const upload of queue) {
      const file = localFile(upload.id);
      try {
        if (!file?.exists) continue;
        const bytes = await file.bytes();
        const { error } = await supabase.storage
          .from(MEDIA_STORAGE_BUCKET)
          .upload(upload.path, bytes, { contentType: "image/jpeg", upsert: true });
        if (error) left.push(upload);
      } catch {
        left.push(upload);
      }
    }
    // Photos added while this ran are kept too.
    const latest = await readQueue();
    const done = new Set(queue.filter((upload) => !left.includes(upload)).map((upload) => upload.id));
    await writeQueue(latest.filter((upload) => !done.has(upload.id)));
  })().finally(() => {
    uploading = null;
  });
  return uploading;
};

// Opens the photo library. Returns the photos picked, ready to put on a line,
// or an empty list when nothing was picked.
export const pickLineImages = async (): Promise<LineImage[]> => {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images"],
    allowsMultipleSelection: true,
    selectionLimit: 10,
    quality: 0.6,
  });
  if (result.canceled || !result.assets?.length) return [];

  const userId = await signedInUserId();
  const images: LineImage[] = [];
  const uploads: QueuedUpload[] = [];
  result.assets.forEach((asset) => {
    const id = newId();
    if (Platform.OS === "web") {
      webUris.set(id, asset.uri);
    } else {
      const file = localFile(id);
      if (!file) return;
      try {
        file.parentDirectory.create({ intermediates: true, idempotent: true });
        new File(asset.uri).copy(file);
      } catch (error) {
        console.warn("Failed to keep a photo", error);
        return;
      }
    }
    const path = userId ? `${userId}/${FOLDER}/${id}.jpg` : undefined;
    images.push({ id, width: asset.width || 1, height: asset.height || 1, ...(path ? { path } : {}) });
    if (path) uploads.push({ id, path });
  });

  if (uploads.length > 0) {
    await writeQueue([...(await readQueue()), ...uploads]);
    void uploadPendingLineImages();
  }
  return images;
};

const signedUrls = new Map<string, { url: string; expiresAt: number }>();

const signedUrl = async (path: string): Promise<string | null> => {
  const cached = signedUrls.get(path);
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.url;
  const supabase = getSupabase();
  if (!supabase) return null;
  try {
    const { data, error } = await supabase.storage.from(MEDIA_STORAGE_BUCKET).createSignedUrl(path, SIGNED_URL_SECONDS);
    if (error || !data?.signedUrl) return null;
    signedUrls.set(path, { url: data.signedUrl, expiresAt: Date.now() + SIGNED_URL_SECONDS * 1000 });
    return data.signedUrl;
  } catch {
    return null;
  }
};

// Where to show a photo from: the copy on this device, or else the one in
// storage. Undefined while that is being looked up or when there's neither.
export const useLineImageUri = (image: LineImage): string | undefined => {
  const [uri, setUri] = useState<string | undefined>(() => localUri(image.id) ?? undefined);

  useEffect(() => {
    const local = localUri(image.id);
    if (local) {
      setUri(local);
      return;
    }
    if (!image.path) return;
    let cancelled = false;
    void signedUrl(image.path).then((url) => {
      if (!cancelled && url) setUri(url);
    });
    return () => {
      cancelled = true;
    };
  }, [image.id, image.path]);

  return uri;
};
