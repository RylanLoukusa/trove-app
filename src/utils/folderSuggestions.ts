import { Folder, FolderSuggestion, ItemType, SavedItem, TagOption } from "../types/models";
import { getFolderPathLabel } from "./folderTree";

const keywordRules = [
  { keywords: ["restaurant", "dinner", "lunch", "coffee", "burger", "sushi", "ramen", "brunch"], targets: ["Food > Eating Out > Sit Down", "Food > Eating Out", "Food"] },
  { keywords: ["recipe", "cook", "make", "bake", "pizza", "homemade"], targets: ["Food > Cooking", "Food"] },
  { keywords: ["book", "author", "novel", "read", "article"], targets: ["Books > To Be Read", "Books", "Books > Reading"] },
  { keywords: ["movie", "film", "watch", "show", "series"], targets: ["Movies > To Watch", "Movies"] },
  { keywords: ["buy", "purchase", "amazon", "order", "shopping"], targets: ["Things To Buy"] },
  { keywords: ["travel", "trip", "visit", "lake", "hike", "museum"], targets: ["Places > Local", "Places > Travel", "Weekend Ideas"] },
];

const videoExt = /\.(mov|mp4|m4v|webm)(\?|$)/i;
const imageExt = /\.(png|jpg|jpeg|gif|webp)(\?|$)/i;

export const detectItemType = (content: string, mediaUri?: string): ItemType => {
  const text = content.trim().toLowerCase();
  if (mediaUri?.match(/\.(mov|mp4|m4v|webm|png|jpg|jpeg|gif|webp)$/i)) return "media";
  if (/^https?:\/\//i.test(text)) {
    if (videoExt.test(text) || imageExt.test(text)) return "media";
    return "link";
  }
  return "text";
};

export const suggestTitle = (content: string): string => {
  const trimmed = content.trim();
  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const url = new URL(trimmed);
      return url.hostname.replace(/^www\./, "") + url.pathname.replace(/[/-]+/g, " ").trim();
    } catch {
      return trimmed;
    }
  }
  return trimmed.length > 72 ? `${trimmed.slice(0, 69)}...` : trimmed || "Untitled idea";
};

// Keyword-based fallback scorer: compares pasted content with folder names, ancestor names, existing item titles, and tags.
export const suggestFolders = (
  content: string,
  folders: Folder[],
  items: SavedItem[],
  tagOptions: TagOption[] = [],
): FolderSuggestion[] => {
  const text = content.toLowerCase();
  const scores = new Map<string, FolderSuggestion>();
  const tagOptionsById = new Map(tagOptions.map((tagOption) => [tagOption.id, tagOption]));

  const addScore = (folder: Folder, amount: number, reason: string): void => {
    const current = scores.get(folder.id) ?? { folder, score: 0, reasons: [] };
    current.score += amount;
    if (!current.reasons.includes(reason)) current.reasons.push(reason);
    scores.set(folder.id, current);
  };

  folders.forEach((folder) => {
    const pathLabel = getFolderPathLabel(folders, folder.id).toLowerCase();
    const folderContext = `${pathLabel} ${folder.purpose ?? ""}`.toLowerCase();
    folder.name.toLowerCase().split(/\s+/).forEach((part) => {
      if (part.length > 2 && text.includes(part)) addScore(folder, 3, `Matches “${folder.name}”`);
    });
    if (text.includes(pathLabel)) addScore(folder, 5, "Matches folder path");
    folderContext.split(/\W+/).forEach((part) => {
      if (part.length > 3 && text.includes(part)) addScore(folder, 2, "Matches folder context");
    });
  });

  keywordRules.forEach((rule) => {
    const matched = rule.keywords.filter((keyword) => text.includes(keyword));
    if (matched.length === 0) return;
    rule.targets.forEach((target, index) => {
      const folder = folders.find((candidate) => getFolderPathLabel(folders, candidate.id).toLowerCase() === target.toLowerCase());
      if (folder) addScore(folder, 12 - index * 2 + matched.length, `Keyword: ${matched[0]}`);
    });
  });

  items.forEach((item) => {
    const tagNames = item.tagOptionIds
      .map((tagOptionId) => tagOptionsById.get(tagOptionId)?.name)
      .filter((name): name is string => !!name)
      .join(" ");
    const itemText = `${item.title} ${item.description ?? ""} ${tagNames}`.toLowerCase();
    const overlap = text.split(/\W+/).filter((word) => word.length > 3 && itemText.includes(word)).length;
    const folder = folders.find((candidate) => candidate.id === item.folderId);
    if (folder && overlap > 0) addScore(folder, Math.min(8, overlap * 2), "Similar saved item");
  });

  return Array.from(scores.values()).sort((a, b) => b.score - a.score).slice(0, 3);
};
