import type { AccessRole, Folder, SavedItem } from "../types/models";

type AccessControlled = {
  accessRole?: AccessRole;
};

export const isSharedAccess = (value?: AccessControlled | null): boolean =>
  value?.accessRole === "editor" || value?.accessRole === "viewer";

export const accessRoleLabel = (role?: AccessRole): string => {
  switch (role) {
    case "editor":
      return "Can edit";
    case "viewer":
      return "Can view";
    case "owner":
    default:
      return "Owner";
  }
};

export const canManageFolderRecord = (folder?: Folder | null): boolean =>
  !folder?.accessRole || folder.accessRole === "owner";

export const canEditFolderContentRecord = (folder?: Folder | null): boolean =>
  !folder?.accessRole || folder.accessRole === "owner" || folder.accessRole === "editor";

export const canEditItemRecord = (item?: SavedItem | null, folder?: Folder | null): boolean => {
  if (!item) return false;
  if (item.accessRole) {
    return item.accessRole === "owner" || item.accessRole === "editor";
  }

  return canEditFolderContentRecord(folder);
};
