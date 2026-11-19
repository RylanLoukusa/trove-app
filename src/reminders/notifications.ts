import { Platform } from "react-native";
import * as Notifications from "expo-notifications";

import { Reminder, reminderChanges } from "./reminderPlan";

// Reminders are local notifications scheduled on this device. Nothing is
// sent from a server, so each signed-in device reminds on its own.

const supported = Platform.OS === "ios" || Platform.OS === "android";
const CHANNEL_ID = "reminders";

let handlerSet = false;

// Shows a reminder even while Trove is open.
export const setUpReminderHandling = (): void => {
  if (!supported || handlerSet) return;
  handlerSet = true;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
  if (Platform.OS === "android") {
    void Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name: "Reminders",
      importance: Notifications.AndroidImportance.HIGH,
    }).catch(() => undefined);
  }
};

export type ReminderPermission = "granted" | "denied" | "undetermined" | "unsupported";

export const reminderPermission = async (): Promise<ReminderPermission> => {
  if (!supported) return "unsupported";
  try {
    const { status } = await Notifications.getPermissionsAsync();
    return status === "granted" ? "granted" : status === "denied" ? "denied" : "undetermined";
  } catch {
    return "unsupported";
  }
};

// Asks once, the first time someone gives a line a time.
export const askForReminderPermission = async (): Promise<ReminderPermission> => {
  const current = await reminderPermission();
  if (current !== "undetermined") return current;
  try {
    const { status } = await Notifications.requestPermissionsAsync();
    return status === "granted" ? "granted" : "denied";
  } catch {
    return "unsupported";
  }
};

// Makes this device's scheduled reminders match the plan. Says whether it
// could, which it can't before reminders are allowed.
export const applyReminders = async (plan: Reminder[]): Promise<boolean> => {
  if ((await reminderPermission()) !== "granted") return false;
  try {
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    const { cancel, add } = reminderChanges(
      scheduled.map((request) => request.identifier),
      plan,
    );
    await Promise.all(cancel.map((key) => Notifications.cancelScheduledNotificationAsync(key)));
    for (const reminder of add) {
      await Notifications.scheduleNotificationAsync({
        identifier: reminder.key,
        content: {
          title: reminder.title,
          body: reminder.body,
          sound: true,
          data: { listId: reminder.listId, entryId: reminder.entryId },
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: reminder.at,
          ...(Platform.OS === "android" ? { channelId: CHANNEL_ID } : {}),
        },
      });
    }
    return true;
  } catch (error) {
    console.warn("Could not schedule reminders", error);
    return false;
  }
};

// Calls back with the list a tapped reminder belongs to, including the one
// that opened the app.
export const onReminderOpened = (open: (listId: string) => void): (() => void) => {
  if (!supported) return () => undefined;
  const listIdOf = (response: Notifications.NotificationResponse | null): string | undefined => {
    const listId = response?.notification.request.content.data?.listId;
    return typeof listId === "string" ? listId : undefined;
  };
  void Notifications.getLastNotificationResponseAsync()
    .then((response) => {
      const listId = listIdOf(response);
      if (listId) open(listId);
    })
    .catch(() => undefined);
  const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
    const listId = listIdOf(response);
    if (listId) open(listId);
  });
  return () => subscription.remove();
};
