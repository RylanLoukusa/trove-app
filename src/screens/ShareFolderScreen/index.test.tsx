import React from "react";
import { Alert, Share } from "react-native";
import { fireEvent, screen, waitFor } from "@testing-library/react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { Session } from "@supabase/supabase-js";
import { ShareFolderScreen } from "./index";
import { useAuth } from "../../auth/AuthContext";
import { useEntitlement } from "../../entitlements/EntitlementContext";
import { useTrove } from "../../storage/storage";
import {
  loadFolderSharing,
  loadSavedCollaborators,
  removeFolderShare,
  revokeFolderInvite,
  shareFolderByEmail,
  updateFolderShare,
} from "../../collaboration/folderSharing";
import {
  createPublicLink,
  loadPublicLinkStatus,
  revokePublicLink,
} from "../../collaboration/folderPublicLinks";
import { getSupabase } from "../../lib/supabase";
import type { Folder } from "../../types/models";
import type { RootStackParamList } from "../../navigation/types";
import { renderScreen } from "../../test-utils/renderScreen";

jest.mock("../../auth/AuthContext", () => ({
  useAuth: jest.fn(),
}));

jest.mock("../../storage/storage", () => ({
  useTrove: jest.fn(),
}));

jest.mock("../../entitlements/EntitlementContext", () => ({
  useEntitlement: jest.fn(),
}));

jest.mock("../../collaboration/folderSharing", () => ({
  buildFolderInviteLink: jest.fn().mockReturnValue("https://trovecollections.app/share-invite/token"),
  loadFolderSharing: jest.fn(),
  loadSavedCollaborators: jest.fn(),
  removeFolderShare: jest.fn(),
  revokeFolderInvite: jest.fn(),
  shareFolderByEmail: jest.fn(),
  shareFolderWithCollaborator: jest.fn(),
  updateFolderShare: jest.fn(),
}));

jest.mock("../../collaboration/folderPublicLinks", () => ({
  buildPublicFolderLink: jest.fn().mockReturnValue("https://trovecollections.app/shared/token"),
  createPublicLink: jest.fn(),
  loadPublicLinkStatus: jest.fn(),
  revokePublicLink: jest.fn(),
}));

jest.mock("../../lib/supabase", () => ({
  getSupabase: jest.fn(),
}));

const mockUseAuth = useAuth as jest.Mock;
const mockUseTrove = useTrove as jest.Mock;
const mockUseEntitlement = useEntitlement as jest.Mock;
const mockLoadFolderSharing = loadFolderSharing as jest.Mock;
const mockLoadSavedCollaborators = loadSavedCollaborators as jest.Mock;
const mockShareFolderByEmail = shareFolderByEmail as jest.Mock;
const mockRemoveFolderShare = removeFolderShare as jest.Mock;
const mockRevokeFolderInvite = revokeFolderInvite as jest.Mock;
const mockUpdateFolderShare = updateFolderShare as jest.Mock;
const mockLoadPublicLinkStatus = loadPublicLinkStatus as jest.Mock;
const mockCreatePublicLink = createPublicLink as jest.Mock;
const mockRevokePublicLink = revokePublicLink as jest.Mock;
const mockGetSupabase = getSupabase as jest.Mock;

const makeFolder = (overrides: Partial<Folder>): Folder => ({
  id: "folder-1",
  name: "Folder",
  parentFolderId: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  ...overrides,
});

const navigation = {
  navigate: jest.fn(),
  goBack: jest.fn(),
  canGoBack: jest.fn().mockReturnValue(true),
} as unknown as NativeStackScreenProps<RootStackParamList, "ShareFolder">["navigation"];

const session = { user: { id: "owner-1", email: "owner@b.com", app_metadata: {} } } as unknown as Session;
const syncFolderForSharing = jest.fn();
const refreshFromRemote = jest.fn();
const presentPaywall = jest.fn();

