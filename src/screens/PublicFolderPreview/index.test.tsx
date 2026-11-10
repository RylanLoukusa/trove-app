import React from "react";
import { fireEvent, screen, waitFor, within } from "@testing-library/react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { PublicFolderPreviewScreen } from "./index";
import { fetchPublicFolder } from "../../collaboration/folderPublicLinks";
import type { PublicFolderData, PublicFolderItem } from "../../collaboration/folderPublicLinks";
import { getSupabase } from "../../lib/supabase";
import type { RootStackParamList } from "../../navigation/types";
import { renderScreen } from "../../test-utils/renderScreen";

jest.mock("../../collaboration/folderPublicLinks", () => ({
  ...jest.requireActual("../../collaboration/folderPublicLinks"),
  fetchPublicFolder: jest.fn(),
}));

jest.mock("../../lib/supabase", () => ({
  getSupabase: jest.fn(),
}));

const mockFetchPublicFolder = fetchPublicFolder as jest.Mock;
const mockGetSupabase = getSupabase as jest.Mock;

type Navigation = NativeStackScreenProps<RootStackParamList, "PublicFolderPreview">["navigation"];
type Route = NativeStackScreenProps<RootStackParamList, "PublicFolderPreview">["route"];

const navigation = {
  navigate: jest.fn(),
  push: jest.fn(),
  goBack: jest.fn(),
  canGoBack: jest.fn(),
  getState: jest.fn(),
};

const makeList = (overrides: Partial<PublicFolderItem>): PublicFolderItem => ({
  id: "list-1",
  folderId: "trip",
  title: "List",
  type: "list",
  listItems: [],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  ...overrides,
});

const trip: PublicFolderData = {
  folder: { id: "trip", name: "Trip", icon: "🧳", purpose: "Two weeks in Japan" },
  folders: [
    { id: "trip", name: "Trip", icon: "🧳", purpose: "Two weeks in Japan" },
    { id: "packing", name: "Packing", icon: "🎒", parentFolderId: "trip" },
    { id: "carry-on", name: "Carry-on", parentFolderId: "packing" },
    { id: "empty", name: "Empty", parentFolderId: "trip" },
  ],
  items: [
    makeList({
      id: "plan",
      title: "Plan",
      listItems: [
        { id: "a", kind: "check", text: "Book flights", checked: true },
        { id: "b", kind: "check", text: "Book hotel" },
        { id: "c", kind: "bullet", text: "Ask about rail pass" },
      ],
    }),
    makeList({ id: "untitled", title: "Untitled list", listItems: [{ id: "d", kind: "bullet", text: "Ideas for day trips", plain: true }] }),
    makeList({ id: "clothes", title: "Clothes", folderId: "packing" }),
    makeList({ id: "liquids", title: "Liquids", folderId: "carry-on" }),
  ],
  link: { scope: "folder_and_subfolders" },
  ownerName: "Sam",
};

type Setup = {
  token?: string;
  folderId?: string;
  // The screens under this one, bottom first.
  stack?: Array<{ key: string; name: string }>;
};

const renderPreview = async ({ token = "tok-1", folderId, stack = [] }: Setup = {}) => {
  const route = { key: "this-screen", name: "PublicFolderPreview", params: { token, folderId } };
  navigation.getState.mockReturnValue({ routes: [...stack, route] });
  await renderScreen(
    <PublicFolderPreviewScreen navigation={navigation as unknown as Navigation} route={route as unknown as Route} />,
  );
};

