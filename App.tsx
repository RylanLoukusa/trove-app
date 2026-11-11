import "react-native-gesture-handler";
import React from "react";
import { ActivityIndicator, Alert, AppState, View } from "react-native";
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
import { AddEditTagGroupScreen } from "./src/screens/AddEditTagGroupScreen";
import { FolderScreen } from "./src/screens/FolderScreen";
import { HomeScreen } from "./src/screens/HomeScreen";
import { ListScreen } from "./src/screens/ListScreen";
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
import {
  clearSharedImport,
  getLatestSharedImportId,
  lineFromSharedImport,
  readSharedImport,
  SHARED_INBOX_TITLE,
} from "./src/share/sharedImport";
import { createId } from "./src/utils/id";

initSentry();

const Stack = createNativeStackNavigator<RootStackParamList>();

const linking: LinkingOptions<RootStackParamList> = {
  prefixes: ["https://trovecollections.app", "trove://"],
  config: {
    screens: {
      AcceptFolderInvite: "share-invite/:token",
      PublicFolderPreview: "shared/:token",
      ShareFolder: "folder/:folderId/share",
      Folder: "folder/:folderId",
      Home: "home",
      List: "item/:listId",
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
  const { canEditItem, createItem, folders, insertListEntries, isReady: isTroveReady, items } = useTrove();
  const scheme = useThemeScheme();
  const themeColors = useThemeColors();
  const lastHandledSharedImportId = React.useRef<string | null>(null);
  const lastHandledInviteToken = React.useRef<string | null>(null);

  // Something shared into Trove from another app becomes a line on the Inbox
  // list of the folder that was picked (or of the top level).
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
    if (!payload) return;
    lastHandledSharedImportId.current = importId;

    const text = lineFromSharedImport(payload);
    if (text) {
      const folderId = payload.folderId && folders.some((folder) => folder.id === payload.folderId) ? payload.folderId : "";
      const inbox = items.find(
        (item) =>
          item.type === "list" && item.folderId === folderId && item.title === SHARED_INBOX_TITLE && canEditItem(item.id),
      );
      const listId = inbox
        ? insertListEntries(inbox.id, null, [{ text, kind: "check" }]).length
          ? inbox.id
          : null
        : createItem({
            folderId,
            listItems: [{ id: createId("entry"), kind: "check", text }],
            tagOptionIds: [],
            title: SHARED_INBOX_TITLE,
            type: "list",
          })?.id ?? null;
      if (listId && !payload.autoSave) navigationRef.navigate("List", { listId });
    } else if ((payload.mediaItems ?? []).length > 0) {
      Alert.alert("Nothing to add", "Trove keeps lists, so it can save words or a link you share, but not photos or videos.");
    }

    // The whole import goes, including any photos or videos the share sheet
    // copied in, which a list has no place for.
    await clearSharedImport(importId);
  }, [canEditItem, createItem, folders, insertListEntries, isPasswordRecovery, isTroveReady, items, session]);

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
            <Stack.Screen name="List" component={ListScreen} />
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
