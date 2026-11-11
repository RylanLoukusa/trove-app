import type { SavedItem } from "../types/models";

export const MEDIA_STORAGE_BUCKET = "media";

// Storage paths of every photo, video and thumbnail the given items uploaded.
export const collectStoredMediaPaths = (items: Array<Pick<SavedItem, "media" | "mediaItems">>): string[] => {
  const paths = new Set<string>();

  items.forEach((item) => {
    if (item.media?.storagePath) paths.add(item.media.storagePath);
    if (item.media?.thumbnailPath) paths.add(item.media.thumbnailPath);
    item.mediaItems?.forEach((mediaItem) => {
      if (mediaItem.storagePath) paths.add(mediaItem.storagePath);
      if (mediaItem.thumbnailPath) paths.add(mediaItem.thumbnailPath);
    });
  });

  return Array.from(paths);
};
