import Constants from "expo-constants";
import * as Sentry from "@sentry/react-native";

const extra = Constants.expoConfig?.extra ?? (Constants.manifest as any)?.extra ?? {};
const sentryDsn = process.env.EXPO_PUBLIC_SENTRY_DSN ?? extra.EXPO_PUBLIC_SENTRY_DSN ?? "";

export const isSentryConfigured = (): boolean => Boolean(sentryDsn);

export const initSentry = (): void => {
  if (!isSentryConfigured()) return;

  Sentry.init({
    dsn: sentryDsn,
  });
};

export const captureException = (error: unknown): void => {
  if (!isSentryConfigured()) return;

  Sentry.captureException(error);
};