describe("PublicFolderPreviewScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetSupabase.mockReturnValue({});
    mockFetchPublicFolder.mockResolvedValue({ data: trip });
    navigation.canGoBack.mockReturnValue(false);
  });

  it("shows the shared folder, who shared it and what it is for", async () => {
    await renderPreview();

    expect(await screen.findByRole("header", { name: "Trip" })).toBeTruthy();
    expect(screen.getByText("Shared by Sam")).toBeTruthy();
    expect(screen.getByText("Two weeks in Japan")).toBeTruthy();
    expect(screen.getByText("Shared read-only from Trove")).toBeTruthy();
    expect(mockFetchPublicFolder).toHaveBeenCalledWith(expect.anything(), "tok-1");
  });

  it("doesn't name the owner when the link doesn't share it", async () => {
    mockFetchPublicFolder.mockResolvedValue({ data: { ...trip, ownerName: null } });

    await renderPreview();

    expect(await screen.findByText("Shared folder")).toBeTruthy();
    expect(screen.queryByText(/^Shared by/)).toBeNull();
  });

  it("lists what is kept directly in the folder, with a preview and progress", async () => {
    await renderPreview();

    const plan = within(await screen.findByLabelText("Plan"));
    expect(plan.getByText("Book flights, Book hotel, Ask about rail pass")).toBeTruthy();
    expect(plan.getByLabelText("1 of 2 done")).toBeTruthy();
    expect(screen.getByLabelText("Ideas for day trips")).toBeTruthy();
    expect(screen.queryByLabelText("Clothes")).toBeNull();
    expect(screen.queryByLabelText("Liquids")).toBeNull();
  });

  it("opens a list", async () => {
    await renderPreview();

    await fireEvent.press(await screen.findByLabelText("Plan"));

    expect(navigation.push).toHaveBeenCalledWith("PublicItemDetail", { token: "tok-1", itemId: "plan" });
  });

  it("shows subfolders, counting the lists nested inside them, and opens one", async () => {
    await renderPreview();

    expect(await screen.findByLabelText("Packing, 2 lists")).toBeTruthy();
    expect(screen.getByLabelText("Empty, 0 lists")).toBeTruthy();
    expect(screen.queryByLabelText(/^Carry-on,/)).toBeNull();

    await fireEvent.press(screen.getByLabelText("Packing, 2 lists"));

    expect(navigation.push).toHaveBeenCalledWith("PublicFolderPreview", { token: "tok-1", folderId: "packing" });
  });

  it("shows a subfolder of the link when asked for one", async () => {
    await renderPreview({ folderId: "packing", stack: [{ key: "root", name: "PublicFolderPreview" }] });

    expect(await screen.findByRole("header", { name: "Packing" })).toBeTruthy();
    expect(screen.getByLabelText("Clothes")).toBeTruthy();
    expect(screen.getByLabelText("Carry-on, 1 list")).toBeTruthy();
    expect(screen.queryByLabelText("Plan")).toBeNull();
    expect(screen.queryByText("Two weeks in Japan")).toBeNull();
  });

  it("says so when a folder has no lists", async () => {
    await renderPreview({ folderId: "empty" });

    expect(await screen.findByText("No lists in this folder yet.")).toBeTruthy();
    expect(screen.queryByText("Folders")).toBeNull();
  });

  it("offers no way to add or change anything", async () => {
    await renderPreview();

    await screen.findByLabelText("Plan");
    expect(screen.queryByLabelText("New list")).toBeNull();
    expect(screen.queryByLabelText("Folder options")).toBeNull();
    expect(screen.queryAllByHintText("Hold for more actions")).toEqual([]);
  });

  describe("when the link can't be shown", () => {
    it("waits quietly while the link loads", async () => {
      let finish: (value: { data: PublicFolderData }) => void = () => {};
      mockFetchPublicFolder.mockReturnValue(new Promise((resolve) => (finish = resolve)));

      await renderPreview();

      expect(screen.queryByText("Link unavailable")).toBeNull();
      expect(screen.queryByText("Trip")).toBeNull();

      finish({ data: trip });
      expect(await screen.findByRole("header", { name: "Trip" })).toBeTruthy();
    });

    it("says the link is unavailable when it has been revoked", async () => {
      mockFetchPublicFolder.mockResolvedValue({ error: "This link has been revoked." });

      await renderPreview();

      expect(await screen.findByText("Link unavailable")).toBeTruthy();
      expect(screen.getByText("This link has been revoked.")).toBeTruthy();
    });

    it("says the link can't be opened when the app has no server to ask", async () => {
      mockGetSupabase.mockReturnValue(null);

      await renderPreview();

      await waitFor(() => expect(screen.getByText("Link unavailable")).toBeTruthy());
      expect(screen.getByText("This link can't be opened right now.")).toBeTruthy();
      expect(mockFetchPublicFolder).not.toHaveBeenCalled();
    });

    it("says the link is unavailable for a folder the link doesn't cover", async () => {
      await renderPreview({ folderId: "somewhere-else" });

      expect(await screen.findByText("Link unavailable")).toBeTruthy();
      expect(screen.getByText("This link is no longer available.")).toBeTruthy();
    });
  });

  describe("going back", () => {
    it("goes back to the folder it was opened from", async () => {
      navigation.canGoBack.mockReturnValue(true);
      await renderPreview({ folderId: "packing", stack: [{ key: "root", name: "PublicFolderPreview" }] });

      const back = await screen.findByLabelText("Go back");
      expect(within(back).getByText("Back")).toBeTruthy();
      await fireEvent.press(back);

      expect(navigation.goBack).toHaveBeenCalledTimes(1);
    });

    it("goes to the app's own lists when the link was the first thing opened", async () => {
      await renderPreview();

      const back = await screen.findByLabelText("Go back");
      expect(within(back).getByText("Trove")).toBeTruthy();
      await fireEvent.press(back);

      expect(navigation.goBack).not.toHaveBeenCalled();
      expect(navigation.navigate).toHaveBeenCalledWith("Home");
    });
  });
});
