export type ItemType = "text" | "list" | "link" | "media" | "image" | "video";
// "check" is a checklist line, "bullet" a bulleted line, and "text" a plain
// line with no marker (a heading or a note between items).
export type ListItemKind = "check" | "bullet" | "text";
export type TagGroupSelectionMode = "single" | "multi";
export type ItemConnectionRelation = "related" | "similar" | "compare" | "alternative" | "part_of" | "inspired_by";
export type AccessRole = "owner" | "editor" | "viewer";
export type ShareScope = "folder_only" | "folder_and_subfolders";
export type CommentTargetType = "item" | "folder";
export type CommentReactionType = string;
// How often a line comes back once it is checked off.
export type RepeatRule = "daily" | "weekdays" | "weekly" | "monthly" | "yearly";
// How often a list unchecks all its lines by itself.
export type ResetRule = "daily" | "weekly" | "monthly";
// Smart focus lists pull in every line matching their rule.
export type FocusRule = "due_today" | "due_week" | "due_weekend" | "high_priority";

export type Folder = {
  id: string;
  name: string;
  parentFolderId: string | null;
  icon?: string;
  color?: string;
  purpose?: string;
  ownerId?: string;
  accessRole?: AccessRole;
  sharedRootFolderId?: string;
  sharedScope?: ShareScope;
  createdAt: string;
  updatedAt: string;
};

export type MediaMetadata = {
  storagePath?: string; // path in Supabase Storage bucket
  mediaType?: "image" | "video"; // type of file in storage
  tiktokUrl?: string; // external TikTok URL
  thumbnailPath?: string; // path to thumbnail in storage
};

export type MediaCollectionItem = MediaMetadata & {
  id: string;
  localUri?: string;
};

export type SavedListItem = {
  id: string;
  kind: ListItemKind;
  text: string;
  checked?: boolean;
  indentLevel?: number;
  bold?: boolean;
};

// A list line stored as its own record (trove_list_entries), so it can be
// sorted, edited and synced individually and referenced from focus lists.
// `listId` is the SavedItem (type "list") that owns the entry.
// How big a photo on a line shows: a thumbnail the height of the text, bigger,
// or as wide as the line.
export type LineImageSize = "thumb" | "medium" | "large";

// A photo on a line. `path` is where it is kept in storage, set once the
// person is signed in; the photo itself also stays on the device that added it.
// `size` is how big it was last left, when it isn't a thumbnail.
export type LineImage = {
  id: string;
  width: number;
  height: number;
  path?: string;
  size?: LineImageSize;
};

export type ListEntry = {
  id: string;
  listId: string;
  kind: ListItemKind;
  text: string;
  checked: boolean;
  indentLevel: number;
  // The whole line is shown in bold.
  bold?: boolean;
  // Photos shown on the line, small until tapped.
  images?: LineImage[];
  // Fractional index key; entries in a list sort by plain string comparison.
  position: string;
  notes?: string;
  dueDate?: string; // YYYY-MM-DD
  // A time on the due date ("HH:MM", 24-hour, the person's local time). A
  // line with a time sends a reminder then.
  dueTime?: string;
  // Checking off a repeating line moves its due date to the next time
  // instead of leaving it done.
  repeat?: RepeatRule;
  completedAt?: string;
  tagOptionIds: string[];
  // Set on a line that shows a line from another list (a "pulled" line). Its
  // own `position` and `indentLevel` place it in this list; everything else is
  // read from the referenced entry, which stays in (and is edited in) its own
  // list.
  refEntryId?: string;
  ownerId?: string;
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
};

export type ItemAttachment = {
  id: string;
  uri: string;
  mediaType: "image" | "video";
  caption?: string;
};

export type ItemConnection = {
  itemId: string;
  relation: ItemConnectionRelation;
  note?: string;
  createdAt?: string;
};

export type SavedItem = {
  id: string;
  folderId: string;
  title: string;
  description?: string;
  type: ItemType;
  url?: string;
  sourceUrl?: string;
  sourcePlatform?: string;
  sharedText?: string;
  mediaUri?: string; // local URI during editing
  thumbnailUri?: string; // local thumbnail URI during editing
  media?: MediaMetadata; // metadata for stored media
  mediaItems?: MediaCollectionItem[];
  attachments?: ItemAttachment[];
  // Derived from listEntries when items are read through useTrove(); never
  // persisted on the stored item. Writing it via createItem/updateItem is
  // translated into entry changes.
  listItems?: SavedListItem[];
  // "focus" marks a list that shows lines pulled in from other lists, such
  // as Today. It is set the first time a list pulls a line in. Lines of such
  // a list can be moved to other lists but not pulled into them.
  listMode?: "focus";
  focusRule?: FocusRule;
  // Instead of a focus rule: adds the lines that have this tag option.
  ruleTagId?: string;
  // Shown in the Pinned section at the top of Home.
  pinned?: boolean;
  // When the list was put in Recently deleted. It is deleted for good 30 days
  // later. `deletedWithFolderId` is the folder it was deleted along with, when
  // a whole folder was deleted: that folder stays out of sight with it.
  deletedAt?: string;
  deletedWithFolderId?: string;
  // When the list was archived: kept and searchable, but off Home and out of
  // Today. `archivedWithFolderId` is the folder archived along with it.
  archivedAt?: string;
  archivedWithFolderId?: string;
  // A template: a list kept only to start new lists from.
  isTemplate?: boolean;
  // The list unchecks every line by itself each day, week or month.
  // `resetAt` is when it last did.
  resetRule?: ResetRule;
  resetAt?: string;
  richText?: string;
  connections?: ItemConnection[];
  tagOptionIds: string[];
  ownerId?: string;
  createdBy?: string;
  accessRole?: AccessRole;
  // Set by sync, never sent up. `sharedWithMe`: this list was shared with
  // this person on its own (not through a folder), by `by`; it shows on
  // their Home. `sharedWith`: how many people the owner shared it with,
  // counting invites still waiting.
  sharedWithMe?: { by?: string };
  sharedWith?: number;
  createdAt: string;
  updatedAt: string;
  notes?: string;
};

export type TagGroup = {
  id: string;
  ownerId?: string;
  name: string;
  selectionMode: TagGroupSelectionMode;
  allowInlineCreate: boolean;
  isSystem: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

export type TagOption = {
  id: string;
  groupId: string;
  name: string;
  color?: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

export type TroveData = {
  folders: Folder[];
  items: SavedItem[];
  listEntries: ListEntry[];
  tagGroups: TagGroup[];
  tagOptions: TagOption[];
};

export type CommentAuthor = {
  avatarUrl: string | null;
  displayName: string | null;
  email: string | null;
  id: string;
};

export type CommentReactionSummary = {
  count: number;
  reactedByMe: boolean;
  type: CommentReactionType;
};

export type CommentReactionDetail = {
  reaction: CommentReactionType;
  user: CommentAuthor;
  userId: string;
};

export type TroveComment = {
  author: CommentAuthor | null;
  authorId: string;
  body: string;
  createdAt: string;
  deletedAt: string | null;
  id: string;
  parentCommentId: string | null;
  reactionDetails: CommentReactionDetail[];
  reactions: CommentReactionSummary[];
  targetId: string;
  targetType: CommentTargetType;
  updatedAt: string;
};
