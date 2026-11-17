// Native modules that jest-expo's preset doesn't auto-mock, but that get
// pulled in transitively by common components (e.g. ItemCard -> VideoPreview).
// Add to this as new screen/component tests hit similar native-module crashes.

jest.mock("expo-video", () => ({
  useVideoPlayer: () => ({
    play: jest.fn(),
    pause: jest.fn(),
    replay: jest.fn(),
  }),
  VideoView: "VideoView",
}));

// Real module sets up native listeners/timers on import even when Sentry.init()
// is never called (DSN unset in tests), leaving a worker process dangling.
jest.mock("@sentry/react-native", () => ({
  init: jest.fn(),
  captureException: jest.fn(),
  wrap: (component) => component,
}));

// Local notifications for reminders: nothing is scheduled in tests.
jest.mock("expo-notifications", () => ({
  setNotificationHandler: jest.fn(),
  setNotificationChannelAsync: jest.fn(() => Promise.resolve(null)),
  getPermissionsAsync: jest.fn(() => Promise.resolve({ status: "undetermined" })),
  requestPermissionsAsync: jest.fn(() => Promise.resolve({ status: "granted" })),
  getAllScheduledNotificationsAsync: jest.fn(() => Promise.resolve([])),
  cancelScheduledNotificationAsync: jest.fn(() => Promise.resolve()),
  scheduleNotificationAsync: jest.fn(() => Promise.resolve("id")),
  getLastNotificationResponseAsync: jest.fn(() => Promise.resolve(null)),
  addNotificationResponseReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
  AndroidImportance: { HIGH: 4 },
  SchedulableTriggerInputTypes: { DATE: "date" },
}));
