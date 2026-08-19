import "react-native-gesture-handler";
import React from "react";
import { ActivityIndicator, AppState, View } from "react-native";
import * as Sentry from "@sentry/react-native";
import { DarkTheme, DefaultTheme, LinkingOptions, NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AuthProvider, useAuth } from "./src/auth/AuthContext";
import { clearPendingFolderInviteToken, readPendingFolderInviteToken } from "./src/collaboration/folderSharing";
import { ErrorBoundary } from "./src/components/ErrorBoundary";
import { EntitlementProvider } from "./src/entitlements/EntitlementContext";
import { initSentry } from "./src/lib/sentry";
import { navigationRef } from "./src/navigation/navigationRef";
import { OnboardingTourProvider } from "./src/onboarding/OnboardingTourContext";
import { ThemeProvider, useThemeColors, useThemeScheme } from "./src/theme/ThemeContext";
import { useTrove, TroveProvider } from "./src/storage/storage";
import { RootStackParamList } from "./src/navigation/types";
import { AcceptFolderInviteScreen } from "./src/screens/AcceptFolderInviteScreen";
import { AddEditFolderScreen } from "./src/screens/AddEditFolderScreen";
import { AddEditItemScreen } from "./src/screens/AddEditItemScreen";
import { AddEditTagGroupScreen } from "./src/screens/AddEditTagGroupScreen";
import { FolderScreen } from "./src/screens/FolderScreen";
import { HomeScreen } from "./src/screens/HomeScreen";
import { ItemDetailScreen } from "./src/screens/ItemDetailScreen";
import { LoginScreen } from "./src/screens/LoginScreen";
import { ManageTagsScreen } from "./src/screens/ManageTagsScreen";
import { OnboardingScreen } from "./src/screens/OnboardingScreen";
import { PaywallScreen } from "./src/screens/PaywallScreen";
import { PublicFolderPreviewScreen } from "./src/screens/PublicFolderPreview";
import { PublicItemDetailScreen } from "./src/screens/PublicItemDetail";
import { ProfileScreen } from "./src/screens/ProfileScreen";
import { ResetPasswordScreen } from "./src/screens/ResetPasswordScreen";
import { SearchScreen } from "./src/screens/SearchScreen";
import { SettingsScreen } from "./src/screens/SettingsScreen";
import { ShareFolderScreen } from "./src/screens/ShareFolderScreen";
import { SyncConflictScreen } from "./src/screens/SyncConflictScreen";
import { clearSharedImport, getLatestSharedImportId, inferSourcePlatform, markSharedImportConsumed, readSharedImport, titleFromSharedImport } from "./src/share/sharedImport";

initSentry();

const Stack = createNativeStackNavigator<RootStackParamList>();

const linking: LinkingOptions<RootStackParamList> = {
  prefixes: ["https://trovecollections.app", "trove://"],
  config: {
    screens: {
      AcceptFolderInvite: "share-invite/:token",
      PublicFolderPreview: "shared/:token",
      AddEditItem: "shared-import/:sharedImportId",
      ShareFolder: "folder/:folderId/share",
      Folder: "folder/:folderId",
      Home: "home",
      ItemDetail: "item/:itemId",
      Login: "login",
      Profile: "profile",
      Search: "search",
      Settings: "settings",
      SyncConflict: "sync-conflict",
    },
  },
};

