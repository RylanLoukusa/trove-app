import type { AccessRole } from "../types/models";

export type PaywallTrigger = "sync" | "sharing" | "video_upload" | "video_playback" | "editor_invite" | "general";

export const requiresProForSync = (isPro: boolean): boolean => !isPro;

export const requiresProForSharing = (isPro: boolean): boolean => !isPro;

export const requiresProForVideoUpload = (isPro: boolean): boolean => !isPro;

export const requiresProForVideoPlayback = (isPro: boolean, accessRole?: AccessRole): boolean => {
  if (isPro) return false;
  return accessRole === "editor" || accessRole === "viewer";
};

export const requiresProForEditorAccept = (isPro: boolean, inviteRole: "viewer" | "editor"): boolean =>
  inviteRole === "editor" && !isPro;
