import type { Folder } from "../types/models";

// The top level, where lists that aren't in a folder live.
export const HOME_LABEL = "Trove";

type StackState = { routes: ReadonlyArray<{ key: string; name: string; params?: object }> };

// What a screen's back button says: the name of the screen underneath it.
export const backLabelFor = (state: StackState | undefined, routeKey: string | undefined, folders: Folder[]): string => {
  const routes = state?.routes ?? [];
  const index = routes.findIndex((candidate) => candidate.key === routeKey);
  const previous = index > 0 ? routes[index - 1] : undefined;
  if (previous?.name === "Folder") {
    const folderId = (previous.params as { folderId?: string } | undefined)?.folderId;
    return folders.find((folder) => folder.id === folderId)?.name ?? "Folder";
  }
  if (previous?.name === "Search") return "Search";
  return !previous || previous.name === "Home" ? HOME_LABEL : "Back";
};
