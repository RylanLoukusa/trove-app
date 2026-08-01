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
