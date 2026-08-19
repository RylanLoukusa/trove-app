import type { AccessRole } from "../types/models";

export type PaywallTrigger = "sync" | "sharing" | "video_upload" | "video_playback" | "editor_invite" | "general";

export const requiresProForSync = (isPro: boolean): boolean => !isPro;

// Viewer access -- via a public link or an invited collaborator -- is free.
// Only granting editor access (the person can actually modify the folder)
// requires Pro, mirroring requiresProForEditorAccept on the accepting side.
export const requiresProForSharing = (isPro: boolean, role: "viewer" | "editor"): boolean =>
  role === "editor" && !isPro;

export const requiresProForVideoUpload = (isPro: boolean): boolean => !isPro;

export const requiresProForVideoPlayback = (isPro: boolean, accessRole?: AccessRole): boolean => {
  if (isPro) return false;
  return accessRole === "editor" || accessRole === "viewer";
};

export const requiresProForEditorAccept = (isPro: boolean, inviteRole: "viewer" | "editor"): boolean =>
  inviteRole === "editor" && !isPro;
