const { config } = require("dotenv");
const appJson = require("./app.json");

config();

const googleIosClientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID ?? "";
const googleIosUrlScheme = googleIosClientId.endsWith(".apps.googleusercontent.com")
  ? `com.googleusercontent.apps.${googleIosClientId.slice(0, -".apps.googleusercontent.com".length)}`
  : "";

module.exports = {
  expo: {
    ...appJson.expo,
    ios: {
      ...appJson.expo.ios,
      usesAppleSignIn: true,
    },
    android: {
      package: "com.rylanloukusa.thewaitinglist",
      adaptiveIcon: {
        foregroundImage: "./assets/icon.png",
        backgroundColor: "#173F2A",
      },
    },
    plugins: [
      "expo-apple-authentication",
      "expo-video",
      googleIosUrlScheme
        ? ["@react-native-google-signin/google-signin", { iosUrlScheme: googleIosUrlScheme }]
        : "@react-native-google-signin/google-signin",
      [
        "expo-image-picker",
        {
          photosPermission: "Allow Trove to access your photos and videos so you can attach media to saved items.",
          cameraPermission: "Allow Trove to use your camera so you can capture media for saved items.",
          microphonePermission: "Allow Trove to use your microphone when capturing videos.",
        },
      ],
    ],
    extra: {
      eas: {
        projectId: "1fc21b11-d445-439e-8ac1-87d440b50c21",
      },
      EXPO_PUBLIC_SUPABASE_URL: process.env.EXPO_PUBLIC_SUPABASE_URL ?? "",
      EXPO_PUBLIC_SUPABASE_ANON_KEY: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "",
      EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID: googleIosClientId,
      EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? "",
    },
  },
};
