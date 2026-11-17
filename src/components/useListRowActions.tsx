import React, { ReactNode, useCallback, useState } from "react";
import { Alert } from "react-native";
import { Archive, Copy, FolderInput, LogOut, Pin, PinOff, Trash2 } from "lucide-react-native";

import { FolderTreeBrowserModal } from "./FolderTreeBrowserModal";
import { MenuSheet } from "./MenuSheet";
import { useTrove } from "../storage/storage";
import { useThemeColors } from "../theme/ThemeContext";
import { isSharedAccess } from "../utils/access";
import { getFolderPathLabel } from "../utils/folderTree";
import { listDisplayTitle } from "../utils/listEntries";

// Holding a list's row offers to pin, copy, move, archive or delete it. Put
// `overlays` last in the screen's root view.
export const useListRowActions = (): { openListActions: (listId: string) => void; overlays: ReactNode } => {
  const colors = useThemeColors();
  const { folders, items, updateItem, trashItem, setItemArchived, copyItem, canEditItem, leaveSharedList } = useTrove();
  const [actionListId, setActionListId] = useState<string | null>(null);
  const [movingListId, setMovingListId] = useState<string | null>(null);
  const actionList = items.find((item) => item.id === actionListId);
  const movingList = items.find((item) => item.id === movingListId);

  const openListActions = useCallback(
    (listId: string) => {
      const list = items.find((item) => item.id === listId);
      if (canEditItem(listId) || list?.sharedWithMe) setActionListId(listId);
    },
    [canEditItem, items],
  );

  const leave = (listId: string) => {
    Alert.alert("Leave this list?", "It goes from your Trove. The owner keeps it, and can share it with you again.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Leave",
        style: "destructive",
        onPress: () =>
          void leaveSharedList(listId).then((result) => {
            if (!result.ok) Alert.alert("Could not leave list", result.error ?? "Try again in a moment.");
          }),
      },
    ]);
  };

  // No "are you sure": a deleted list waits in Recently deleted for 30 days.
  const moveToDeleted = (listId: string) => {
    const result = trashItem(listId);
    if (!result.ok) Alert.alert("Could not delete list", result.error ?? "Try again in a moment.");
  };

  const overlays = (
    <>
      <MenuSheet
        visible={!!actionList}
        title={actionList ? listDisplayTitle(actionList, actionList.listItems) : undefined}
        actions={
          actionList?.sharedWithMe
            ? [
                // Shared with this person on its own: the rest is the owner's.
                {
                  key: "copy",
                  label: "Duplicate",
                  icon: <Copy size={20} color={colors.accentDark} />,
                  onPress: () => void copyItem(actionList.id),
                },
                {
                  key: "leave",
                  label: "Leave list",
                  icon: <LogOut size={20} color={colors.danger} />,
                  destructive: true,
                  separated: true,
                  onPress: () => leave(actionList.id),
                },
              ]
            : actionList
            ? [
                // Pinning is the owner's own choice, so a list shared with them can't be.
                ...(isSharedAccess(actionList)
                  ? []
                  : [
                      {
                        key: "pin",
                        label: actionList.pinned ? "Unpin from Home" : "Pin to Home",
                        icon: actionList.pinned ? (
                          <PinOff size={20} color={colors.accentDark} />
                        ) : (
                          <Pin size={20} color={colors.accentDark} />
                        ),
                        onPress: () => updateItem(actionList.id, { pinned: !actionList.pinned }),
                      },
                    ]),
                {
                  key: "folder",
                  label: "Move to folder",
                  detail: getFolderPathLabel(folders, actionList.folderId),
                  icon: <FolderInput size={20} color={colors.accentDark} />,
                  onPress: () => setMovingListId(actionList.id),
                },
                {
                  key: "copy",
                  label: "Duplicate",
                  icon: <Copy size={20} color={colors.accentDark} />,
                  onPress: () => void copyItem(actionList.id),
                },
                {
                  key: "archive",
                  label: "Archive",
                  icon: <Archive size={20} color={colors.accentDark} />,
                  separated: true,
                  onPress: () => void setItemArchived(actionList.id, true),
                },
                {
                  key: "delete",
                  label: "Delete list",
                  icon: <Trash2 size={20} color={colors.danger} />,
                  destructive: true,
                  onPress: () => moveToDeleted(actionList.id),
                },
              ]
            : []
        }
        onClose={() => setActionListId(null)}
      />
      <FolderTreeBrowserModal
        visible={!!movingList}
        folders={folders}
        title="Move to folder"
        rootLabel="Trove"
        selectedFolderId={movingList?.folderId}
        onSelectFolder={(folderId) => {
          if (movingList && folderId !== movingList.folderId) updateItem(movingList.id, { folderId });
          setMovingListId(null);
        }}
        onClose={() => setMovingListId(null)}
      />
    </>
  );

  return { openListActions, overlays };
};
