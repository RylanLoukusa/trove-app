import { SavedItem, TagOption } from "../types/models";

const resolveTagNames = (item: SavedItem, tagOptionsById: Map<string, TagOption>): string[] =>
  item.tagOptionIds
    .map((tagOptionId) => tagOptionsById.get(tagOptionId)?.name)
    .filter((name): name is string => !!name);

export type FolderPatternKind = "tag" | "phrase";

export type FolderPattern = {
  id: string;
  kind: FolderPatternKind;
  label: string;
  detail: string;
  itemIds: string[];
};

const STOP_WORDS = new Set([
  "about",
  "after",
  "again",
  "also",
  "because",
  "before",
  "could",
  "from",
  "good",
  "have",
  "http",
  "https",
  "idea",
  "into",
  "just",
  "later",
  "like",
  "maybe",
  "more",
  "need",
  "next",
  "notes",
  "once",
  "only",
  "really",
  "save",
  "saved",
  "should",
  "something",
  "that",
  "there",
  "thing",
  "things",
  "this",
  "time",
  "want",
  "with",
  "worth",
  "would",
]);

const getItemText = (item: SavedItem, tagOptionsById: Map<string, TagOption>): string =>
  [
    item.title,
    item.description,
    item.url,
    item.notes,
    item.richText,
    resolveTagNames(item, tagOptionsById).join(" "),
    item.listItems?.map((listItem) => listItem.text).join(" "),
  ]
    .filter(Boolean)
    .join(" ");

const getItemTokens = (item: SavedItem, tagOptionsById: Map<string, TagOption>): string[] => {
  const matches = getItemText(item, tagOptionsById).toLowerCase().match(/[a-z0-9][a-z0-9'-]*/g) ?? [];
  return Array.from(
    new Set(
      matches.filter((word) => word.length > 3 && !STOP_WORDS.has(word) && !word.includes("www")),
    ),
  );
};

const pluralizeItem = (count: number): string => `${count} item${count === 1 ? "" : "s"}`;

const titleCase = (value: string): string => value.charAt(0).toUpperCase() + value.slice(1);

export const getFolderPatterns = (items: SavedItem[], tagOptions: TagOption[], limit = 8): FolderPattern[] => {
  const tagOptionsById = new Map(tagOptions.map((tagOption) => [tagOption.id, tagOption]));
  const tagMatches = new Map<string, Set<string>>();
  const phraseMatches = new Map<string, Set<string>>();

  items.forEach((item) => {
    resolveTagNames(item, tagOptionsById).forEach((tag) => {
      const normalized = tag.trim().toLowerCase();
      if (!normalized) return;
      const matches = tagMatches.get(normalized) ?? new Set<string>();
      matches.add(item.id);
      tagMatches.set(normalized, matches);
    });

    getItemTokens(item, tagOptionsById).forEach((token) => {
      const matches = phraseMatches.get(token) ?? new Set<string>();
      matches.add(item.id);
      phraseMatches.set(token, matches);
    });
  });

  const tagPatterns = Array.from(tagMatches.entries())
    .filter(([, itemIds]) => itemIds.size > 1)
    .map(([tag, itemIds]) => ({
      id: `tag:${tag}`,
      kind: "tag" as const,
      label: `#${tag}`,
      detail: `${pluralizeItem(itemIds.size)} share this tag`,
      itemIds: Array.from(itemIds),
    }));

  const tagNames = new Set(tagPatterns.map((pattern) => pattern.label.slice(1)));
  const phrasePatterns = Array.from(phraseMatches.entries())
    .filter(([token, itemIds]) => itemIds.size > 1 && !tagNames.has(token))
    .map(([token, itemIds]) => ({
      id: `phrase:${token}`,
      kind: "phrase" as const,
      label: titleCase(token),
      detail: `Shows up in ${pluralizeItem(itemIds.size)}`,
      itemIds: Array.from(itemIds),
    }));

  return [...tagPatterns, ...phrasePatterns]
    .sort((a, b) => b.itemIds.length - a.itemIds.length || a.label.localeCompare(b.label))
    .slice(0, limit);
};

