import { NativeModules, Platform } from "react-native";
import { Folder, MediaCollectionItem } from "../types/models";

export type SharedImportPayload = {
  autoSave?: boolean;
  folderId?: string;
  id: string;
  mediaItems?: MediaCollectionItem[];
  sharedText?: string;
  sourceUrl?: string;
  title?: string;
};

type SharedImportNativeModule = {
  clearImport: (importId: string) => Promise<boolean>;
  getLatestImportId?: () => Promise<string | null>;
  markImportConsumed?: (importId: string) => Promise<boolean>;
  readImport: (importId: string) => Promise<SharedImportPayload | null>;
  syncFolderSnapshot?: (snapshot: ShareExtensionFolderSnapshot) => Promise<boolean>;
};

const nativeModule = NativeModules.SharedImportModule as SharedImportNativeModule | undefined;

type ShareExtensionFolder = Pick<Folder, "id" | "name" | "parentFolderId" | "icon" | "color">;

type ShareExtensionFolderSnapshot = {
  defaultFolderId?: string | null;
  folders: ShareExtensionFolder[];
};

export const getLatestSharedImportId = async (): Promise<string | null> => {
  if (Platform.OS !== "ios" || !nativeModule?.getLatestImportId) return null;
  return nativeModule.getLatestImportId();
};

export const syncShareExtensionFolders = async (folders: Folder[], defaultFolderId?: string | null): Promise<void> => {
  if (Platform.OS !== "ios" || !nativeModule?.syncFolderSnapshot) return;

  await nativeModule.syncFolderSnapshot({
    defaultFolderId: defaultFolderId ?? null,
    folders: folders.map((folder) => ({
      id: folder.id,
      name: folder.name,
      parentFolderId: folder.parentFolderId,
      icon: folder.icon,
      color: folder.color,
    })),
  });
};

export const readSharedImport = async (importId: string): Promise<SharedImportPayload | null> => {
  if (Platform.OS !== "ios" || !nativeModule) return null;
  return nativeModule.readImport(importId);
};

export const clearSharedImport = async (importId: string): Promise<void> => {
  if (Platform.OS !== "ios" || !nativeModule) return;
  await nativeModule.clearImport(importId);
};

export const markSharedImportConsumed = async (importId: string): Promise<void> => {
  if (Platform.OS !== "ios" || !nativeModule?.markImportConsumed) return;
  await nativeModule.markImportConsumed(importId);
};

// Lines shared into Trove from other apps collect on a list with this title.
export const SHARED_INBOX_TITLE = "Inbox";

const MAX_SHARED_LINE_LENGTH = 500;

// What a share becomes on a list: its words and its link on one line. Photos
// and videos have no place on a list, so a share of only those gives "".
export const lineFromSharedImport = (payload: Pick<SharedImportPayload, "sharedText" | "sourceUrl" | "title">): string => {
  const clean = (value?: string): string => (value ?? "").replace(/\s+/g, " ").trim();
  const url = clean(payload.sourceUrl);
  const words = clean(payload.title) || clean(payload.sharedText);
  const parts = words && url && words.includes(url) ? [words] : [words, url];
  return parts.filter(Boolean).join(" ").slice(0, MAX_SHARED_LINE_LENGTH).trim();
};