const renderShareFolderScreen = async (
  folders: Folder[],
  folderId = "recipes",
  overrides: { isPro?: boolean } = {},
) => {
  mockUseAuth.mockReturnValue({ session });
  mockUseTrove.mockReturnValue({ folders, refreshFromRemote, syncFolderForSharing });
  mockUseEntitlement.mockReturnValue({
    isPro: overrides.isPro ?? true,
    isLoading: false,
    presentPaywall,
    restorePurchases: jest.fn(),
    setDevIsPro: jest.fn(),
  });
  const route = { params: { folderId } } as unknown as NativeStackScreenProps<RootStackParamList, "ShareFolder">["route"];
  await renderScreen(<ShareFolderScreen navigation={navigation} route={route} />);
};

describe("ShareFolderScreen", () => {
  let alertSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetSupabase.mockReturnValue({});
    mockLoadFolderSharing.mockResolvedValue({ access: [], invites: [] });
    mockLoadSavedCollaborators.mockResolvedValue({ collaborators: [] });
    mockLoadPublicLinkStatus.mockResolvedValue({ link: undefined });
    refreshFromRemote.mockResolvedValue({ ok: true });
    alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => {});
  });

  afterEach(() => {
    alertSpy.mockRestore();
  });

  it("shows a not-found state for a missing folder", async () => {
    await renderShareFolderScreen([], "missing-folder");

    expect(screen.getByText("Folder not found")).toBeTruthy();
  });

  it("loads and shows people with access and pending invites", async () => {
    mockLoadFolderSharing.mockResolvedValue({
      access: [
        { id: "a1", userId: "owner-1", kind: "owner", role: "owner", scope: "all", displayName: "Owner Person" },
        { id: "a2", userId: "friend-1", kind: "direct", role: "viewer", scope: "folder_only", shareId: "share-1", displayName: "Friend Person" },
      ],
      invites: [
        { id: "i1", folderId: "recipes", ownerId: "owner-1", email: "pending@b.com", role: "viewer", scope: "folder_only", status: "pending", token: "tok", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" },
      ],
    });

    await renderShareFolderScreen([makeFolder({ id: "recipes", name: "Recipes" })]);

    await waitFor(() => expect(screen.getByText("Friend Person")).toBeTruthy());
    expect(screen.getByText("pending@b.com")).toBeTruthy();
  });

  it("shows a locked upsell instead of the invite form when not Pro", async () => {
    await renderShareFolderScreen([makeFolder({ id: "recipes", name: "Recipes" })], "recipes", { isPro: false });
    await waitFor(() => expect(mockLoadFolderSharing).toHaveBeenCalled());

    expect(screen.getByText("Upgrade to Invite Collaborators")).toBeTruthy();
    expect(screen.queryByTestId("collaboratorEmailInput")).toBeNull();
    expect(screen.getByText("PRO")).toBeTruthy();

    await fireEvent.press(screen.getByText("Upgrade to Invite Collaborators"));
    expect(presentPaywall).toHaveBeenCalledWith("sharing");
  });

  it("invites a collaborator as editor when Pro", async () => {
    syncFolderForSharing.mockResolvedValue({ ok: true });
    mockShareFolderByEmail.mockResolvedValue({ result: "invite", emailSent: true });

    await renderShareFolderScreen([makeFolder({ id: "recipes", name: "Recipes" })], "recipes", { isPro: true });
    await waitFor(() => expect(mockLoadFolderSharing).toHaveBeenCalled());

    expect(screen.queryByText("PRO")).toBeNull();

    await fireEvent.changeText(screen.getByTestId("collaboratorEmailInput"), "friend@b.com");
    await fireEvent.press(screen.getByText("Invite"));

    await waitFor(() => expect(mockShareFolderByEmail).toHaveBeenCalled());
    expect(syncFolderForSharing).toHaveBeenCalledWith("recipes");
    expect(mockShareFolderByEmail).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ email: "friend@b.com", folderId: "recipes", role: "editor", scope: "folder_only" }),
    );
    expect(presentPaywall).not.toHaveBeenCalled();
  });

  it("adds a person as a free viewer from the Invite Viewers section without Pro", async () => {
    syncFolderForSharing.mockResolvedValue({ ok: true });
    mockShareFolderByEmail.mockResolvedValue({ result: "invite", emailSent: true });

    await renderShareFolderScreen([makeFolder({ id: "recipes", name: "Recipes" })], "recipes", { isPro: false });
    await waitFor(() => expect(mockLoadFolderSharing).toHaveBeenCalled());

    await fireEvent.changeText(screen.getByTestId("shareEmailInput"), "friend@b.com");
    await fireEvent.press(screen.getByText("Add"));

    await waitFor(() => expect(mockShareFolderByEmail).toHaveBeenCalled());
    expect(mockShareFolderByEmail).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ email: "friend@b.com", folderId: "recipes", role: "viewer" }),
    );
    expect(presentPaywall).not.toHaveBeenCalled();
  });

  it("rejects an invalid email in the Invite Viewers section without syncing or calling the API", async () => {
    await renderShareFolderScreen([makeFolder({ id: "recipes", name: "Recipes" })], "recipes", { isPro: false });
    await waitFor(() => expect(mockLoadFolderSharing).toHaveBeenCalled());

    await fireEvent.changeText(screen.getByTestId("shareEmailInput"), "not-an-email");
    await fireEvent.press(screen.getByText("Add"));

    expect(screen.getByText("Enter a valid email address.")).toBeTruthy();
    expect(syncFolderForSharing).not.toHaveBeenCalled();
    expect(mockShareFolderByEmail).not.toHaveBeenCalled();
  });

  it("gates upgrading an existing viewer to editor behind Pro", async () => {
    mockLoadFolderSharing.mockResolvedValue({
      access: [
        { id: "a2", userId: "friend-1", kind: "direct", role: "viewer", scope: "folder_only", shareId: "share-1", displayName: "Friend Person" },
      ],
      invites: [],
    });

    await renderShareFolderScreen([makeFolder({ id: "recipes", name: "Recipes" })], "recipes", { isPro: false });
    await waitFor(() => expect(screen.getByText("Friend Person")).toBeTruthy());

    await fireEvent.press(screen.getByText("Make editor"));

    expect(presentPaywall).toHaveBeenCalledWith("sharing");
    expect(mockUpdateFolderShare).not.toHaveBeenCalled();
  });

  it("allows upgrading an existing viewer to editor when Pro", async () => {
    mockLoadFolderSharing.mockResolvedValue({
      access: [
        { id: "a2", userId: "friend-1", kind: "direct", role: "viewer", scope: "folder_only", shareId: "share-1", displayName: "Friend Person" },
      ],
      invites: [],
    });
    mockUpdateFolderShare.mockResolvedValue({});

    await renderShareFolderScreen([makeFolder({ id: "recipes", name: "Recipes" })], "recipes", { isPro: true });
    await waitFor(() => expect(screen.getByText("Friend Person")).toBeTruthy());

    await fireEvent.press(screen.getByText("Make editor"));

    expect(presentPaywall).not.toHaveBeenCalled();
    expect(mockUpdateFolderShare).toHaveBeenCalledWith(expect.anything(), "share-1", { role: "editor" });
  });

  it("removes a collaborator's access after confirming", async () => {
    mockLoadFolderSharing.mockResolvedValue({
      access: [
        { id: "a2", userId: "friend-1", kind: "direct", role: "viewer", scope: "folder_only", shareId: "share-1", displayName: "Friend Person" },
      ],
      invites: [],
    });
    mockRemoveFolderShare.mockResolvedValue({});
    alertSpy.mockImplementation((_title, _message, buttons) => {
      const destructive = Array.isArray(buttons)
        ? (buttons as Array<{ style?: string; onPress?: () => void }>).find((button) => button.style === "destructive")
        : undefined;
      destructive?.onPress?.();
    });

    await renderShareFolderScreen([makeFolder({ id: "recipes", name: "Recipes" })]);
    await waitFor(() => expect(screen.getByText("Friend Person")).toBeTruthy());

    await fireEvent.press(screen.getByText("Remove"));

    expect(mockRemoveFolderShare).toHaveBeenCalledWith(expect.anything(), "share-1");
  });

  it("revokes a pending invite after confirming", async () => {
    mockLoadFolderSharing.mockResolvedValue({
      access: [],
      invites: [
        { id: "i1", folderId: "recipes", ownerId: "owner-1", email: "pending@b.com", role: "viewer", scope: "folder_only", status: "pending", token: "tok", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" },
      ],
    });
    mockRevokeFolderInvite.mockResolvedValue({});
    alertSpy.mockImplementation((_title, _message, buttons) => {
      const destructive = Array.isArray(buttons)
        ? (buttons as Array<{ style?: string; onPress?: () => void }>).find((button) => button.style === "destructive")
        : undefined;
      destructive?.onPress?.();
    });

    await renderShareFolderScreen([makeFolder({ id: "recipes", name: "Recipes" })]);
    await waitFor(() => expect(screen.getByText("pending@b.com")).toBeTruthy());

    await fireEvent.press(screen.getByText("Revoke"));

    expect(mockRevokeFolderInvite).toHaveBeenCalledWith(expect.anything(), "i1");
  });

  it("creates and shares a public link after syncing the folder, with no Pro gate", async () => {
    const shareSpy = jest.spyOn(Share, "share").mockResolvedValue({ action: "sharedAction" });
    syncFolderForSharing.mockResolvedValue({ ok: true });
    mockCreatePublicLink.mockResolvedValue({
      link: {
        id: "link-1",
        folderId: "recipes",
        token: "tok-1",
        scope: "folder_only",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    });

    await renderShareFolderScreen([makeFolder({ id: "recipes", name: "Recipes" })], "recipes", { isPro: false });
    await waitFor(() => expect(mockLoadPublicLinkStatus).toHaveBeenCalled());

    await fireEvent.press(screen.getByText("Get Link"));

    await waitFor(() => expect(mockCreatePublicLink).toHaveBeenCalled());
    expect(syncFolderForSharing).toHaveBeenCalledWith("recipes");
    expect(mockCreatePublicLink).toHaveBeenCalledWith(expect.anything(), "recipes", "folder_only", false);
    await waitFor(() =>
      expect(shareSpy).toHaveBeenCalledWith(
        expect.objectContaining({ url: "https://trovecollections.app/shared/token" }),
      ),
    );
    expect(await screen.findByText("Revoke")).toBeTruthy();
    shareSpy.mockRestore();
  });

  it("revokes an active public link after confirming", async () => {
    mockLoadPublicLinkStatus.mockResolvedValue({
      link: {
        id: "link-1",
        folderId: "recipes",
        token: "tok-1",
        scope: "folder_only",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    });
    mockRevokePublicLink.mockResolvedValue({});
    alertSpy.mockImplementation((_title, _message, buttons) => {
      const destructive = Array.isArray(buttons)
        ? (buttons as Array<{ style?: string; onPress?: () => void }>).find((button) => button.style === "destructive")
        : undefined;
      destructive?.onPress?.();
    });

    await renderShareFolderScreen([makeFolder({ id: "recipes", name: "Recipes" })]);
    await waitFor(() => expect(screen.getByText("Revoke")).toBeTruthy());

    await fireEvent.press(screen.getByText("Revoke"));

    expect(mockRevokePublicLink).toHaveBeenCalledWith(expect.anything(), "link-1");
    await waitFor(() => expect(screen.getByText("Get Link")).toBeTruthy());
  });

  it("hides both share sections for non-owner viewers", async () => {
    await renderShareFolderScreen([
      makeFolder({ id: "recipes", name: "Recipes", accessRole: "viewer" }),
    ]);
    await waitFor(() => expect(mockLoadFolderSharing).toHaveBeenCalled());

    expect(screen.queryByText("Invite Collaborators")).toBeNull();
    expect(screen.queryByText("Invite Viewers")).toBeNull();
  });
});
