import React from "react";
import { Alert, Share } from "react-native";
import { fireEvent, screen, waitFor } from "@testing-library/react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { Session } from "@supabase/supabase-js";
import { SettingsScreen } from "./index";
import { useAuth, useIsSupabaseConfigured } from "../../auth/AuthContext";
import { useEntitlement } from "../../entitlements/EntitlementContext";
import { useTrove } from "../../storage/storage";
import { deleteStoredMediaForItems } from "../../lib/supabaseStorage";
import { ThemeProvider } from "../../theme/ThemeContext";
import type { Folder, SavedItem } from "../../types/models";
import type { RootStackParamList } from "../../navigation/types";
import { renderScreen } from "../../test-utils/renderScreen";

jest.mock("../../auth/AuthContext", () => ({
  useAuth: jest.fn(),
  useIsSupabaseConfigured: jest.fn(),
}));

jest.mock("../../storage/storage", () => ({
  useTrove: jest.fn(),
}));

jest.mock("../../entitlements/EntitlementContext", () => ({
  useEntitlement: jest.fn(),
}));

jest.mock("../../lib/supabaseStorage", () => ({
  deleteStoredMediaForItems: jest.fn(),
}));

const mockUseAuth = useAuth as jest.Mock;
const mockUseIsSupabaseConfigured = useIsSupabaseConfigured as jest.Mock;
const mockUseTrove = useTrove as jest.Mock;
const mockUseEntitlement = useEntitlement as jest.Mock;
const mockDeleteStoredMediaForItems = deleteStoredMediaForItems as jest.Mock;

const mockWrittenFiles: Array<{ name: string; content: string }> = [];
jest.mock("expo-file-system", () => ({
  Paths: { cache: "cache" },
  File: class {
    uri: string;
    fileName: string;
    exists = false;
    constructor(_folder: string, fileName: string) {
      this.fileName = fileName;
      this.uri = `file:///cache/${fileName}`;
    }
    create() {}
    delete() {}
    write(content: string) {
      mockWrittenFiles.push({ name: this.fileName, content });
    }
  },
}));

const folders: Folder[] = [];
const items: SavedItem[] = [];

const navigation = {
  navigate: jest.fn(),
  goBack: jest.fn(),
  canGoBack: jest.fn().mockReturnValue(true),
} as unknown as NativeStackScreenProps<RootStackParamList, "Settings">["navigation"];

const signOut = jest.fn();
const deleteAccount = jest.fn();
const resetToSeed = jest.fn();
const clearLocalData = jest.fn();

const signedInSession = { user: { id: "u1", email: "a@b.com", app_metadata: {} } } as unknown as Session;

const setAuthState = (session: Session | null) => {
  mockUseAuth.mockReturnValue({
    session,
    isAuthReady: true,
    signOut,
    deleteAccount,
  });
};

const renderSettingsScreen = async () => {
  mockUseTrove.mockReturnValue({
    folders,
    isReady: true,
    items,
    resetToSeed,
    clearLocalData,
    getExportData: () => ({ folders, items, listEntries: [], tagGroups: [], tagOptions: [] }),
  });
  mockUseEntitlement.mockReturnValue({
    isPro: false,
    isLoading: false,
    presentPaywall: jest.fn(),
    restorePurchases: jest.fn(),
    setDevIsPro: jest.fn(),
  });
  await renderScreen(
    <ThemeProvider>
      <SettingsScreen navigation={navigation} route={{} as never} />
    </ThemeProvider>,
  );
};

describe("SettingsScreen", () => {
  let alertSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    mockUseIsSupabaseConfigured.mockReturnValue(true);
    mockDeleteStoredMediaForItems.mockResolvedValue({ ok: true });
    alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => {});
  });

  afterEach(() => {
    alertSpy.mockRestore();
  });

  it("shows a login prompt when signed out", async () => {
    setAuthState(null);
    await renderSettingsScreen();

    const loginButton = screen.getByText("Go to login screen");
    await fireEvent.press(loginButton);

    expect(navigation.navigate).toHaveBeenCalledWith("Login");
  });

  it("signs out when Sign out is pressed", async () => {
    setAuthState(signedInSession);
    await renderSettingsScreen();

    await fireEvent.press(screen.getByText("Sign out"));

    expect(signOut).toHaveBeenCalledTimes(1);
  });

  it("deletes the account after confirming the destructive alert", async () => {
    setAuthState(signedInSession);
    deleteAccount.mockResolvedValue({});
    alertSpy.mockImplementation((_title, _message, buttons) => {
      const destructive = Array.isArray(buttons)
        ? (buttons as Array<{ style?: string; onPress?: () => void }>).find((button) => button.style === "destructive")
        : undefined;
      destructive?.onPress?.();
    });

    await renderSettingsScreen();
    await fireEvent.press(screen.getByText("Delete account"));

    expect(mockDeleteStoredMediaForItems).toHaveBeenCalledWith(items);
    expect(deleteAccount).toHaveBeenCalledTimes(1);
    expect(clearLocalData).toHaveBeenCalledTimes(1);
  });

  it("does not delete the account if the confirmation is cancelled", async () => {
    setAuthState(signedInSession);
    // alertSpy's default mock (beforeEach) never invokes any button, simulating "Cancel".
    await renderSettingsScreen();
    await fireEvent.press(screen.getByText("Delete account"));

    expect(deleteAccount).not.toHaveBeenCalled();
  });

  it("switches the theme preference when a pill is pressed", async () => {
    setAuthState(signedInSession);
    await renderSettingsScreen();

    const darkPill = screen.getByText("Dark");
    expect(darkPill.parent?.props.accessibilityState).toEqual({ selected: false });

    await fireEvent.press(darkPill);

    expect(darkPill.parent?.props.accessibilityState).toEqual({ selected: true });
  });

  it("shows a setup message when Supabase is not configured", async () => {
    mockUseIsSupabaseConfigured.mockReturnValue(false);
    setAuthState(null);
    await renderSettingsScreen();

    expect(screen.getByText(/Add EXPO_PUBLIC_SUPABASE_URL/)).toBeTruthy();
    expect(screen.queryByText("Go to login screen")).toBeNull();
  });

  it("exports everything as a text file and as a backup file", async () => {
    setAuthState(null);
    const shareSpy = jest.spyOn(Share, "share").mockResolvedValue({ action: "sharedAction" });
    mockWrittenFiles.length = 0;
    await renderSettingsScreen();

    await fireEvent.press(screen.getByText("Export everything as text"));
    await waitFor(() => expect(shareSpy).toHaveBeenCalledTimes(1));
    await fireEvent.press(screen.getByText("Export a backup file"));
    await waitFor(() => expect(shareSpy).toHaveBeenCalledTimes(2));

    expect(mockWrittenFiles.map((file) => file.name)).toEqual([
      expect.stringMatching(/^trove-\d{4}-\d{2}-\d{2}\.md$/),
      expect.stringMatching(/^trove-\d{4}-\d{2}-\d{2}\.json$/),
    ]);
    expect(JSON.parse(mockWrittenFiles[1].content)).toMatchObject({ format: "trove-backup", version: 1, lists: [] });
    expect(shareSpy.mock.calls[1][0]).toEqual({ url: expect.stringMatching(/^file:\/\/\/cache\/trove-.*\.json$/) });
    shareSpy.mockRestore();
  });
});
