import React from "react";
import { StyleSheet, Text, View } from "react-native";
import type { LucideIcon } from "lucide-react-native";
import {
  Baby,
  BookOpen,
  Briefcase,
  CalendarDays,
  Camera,
  Car,
  Dumbbell,
  Film,
  Folder,
  Gamepad2,
  Gift,
  GraduationCap,
  Heart,
  House,
  Leaf,
  Lightbulb,
  Music,
  Palette,
  PawPrint,
  Plane,
  Shirt,
  ShoppingCart,
  Sprout,
  Star,
  Stethoscope,
  Sun,
  Tent,
  Utensils,
  Wallet,
  Wrench,
} from "lucide-react-native";

import { useThemeColors, useThemeScheme } from "../theme/ThemeContext";
import { withAlpha } from "../theme/theme";
import { FOLDER_ICON_PREFIX } from "../utils/folderIcon";

export { DEFAULT_FOLDER_ICON, FOLDER_ICON_PREFIX } from "../utils/folderIcon";

// A folder's icon: one of a small set of line icons in the folder's color,
// on a soft tint of it. Stored as "icon:<key>". A folder can still have an
// emoji instead, if someone picks one; the old default 📁 shows as the line
// folder.


export const FOLDER_ICONS: Array<{ key: string; label: string; Icon: LucideIcon }> = [
  { key: "folder", label: "Folder", Icon: Folder },
  { key: "house", label: "Home", Icon: House },
  { key: "briefcase", label: "Work", Icon: Briefcase },
  { key: "cart", label: "Shopping", Icon: ShoppingCart },
  { key: "utensils", label: "Food", Icon: Utensils },
  { key: "plane", label: "Travel", Icon: Plane },
  { key: "tent", label: "Outdoors", Icon: Tent },
  { key: "car", label: "Car", Icon: Car },
  { key: "heart", label: "Favorites", Icon: Heart },
  { key: "star", label: "Star", Icon: Star },
  { key: "gift", label: "Gifts", Icon: Gift },
  { key: "calendar", label: "Plans", Icon: CalendarDays },
  { key: "book", label: "Reading", Icon: BookOpen },
  { key: "school", label: "School", Icon: GraduationCap },
  { key: "lightbulb", label: "Ideas", Icon: Lightbulb },
  { key: "wallet", label: "Money", Icon: Wallet },
  { key: "health", label: "Health", Icon: Stethoscope },
  { key: "fitness", label: "Fitness", Icon: Dumbbell },
  { key: "baby", label: "Kids", Icon: Baby },
  { key: "pets", label: "Pets", Icon: PawPrint },
  { key: "garden", label: "Garden", Icon: Sprout },
  { key: "leaf", label: "Nature", Icon: Leaf },
  { key: "sun", label: "Summer", Icon: Sun },
  { key: "clothes", label: "Clothes", Icon: Shirt },
  { key: "tools", label: "Projects", Icon: Wrench },
  { key: "music", label: "Music", Icon: Music },
  { key: "film", label: "Movies", Icon: Film },
  { key: "games", label: "Games", Icon: Gamepad2 },
  { key: "camera", label: "Photos", Icon: Camera },
  { key: "palette", label: "Creative", Icon: Palette },
];

const iconsByKey = new Map(FOLDER_ICONS.map((icon) => [icon.key, icon]));

export type FolderIconValue = { kind: "icon"; Icon: LucideIcon } | { kind: "emoji"; emoji: string };

// What a stored icon shows: a line icon, or an emoji someone picked.
export const resolveFolderIcon = (icon?: string | null): FolderIconValue => {
  const value = icon?.trim() ?? "";
  if (value.startsWith(FOLDER_ICON_PREFIX)) {
    return { kind: "icon", Icon: iconsByKey.get(value.slice(FOLDER_ICON_PREFIX.length))?.Icon ?? Folder };
  }
  if (!value || value === "📁") return { kind: "icon", Icon: Folder };
  return { kind: "emoji", emoji: value };
};

export const folderIconKey = (key: string): string => `${FOLDER_ICON_PREFIX}${key}`;

// Folder colors are soft; on a light background the icon takes a deeper
// shade of its color so it reads clearly.
const mix = (hex: string, other: string, amount: number): string => {
  const parse = (value: string) => {
    const clean = value.replace("#", "").slice(0, 6);
    return [0, 2, 4].map((index) => parseInt(clean.slice(index, index + 2), 16));
  };
  const a = parse(hex);
  const b = parse(other);
  if ([...a, ...b].some((part) => Number.isNaN(part))) return hex;
  return `#${a
    .map((part, index) => Math.round(part + (b[index] - part) * amount).toString(16).padStart(2, "0"))
    .join("")}`;
};

type Props = {
  icon?: string | null;
  color?: string | null;
  size?: number;
};

export const FolderIcon = ({ icon, color, size = 36 }: Props) => {
  const colors = useThemeColors();
  const scheme = useThemeScheme();
  const tint = color ?? colors.muted;
  const stroke = scheme === "dark" ? tint : mix(tint, colors.ink, 0.45);
  const value = resolveFolderIcon(icon);
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        styles.box,
        { width: size, height: size, borderRadius: Math.round(size * 0.28), backgroundColor: withAlpha(tint.slice(0, 7), scheme === "dark" ? 0.22 : 0.28) },
      ]}
    >
      {value.kind === "icon" ? (
        <value.Icon size={Math.round(size * 0.52)} color={stroke} strokeWidth={2.2} />
      ) : (
        <Text style={{ fontSize: Math.round(size * 0.5) }}>{value.emoji}</Text>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  box: { alignItems: "center", justifyContent: "center" },
});
