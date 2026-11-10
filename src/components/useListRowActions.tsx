import React, { ReactNode, useCallback, useState } from "react";
import { Alert } from "react-native";
import { FolderInput, Trash2 } from "lucide-react-native";

import { FolderTreeBrowserModal } from "./FolderTreeBrowserModal";
import { MenuSheet } from "./MenuSheet";
import { useTrove } from "../storage/storage";
import { useThemeColors } from "../theme/ThemeContext";
import { getFolderPathLabel } from "../utils/folderTree";
import { listDisplayTitle } from "../utils/listEntries";

// Holding a list's row offers to move it to a folder or delete it. Put
// `overlays` last in the screen's root view.
export const useListRowActions = (): { openListActions: (listId: string) => void; overlays: ReactNode } => {
  const colors = useThemeColors();
  const { folders, items, updateItem, deleteItem, canEditItem } = useTrove();
  const [actionListId, setActionListId] = useState<string | null>(null);
  const [movingListId, setMovingListId] = useState<string | null>(null);
  const actionList = items.find((item) => item.id === actionListId);
  const movingList = items.find((item) => item.id === movingListId);

  const openListActions = useCallback(
    (listId: string) => {
      if (canEditItem(listId)) setActionListId(listId);
    },
    [canEditItem],
  );

  const confirmDelete = (listId: string) => {
    Alert.alert("Delete this list?", "Its lines are deleted too. Lines pulled in from other lists stay in those lists.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => {
          void (async () => {
            const result = await deleteItem(listId);
            if (!result.ok) Alert.alert("Could not delete list", result.error ?? "Try again in a moment.");
          })();
        },
      },
    ]);
  };

  const overlays = (
    <>
      <MenuSheet
        visible={!!actionList}
        title={actionList ? listDisplayTitle(actionList, actionList.listItems) : undefined}
        actions={
          actionList
            ? [
                {
                  key: "folder",
                  label: "Move to folder",
                  detail: actionList.folderId ? getFolderPathLabel(folders, actionList.folderId) : "Trove",
                  icon: <FolderInput size={20} color={colors.accentDark} />,
                  onPress: () => setMovingListId(actionList.id),
                },
                {
                  key: "delete",
                  label: "Delete list",
                  icon: <Trash2 size={20} color={colors.danger} />,
                  destructive: true,
                  onPress: () => confirmDelete(actionList.id),
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
