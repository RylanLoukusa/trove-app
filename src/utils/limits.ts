export type PaywallTrigger =
  | "sync"
  | "sharing"
  | "video_upload"
  | "video_playback"
  | "editor_invite"
  | "automation"
  | "reminders"
  | "templates"
  | "widgets"
  | "general";

// What stays free: unlimited lists, folders and lines, sync, the Today and
// This week lists, the small and medium Home Screen widgets, sharing with
// people who can view, and photos and links.
//
// What Pro adds: other people editing, a list that fills or resets itself,
// reminders at a time, more than a few templates of your own, and the large
// and Lock Screen widgets. Free users still see each of these, marked Pro,
// and tapping one opens the paywall.

export const requiresProForSync = (_isPro: boolean): boolean => false;

// Viewer access -- via a public link or an invited collaborator -- is free.
// Only granting editor access (the person can actually modify the folder)
// requires Pro, mirroring requiresProForEditorAccept on the accepting side.
export const requiresProForSharing = (isPro: boolean, role: "viewer" | "editor"): boolean =>
  role === "editor" && !isPro;

export const requiresProForEditorAccept = (isPro: boolean, inviteRole: "viewer" | "editor"): boolean =>
  inviteRole === "editor" && !isPro;

// Templates you save yourself; the starter templates are always free.
export const FREE_TEMPLATE_LIMIT = 3;

export const requiresProForTemplate = (isPro: boolean, templateCount: number): boolean =>
  !isPro && templateCount >= FREE_TEMPLATE_LIMIT;