function AppNavigator() {
  const { session, isAuthReady, isPasswordRecovery } = useAuth();
  const { createItem, folders, isReady: isTroveReady } = useTrove();
  const scheme = useThemeScheme();
  const themeColors = useThemeColors();
  const lastHandledSharedImportId = React.useRef<string | null>(null);
  const lastHandledInviteToken = React.useRef<string | null>(null);

  const openPendingSharedImport = React.useCallback(async () => {
    if (!session || isPasswordRecovery || !isTroveReady || !navigationRef.isReady()) return;

    let importId: string | null = null;
    try {
      importId = await getLatestSharedImportId();
    } catch {
      return;
    }

    if (!importId || lastHandledSharedImportId.current === importId) return;

    const payload = await readSharedImport(importId);

    if (payload?.autoSave && payload.folderId !== undefined) {
      const folderId =
        payload.folderId === "" || folders.some((folder) => folder.id === payload.folderId)
          ? payload.folderId
          : "";

      const mediaItems = payload.mediaItems ?? [];
      const type = mediaItems.length > 0 ? "media" : payload.sourceUrl ? "link" : "text";

      createItem({
        attachments: undefined,
        description: type === "text" ? payload.sharedText?.trim() || undefined : undefined,
        folderId,
        listItems: undefined,
        media: mediaItems[0],
        mediaItems: mediaItems.length ? mediaItems : undefined,
        richText: type === "text" ? payload.sharedText?.trim() || undefined : undefined,
        sharedText: payload.sharedText?.trim() || undefined,
        sourcePlatform: inferSourcePlatform(payload.sourceUrl),
        sourceUrl: payload.sourceUrl?.trim() || undefined,
        tagOptionIds: [],
        title: titleFromSharedImport(payload),
        type,
        url: type === "link" ? payload.sourceUrl?.trim() || undefined : undefined,
      });
      if (mediaItems.length > 0) {
        await markSharedImportConsumed(importId);
      } else {
        await clearSharedImport(importId);
      }
      lastHandledSharedImportId.current = importId;
      return;
    }

    if (!payload) return;

    const currentRoute = navigationRef.getCurrentRoute();
    const currentParams = currentRoute?.params as { sharedImportId?: string } | undefined;
    if (currentRoute?.name === "AddEditItem" && currentParams?.sharedImportId === importId) {
      lastHandledSharedImportId.current = importId;
      return;
    }

    lastHandledSharedImportId.current = importId;
    navigationRef.navigate("AddEditItem", { sharedImportId: importId });
  }, [createItem, folders, isPasswordRecovery, isTroveReady, session]);

  React.useEffect(() => {
    void openPendingSharedImport();
  }, [openPendingSharedImport]);

  const openPendingFolderInvite = React.useCallback(async () => {
    if (!session || isPasswordRecovery || !navigationRef.isReady()) return;

    const token = await readPendingFolderInviteToken();
    if (!token || lastHandledInviteToken.current === token) return;

    lastHandledInviteToken.current = token;
    await clearPendingFolderInviteToken();
    navigationRef.navigate("AcceptFolderInvite", { token });
  }, [isPasswordRecovery, session]);

  React.useEffect(() => {
    void openPendingFolderInvite();
  }, [openPendingFolderInvite]);

  React.useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        void openPendingSharedImport();
        void openPendingFolderInvite();
      }
    });

    return () => {
      subscription.remove();
    };
  }, [openPendingFolderInvite, openPendingSharedImport]);

  if (!isAuthReady) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  const navigationTheme = {
    ...(scheme === "dark" ? DarkTheme : DefaultTheme),
    colors: {
      ...(scheme === "dark" ? DarkTheme.colors : DefaultTheme.colors),
      background: themeColors.background,
      card: themeColors.surface,
      border: themeColors.border,
      text: themeColors.ink,
      primary: themeColors.accentDark,
    },
  };

  return (
    <NavigationContainer
      ref={navigationRef}
      linking={linking}
      theme={navigationTheme}
      onReady={() => {
        void openPendingSharedImport();
        void openPendingFolderInvite();
      }}
    >
      <StatusBar style={scheme === "dark" ? "light" : "dark"} />
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {isPasswordRecovery ? (
          <Stack.Screen name="ResetPassword" component={ResetPasswordScreen} />
        ) : session ? (
          <>
            <Stack.Screen name="Home" component={HomeScreen} />
            <Stack.Screen name="Onboarding" component={OnboardingScreen} options={{ gestureEnabled: false }} />
            <Stack.Screen name="AcceptFolderInvite" component={AcceptFolderInviteScreen} />
            <Stack.Screen name="PublicFolderPreview" component={PublicFolderPreviewScreen} />
            <Stack.Screen name="PublicItemDetail" component={PublicItemDetailScreen} />
            <Stack.Screen name="Folder" component={FolderScreen} />
            <Stack.Screen name="AddEditFolder" component={AddEditFolderScreen} />
            <Stack.Screen name="AddEditItem" component={AddEditItemScreen} />
            <Stack.Screen name="ItemDetail" component={ItemDetailScreen} options={{ gestureEnabled: false }} />
            <Stack.Screen name="Search" component={SearchScreen} />
            <Stack.Screen name="Profile" component={ProfileScreen} />
            <Stack.Screen name="SyncConflict" component={SyncConflictScreen} />
            <Stack.Screen name="Settings" component={SettingsScreen} />
            <Stack.Screen name="ManageTags" component={ManageTagsScreen} />
            <Stack.Screen name="AddEditTagGroup" component={AddEditTagGroupScreen} />
            <Stack.Screen name="ShareFolder" component={ShareFolderScreen} />
            <Stack.Screen name="Paywall" component={PaywallScreen} options={{ presentation: "modal" }} />
          </>
        ) : (
          <>
            <Stack.Screen name="Login" component={LoginScreen} />
            <Stack.Screen name="AcceptFolderInvite" component={AcceptFolderInviteScreen} />
            <Stack.Screen name="PublicFolderPreview" component={PublicFolderPreviewScreen} />
            <Stack.Screen name="PublicItemDetail" component={PublicItemDetailScreen} />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <GestureHandlerRootView style={{ flex: 1 }}>
          <SafeAreaProvider>
            <AuthProvider>
              <EntitlementProvider>
                <TroveProvider>
                  <OnboardingTourProvider>
                    <AppNavigator />
                  </OnboardingTourProvider>
                </TroveProvider>
              </EntitlementProvider>
            </AuthProvider>
          </SafeAreaProvider>
        </GestureHandlerRootView>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default Sentry.wrap(App);
