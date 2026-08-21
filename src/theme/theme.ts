export type ThemeColors = {
  background: string;
  surface: string;
  ink: string;
  muted: string;
  border: string;
  accent: string;
  accentDark: string;
  warm: string;
  danger: string;
  blue: string;
  skeleton: string;
  onAccent: string;
  // Solid-fill button backgrounds. Kept separate from accentDark/danger (which
  // are also used as small text/icon colors, where a darker shade would hurt
  // rather than help contrast) so onAccent text on top always clears 4.5:1.
  buttonPrimaryBg: string;
  buttonDangerBg: string;
};

export const lightColors: ThemeColors = {
  background: "#F8F4EF",
  surface: "#FFFFFF",
  ink: "#1D1B18",
  muted: "#756E66",
  border: "#E8DED2",
  accent: "#6E8F72",
  accentDark: "#43664A",
  warm: "#DFAE73",
  danger: "#B85B53",
  blue: "#6F8FAF",
  skeleton: "#E7DDD1",
  onAccent: "#FFFFFF",
  buttonPrimaryBg: "#43664A",
  buttonDangerBg: "#B85B53",
};

export const darkColors: ThemeColors = {
  background: "#17140F",
  surface: "#211D17",
  ink: "#F3EDE3",
  muted: "#A79C8C",
  border: "#3A342A",
  accent: "#8FB093",
  accentDark: "#6E8F72",
  warm: "#E8C08A",
  danger: "#D97F76",
  blue: "#8FADC8",
  skeleton: "#2E2921",
  onAccent: "#FFFFFF",
  // Darker than accentDark/danger specifically so white button text clears WCAG 4.5:1
  // (accentDark/danger themselves measure only 3.60:1 / 2.90:1 with white on top).
  buttonPrimaryBg: "#607C63",
  buttonDangerBg: "#C94B3E",
};

// Default/light export kept for any callers outside a component tree (e.g. static
// config). Components should prefer `useThemeColors()` so colors respond to theme.
export const colors = lightColors;

export const spacing = {
  xs: 6,
  sm: 10,
  md: 16,
  lg: 24,
  xl: 32,
};

export const radius = {
  sm: 10,
  md: 16,
  lg: 24,
};
