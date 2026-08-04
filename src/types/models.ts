export type ItemType = "text" | "list" | "link" | "media" | "image" | "video";
export type ListItemKind = "check" | "bullet";
export type TagGroupSelectionMode = "single" | "multi";
export type ItemConnectionRelation = "related" | "similar" | "compare" | "alternative" | "part_of" | "inspired_by";
export type AccessRole = "owner" | "editor" | "viewer";
export type ShareScope = "folder_only" | "folder_and_subfolders";
export type CommentTargetType = "item" | "folder";
export type CommentReactionType = string;

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
  listItems?: SavedListItem[];
  richText?: string;
  connections?: ItemConnection[];
  tagOptionIds: string[];
  ownerId?: string;
  createdBy?: string;
  accessRole?: AccessRole;
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

export type FolderSuggestion = {
  folder: Folder;
  score: number;
  reasons: string[];
};
