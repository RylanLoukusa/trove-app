import React from "react";
import { fireEvent, screen, waitFor, within } from "@testing-library/react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { PublicItemDetailScreen } from "./index";
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

type Navigation = NativeStackScreenProps<RootStackParamList, "PublicItemDetail">["navigation"];
type Route = NativeStackScreenProps<RootStackParamList, "PublicItemDetail">["route"];

const navigation = {
  navigate: jest.fn(),
  push: jest.fn(),
  goBack: jest.fn(),
  canGoBack: jest.fn(),
};

const makeList = (overrides: Partial<PublicFolderItem>): PublicFolderItem => ({
  id: "list-1",
  folderId: "packing",
  title: "List",
  type: "list",
  listItems: [],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  ...overrides,
});

const linkWith = (...items: PublicFolderItem[]): { data: PublicFolderData } => ({
  data: {
    folder: { id: "trip", name: "Trip" },
    folders: [
      { id: "trip", name: "Trip" },
      { id: "packing", name: "Packing", parentFolderId: "trip" },
    ],
    items,
    link: { scope: "folder_and_subfolders" },
    ownerName: null,
  },
});

const clothes = makeList({
  id: "clothes",
  title: "Clothes",
  listItems: [
    { id: "a", kind: "bullet", text: "Warm things", plain: true, bold: true },
    { id: "b", kind: "check", text: "Coat", checked: true, indentLevel: 1 },
    { id: "c", kind: "check", text: "Gloves", indentLevel: 1 },
    { id: "d", kind: "bullet", text: "Check the forecast first" },
  ],
});

const renderDetail = async (itemId = "clothes", token = "tok-1") => {
  const route = { key: "this-screen", name: "PublicItemDetail", params: { token, itemId } };
  await renderScreen(
    <PublicItemDetailScreen navigation={navigation as unknown as Navigation} route={route as unknown as Route} />,
  );
};

describe("PublicItemDetailScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetSupabase.mockReturnValue({});
    mockFetchPublicFolder.mockResolvedValue(linkWith(clothes));
    navigation.canGoBack.mockReturnValue(true);
  });

  it("shows the list's title, progress and that it is view only", async () => {
    await renderDetail();

    expect(await screen.findByRole("header", { name: "Clothes" })).toBeTruthy();
    expect(screen.getByText("1 of 2 done · View only")).toBeTruthy();
    expect(screen.getByText("Shared read-only from Trove")).toBeTruthy();
    expect(mockFetchPublicFolder).toHaveBeenCalledWith(expect.anything(), "tok-1");
  });

  it("shows every line, with checklist lines read as checked or not", async () => {
    await renderDetail();

    await screen.findByText("Warm things");
    expect(screen.getByRole("checkbox", { name: "Coat" }).props.accessibilityState).toEqual({ checked: true });
    expect(screen.getByRole("checkbox", { name: "Gloves" }).props.accessibilityState).toEqual({ checked: false });
    expect(screen.getAllByRole("checkbox")).toHaveLength(2);
    expect(screen.getByLabelText("Check the forecast first")).toBeTruthy();
  });

  it("shows a plain line with no mark and a bold one in bold", async () => {
    await renderDetail();

    const heading = await screen.findByLabelText("Warm things");
    const bullet = screen.getByLabelText("Check the forecast first");
    // A plain line is only its text; a bulleted one has its mark in front.
    expect(heading.children).toHaveLength(1);
    expect(bullet.children).toHaveLength(2);
    expect(within(heading).getByText("Warm things")).toHaveStyle({ fontWeight: "700" });
    expect(within(bullet).getByText("Check the forecast first")).not.toHaveStyle({ fontWeight: "700" });
  });

  it("can't be checked off or changed", async () => {
    await renderDetail();

    await fireEvent.press(await screen.findByRole("checkbox", { name: "Gloves" }));

    expect(screen.getByRole("checkbox", { name: "Gloves" }).props.accessibilityState).toEqual({ checked: false });
    expect(screen.queryByLabelText("List options")).toBeNull();
    expect(screen.queryByRole("button", { name: "Gloves" })).toBeNull();
  });

  it("shows a list that was never named by its first line", async () => {
    mockFetchPublicFolder.mockResolvedValue(
      linkWith(makeList({ id: "unnamed", title: "Untitled list", listItems: [{ id: "a", kind: "bullet", text: "Ideas", plain: true }] })),
    );

    await renderDetail("unnamed");

    expect(await screen.findByRole("header", { name: "Ideas" })).toBeTruthy();
    expect(screen.getByText("View only")).toBeTruthy();
    expect(screen.queryByText("Untitled list")).toBeNull();
  });

  it("says so when the list is empty", async () => {
    mockFetchPublicFolder.mockResolvedValue(linkWith(makeList({ id: "empty", title: "To pack later" })));

    await renderDetail("empty");

    expect(await screen.findByText("Nothing on this list yet.")).toBeTruthy();
    expect(screen.getByText("View only")).toBeTruthy();
  });

  describe("when the list can't be shown", () => {
    it("says the list is unavailable when the link no longer has it", async () => {
      await renderDetail("deleted-since");

      expect(await screen.findByText("List unavailable")).toBeTruthy();
      expect(screen.getByText("This list is no longer available.")).toBeTruthy();
    });

    it("passes on why the link itself can't be opened", async () => {
      mockFetchPublicFolder.mockResolvedValue({ error: "This link has been revoked." });

      await renderDetail();

      expect(await screen.findByText("List unavailable")).toBeTruthy();
      expect(screen.getByText("This link has been revoked.")).toBeTruthy();
    });

    it("says the link can't be opened when the app has no server to ask", async () => {
      mockGetSupabase.mockReturnValue(null);

      await renderDetail();

      await waitFor(() => expect(screen.getByText("List unavailable")).toBeTruthy());
      expect(screen.getByText("This link can't be opened right now.")).toBeTruthy();
      expect(mockFetchPublicFolder).not.toHaveBeenCalled();
    });
  });

  describe("going back", () => {
    it("names the folder the list is kept in", async () => {
      await renderDetail();

      await screen.findByRole("header", { name: "Clothes" });
      const back = screen.getByLabelText("Go back");
      expect(within(back).getByText("Packing")).toBeTruthy();

      await fireEvent.press(back);
      expect(navigation.goBack).toHaveBeenCalledTimes(1);
    });

    it("goes to the app's own lists when there is nothing to go back to", async () => {
      navigation.canGoBack.mockReturnValue(false);
      await renderDetail("deleted-since");

      const back = await screen.findByLabelText("Go back");
      expect(within(back).getByText("Back")).toBeTruthy();
      await fireEvent.press(back);

      expect(navigation.navigate).toHaveBeenCalledWith("Home");
    });
  });
});
