const NETWORK_ERROR_PATTERNS = [
  /network request failed/i,
  /failed to fetch/i,
  /network error/i,
  /could not connect/i,
  /internet connection appears to be offline/i,
  /fetch failed/i,
  /load failed/i,
  /the request timed out/i,
];

export const isNetworkErrorMessage = (message: string): boolean =>
  NETWORK_ERROR_PATTERNS.some((pattern) => pattern.test(message));

/**
 * Normalizes a raw error message for display. Network-shaped failures (dropped
 * connection, offline, timeout) get a consistent, friendly message instead of
 * whatever raw text the fetch/Supabase client happened to produce.
 */
export const friendlyErrorMessage = (
  message: string | null | undefined,
  fallback = "Something went wrong. Please try again.",
): string => {
  const text = message?.trim();
  if (!text) return fallback;

  return isNetworkErrorMessage(text) ? "You're offline. Check your connection and try again." : text;
};
