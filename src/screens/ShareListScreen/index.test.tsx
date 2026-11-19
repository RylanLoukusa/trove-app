import React from "react";
import { Alert, Share } from "react-native";
import { fireEvent, screen, waitFor } from "@testing-library/react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";

import { ShareListScreen } from ".";
import type { RootStackParamList } from "../../navigation/types";
import { useTrove } from "../../storage/storage";
import { renderScreen } from "../../test-utils/renderScreen";
import type { SavedItem } from "../../types/models";
import { changeListAccess, loadListAccess, removeListAccess, shareList } from "../../collaboration/listSharing";
import { useEntitlement } from "../../entitlements/EntitlementContext";

jest.mock("../../storage/storage", () => ({ useTrove: jest.fn() }));
jest.mock("../../auth/AuthContext", () => ({ useAuth: () => ({ session: { user: { id: "me" } } }) }));
jest.mock("../../entitlements/EntitlementContext", () => ({ useEntitlement: jest.fn() }));
jest.mock("../../lib/supabase", () => ({ getSupabase: () => ({}) }));
jest.mock("../../collaboration/folderSharing", () => ({
  loadSavedCollaborators: jest.fn(async () => ({
    collaborators: [{ id: "sam", displayName: "Sam", email: "sam@example.com", lastSharedAt: "2026-01-01T00:00:00.000Z" }],
  })),
}));
jest.mock("../../collaboration/listSharing", () => {
  const actual = jest.requireActual("../../collaboration/listSharing");
  return {
    ...actual,
    loadListAccess: jest.fn(),
    shareList: jest.fn(),
    changeListAccess: jest.fn(async () => ({})),
    removeListAccess: jest.fn(async () => ({})),
  };
});

const STAMP = "2026-01-01T00:00:00.000Z";
const list = (extra: Partial<SavedItem> = {}): SavedItem => ({
  id: "party",
  folderId: "",
  title: "Party",
  type: "list",
  tagOptionIds: [],
  ownerId: "me",
  accessRole: "owner",
  createdAt: STAMP,
  updatedAt: STAMP,
  ...extra,
});

const navigation = { navigate: jest.fn(), goBack: jest.fn(), canGoBack: jest.fn(() => true) };
const props = { navigation, route: { params: { listId: "party" } } } as unknown as NativeStackScreenProps<
  RootStackParamList,
  "ShareList"
>;

const trove = {
  syncToRemote: jest.fn(async () => ({ ok: true })),
  refreshFromRemote: jest.fn(async () => ({ ok: true })),
  leaveSharedList: jest.fn(async () => ({ ok: true })),
};
const presentPaywall = jest.fn();
let alertSpy: jest.SpyInstance;

const owner = { kind: "owner", id: "me", userId: "me", displayName: "Me", role: "owner" };
const ben = { kind: "share", id: "share-1", userId: "ben", displayName: "Ben", email: "ben@example.com", role: "editor" };
const invite = { kind: "invite", id: "invite-1", email: "dee@example.com", role: "viewer" };

const render = async (item: SavedItem = list(), { isPro = true } = {}) => {
  (useTrove as jest.Mock).mockReturnValue({ ...trove, items: [item] });
  (useEntitlement as jest.Mock).mockReturnValue({ isPro, presentPaywall });
  await renderScreen(<ShareListScreen {...props} />);
};

beforeEach(() => {
  jest.clearAllMocks();
  alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => undefined);
  (loadListAccess as jest.Mock).mockResolvedValue({ access: [owner, ben, invite] });
  (shareList as jest.Mock).mockResolvedValue({ result: "share" });
});

afterEach(() => alertSpy.mockRestore());

