import React from "react";
import { Alert } from "react-native";
import { fireEvent, screen } from "@testing-library/react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { SyncConflictScreen } from "./index";
import { useTrove } from "../../storage/storage";
import type { SyncSnapshot } from "../../sync/syncStatus";
import type { RootStackParamList } from "../../navigation/types";
import { renderScreen } from "../../test-utils/renderScreen";

jest.mock("../../storage/storage", () => ({
  useTrove: jest.fn(),
}));

const mockUseTrove = useTrove as jest.Mock;

const navigation = {
  navigate: jest.fn(),
  goBack: jest.fn(),
  canGoBack: jest.fn().mockReturnValue(true),
} as unknown as NativeStackScreenProps<RootStackParamList, "SyncConflict">["navigation"];

const resolveSyncConflict = jest.fn();

const noConflictSnapshot: SyncSnapshot = { retryCount: 0, status: "synced" };

const conflictSnapshot: SyncSnapshot = {
  retryCount: 1,
  status: "conflicted",
  conflict: {
    entityId: "recipes",
    entityKind: "folders",
    reason: "remote_changed",
    localLabel: "Recipes",
    localUpdatedAt: "2026-01-01T00:00:00.000Z",
    remoteUpdatedAt: "2026-01-02T00:00:00.000Z",
    fields: [
      { field: "name", localValue: "Recipes", remoteValue: "Recipe Box" },
    ],
  },
};

const renderSyncConflictScreen = async (syncSnapshot: SyncSnapshot) => {
  mockUseTrove.mockReturnValue({ folders: [], items: [], resolveSyncConflict, syncSnapshot });
  await renderScreen(<SyncConflictScreen navigation={navigation} route={{} as never} />);
};

describe("SyncConflictScreen", () => {
  let alertSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => {});
  });

  afterEach(() => {
    alertSpy.mockRestore();
  });

  it("shows a fallback message when there is no active conflict", async () => {
    await renderSyncConflictScreen(noConflictSnapshot);

    expect(screen.getByText("There is no active sync conflict.")).toBeTruthy();

    await fireEvent.press(screen.getByText("Back to Trove"));
    expect(navigation.goBack).toHaveBeenCalledTimes(1);
  });

  it("shows the conflicting entity and its changed fields", async () => {
    await renderSyncConflictScreen(conflictSnapshot);

    expect(screen.getAllByText("Recipes").length).toBeGreaterThan(0);
    expect(screen.getByText("Recipe Box")).toBeTruthy();
    expect(screen.getByText("name")).toBeTruthy();
  });

  it("saves selected fields as a merge resolution", async () => {
    resolveSyncConflict.mockResolvedValue({ ok: true });
    await renderSyncConflictScreen(conflictSnapshot);

    await fireEvent.press(screen.getByText("Latest synced"));
    await fireEvent.press(screen.getByText("Save selected fields"));

    expect(resolveSyncConflict).toHaveBeenCalledWith({
      fieldChoices: { name: "remote" },
      kind: "merge",
    });
  });

  it("uses the latest synced version and goes back on success", async () => {
    resolveSyncConflict.mockResolvedValue({ ok: true });
    await renderSyncConflictScreen(conflictSnapshot);

    await fireEvent.press(screen.getByText("Use latest synced version"));

    expect(resolveSyncConflict).toHaveBeenCalledWith("useRemote");
    expect(navigation.goBack).toHaveBeenCalledTimes(1);
  });

  it("keeps the local version after confirming the destructive alert", async () => {
    resolveSyncConflict.mockResolvedValue({ ok: true });
    alertSpy.mockImplementation((_title, _message, buttons) => {
      const destructive = Array.isArray(buttons)
        ? (buttons as Array<{ style?: string; onPress?: () => void }>).find((button) => button.style === "destructive")
        : undefined;
      destructive?.onPress?.();
    });

    await renderSyncConflictScreen(conflictSnapshot);
    await fireEvent.press(screen.getByText("Keep this device's version"));

    expect(resolveSyncConflict).toHaveBeenCalledWith("keepLocal");
  });

  it("alerts when a resolution attempt fails", async () => {
    resolveSyncConflict.mockResolvedValue({ ok: false, error: "Still conflicted" });
    await renderSyncConflictScreen(conflictSnapshot);

    await fireEvent.press(screen.getByText("Use latest synced version"));

    expect(alertSpy).toHaveBeenCalledWith("Could not resolve conflict", "Still conflicted");
    expect(navigation.goBack).not.toHaveBeenCalled();
  });
});
