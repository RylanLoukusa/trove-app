import React, { useMemo } from "react";
import { FilePlus2, LayoutTemplate, LibraryBig } from "lucide-react-native";

import type { MenuAction } from "./MenuSheet";
import { useTrove } from "../storage/storage";
import { useThemeColors } from "../theme/ThemeContext";
import { listDisplayTitle } from "../utils/listEntries";

const TEMPLATES_SHOWN = 5;

// What the New list button offers: a blank list first, then the person's own
// templates, then every template (ready-made ones too). A list made from a
// template goes where the button is, like a blank one.
export const useNewListActions = ({
  folderId,
  onBlank,
  onOpen,
  onBrowse,
}: {
  folderId?: string;
  onBlank: () => void;
  onOpen: (listId: string) => void;
  onBrowse: () => void;
}): MenuAction[] => {
  const colors = useThemeColors();
  const { templates, copyItem } = useTrove();
  return useMemo(() => {
    const own = [...(templates ?? [])]
      .map((template) => ({ template, title: listDisplayTitle(template, template.listItems) }))
      .sort((a, b) => a.title.localeCompare(b.title))
      .slice(0, TEMPLATES_SHOWN);
    return [
      { key: "blank", label: "Blank list", icon: <FilePlus2 size={20} color={colors.accentDark} />, onPress: onBlank },
      ...own.map(({ template, title }, index) => ({
        key: `template-${template.id}`,
        label: title,
        icon: <LayoutTemplate size={20} color={colors.accentDark} />,
        separated: index === 0,
        onPress: () => {
          const list = copyItem(template.id, { title, fresh: true, ...(folderId ? { folderId } : {}) });
          if (list) onOpen(list.id);
        },
      })),
      {
        key: "templates",
        label: own.length > 0 ? "More templates" : "From a template",
        icon: <LibraryBig size={20} color={colors.accentDark} />,
        separated: true,
        onPress: onBrowse,
      },
    ];
  }, [colors.accentDark, copyItem, folderId, onBlank, onBrowse, onOpen, templates]);
};