describe("ShareListScreen", () => {
  it("shows the owner everyone with the list, and invites still waiting", async () => {
    await render();

    expect(await screen.findByText("Ben")).toBeTruthy();
    expect(screen.getByText("Owner (you)")).toBeTruthy();
    expect(screen.getAllByText("Can edit")).toHaveLength(2); // the role picker and Ben
    expect(screen.getByText("dee@example.com")).toBeTruthy();
    expect(screen.getByText("Can view · Gets it when they join Trove")).toBeTruthy();
  });

  it("syncs the list, then shares it by email to edit", async () => {
    await render();

    await fireEvent.changeText(screen.getByLabelText("Email address"), " pat@example.com ");
    await fireEvent.press(screen.getByText("Share"));

    await waitFor(() => expect(shareList).toHaveBeenCalled());
    expect(trove.syncToRemote).toHaveBeenCalled();
    expect(shareList).toHaveBeenCalledWith(expect.anything(), { listId: "party", role: "editor", email: " pat@example.com " });
    await waitFor(() => expect(loadListAccess).toHaveBeenCalledTimes(2));
    expect(screen.getByLabelText("Email address").props.value).toBe("");
  });

  it("offers to send a message when the person has no account yet", async () => {
    (shareList as jest.Mock).mockResolvedValue({ result: "invite" });
    const shareSpy = jest.spyOn(Share, "share").mockResolvedValue({ action: "sharedAction" });
    await render();

    await fireEvent.changeText(screen.getByLabelText("Email address"), "pat@example.com");
    await fireEvent.press(screen.getByText("Share"));

    await waitFor(() => expect(alertSpy).toHaveBeenCalled());
    const [title, , buttons] = alertSpy.mock.calls[0];
    expect(title).toBe("Invite waiting");
    buttons.find((button: { text: string }) => button.text === "Send them a message").onPress();
    expect(shareSpy).toHaveBeenCalledWith({ message: expect.stringContaining('"Party"') });
    shareSpy.mockRestore();
  });

  it("asks for an email address before sharing", async () => {
    await render();

    await fireEvent.changeText(screen.getByLabelText("Email address"), "pat");
    await fireEvent.press(screen.getByText("Share"));

    expect(screen.getByText("Enter an email address.")).toBeTruthy();
    expect(shareList).not.toHaveBeenCalled();
  });

  it("shares with someone shared with before in one tap", async () => {
    await render();

    await fireEvent.press(await screen.findByLabelText("Share with Sam"));

    await waitFor(() => expect(shareList).toHaveBeenCalledWith(expect.anything(), { listId: "party", role: "editor", userId: "sam" }));
  });

  it("starts at view only without Pro, and letting someone edit needs Pro", async () => {
    await render(list(), { isPro: false });

    expect(screen.getByLabelText("Can view").props.accessibilityState).toMatchObject({ selected: true });
    await fireEvent.press(screen.getByLabelText("Can edit"));
    await fireEvent.changeText(screen.getByLabelText("Email address"), "pat@example.com");
    await fireEvent.press(screen.getByText("Share"));

    expect(presentPaywall).toHaveBeenCalledWith("sharing");
    expect(shareList).not.toHaveBeenCalled();
  });

  it("lets the owner change or take away someone's access", async () => {
    await render();

    await fireEvent.press(await screen.findByText("Ben"));
    await fireEvent.press(screen.getByLabelText("Make view only"));
    await waitFor(() => expect(changeListAccess).toHaveBeenCalledWith(expect.anything(), ben, "viewer"));

    await fireEvent.press(screen.getByText("dee@example.com"));
    await fireEvent.press(screen.getByLabelText("Withdraw invite"));
    await waitFor(() => expect(removeListAccess).toHaveBeenCalledWith(expect.anything(), invite));
  });

  it("lets someone it was shared with see who has it and leave", async () => {
    (loadListAccess as jest.Mock).mockResolvedValue({
      access: [{ ...owner, id: "ann", userId: "ann", displayName: "Ann" }, { ...ben, userId: "me", displayName: "Me" }],
    });
    await render(list({ ownerId: "ann", accessRole: "editor", sharedWithMe: { by: "Ann" } }));

    expect(screen.getByText("Ann shared this list with you. Changes show for everyone as they happen.")).toBeTruthy();
    expect(screen.queryByLabelText("Email address")).toBeNull();
    expect(await screen.findByText("Can edit (you)")).toBeTruthy();

    await fireEvent.press(screen.getByText("Leave list"));
    const [, , buttons] = alertSpy.mock.calls[0];
    await buttons.find((button: { text: string }) => button.text === "Leave").onPress();

    expect(trove.leaveSharedList).toHaveBeenCalledWith("party");
    await waitFor(() => expect(navigation.navigate).toHaveBeenCalledWith("Home"));
  });
});
