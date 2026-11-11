import { Folder, ListEntry, SavedItem, TroveData } from "../types/models";
import { generatePositionsBetween } from "../utils/listEntries";

const now = "2026-05-15T00:00:00.000Z";

// Someone new starts with no folders and one list that shows how lists work.
export const seedFolders: Folder[] = [];

const WELCOME_LIST_ID = "list-welcome";

export const seedItems: SavedItem[] = [
  {
    id: WELCOME_LIST_ID,
    folderId: "",
    title: "Welcome to Trove",
    type: "list",
    tagOptionIds: [],
    createdAt: now,
    updatedAt: now,
  },
];

type SeedLine = Pick<ListEntry, "kind" | "text"> & Partial<Pick<ListEntry, "bold" | "indentLevel">>;

const welcomeLines: SeedLine[] = [
  { kind: "text", text: "Try it out", bold: true },
  { kind: "check", text: "Tap a circle to check a line off" },
  { kind: "check", text: "Tap a line to edit it, and press return for the next one" },
  { kind: "check", text: "Swipe a line left to send it to another list" },
  { kind: "check", text: "Hold a circle to drag its line somewhere else" },
  { kind: "text", text: "Make it yours", bold: true },
  { kind: "bullet", text: "The bar above the keyboard switches a line between a checkbox, a bullet and plain text" },
  { kind: "bullet", text: "It also makes a line bold or indents it", indentLevel: 1 },
  { kind: "bullet", text: "The pencil button starts a new list, from the home screen or from inside a folder" },
];

const welcomePositions = generatePositionsBetween(null, null, welcomeLines.length);

export const seedListEntries: ListEntry[] = welcomeLines.map((line, index) => ({
  id: `${WELCOME_LIST_ID}~${index + 1}`,
  listId: WELCOME_LIST_ID,
  checked: false,
  indentLevel: 0,
  position: welcomePositions[index],
  tagOptionIds: [],
  createdAt: now,
  updatedAt: now,
  ...line,
}));

export const seedData: TroveData = {
  folders: seedFolders,
  items: seedItems,
  tagGroups: [],
  tagOptions: [],
  listEntries: seedListEntries,
};
