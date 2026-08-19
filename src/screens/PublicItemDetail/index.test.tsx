import React from "react";
import { screen, waitFor } from "@testing-library/react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { PublicItemDetailScreen } from "./index";
import { fetchPublicFolder } from "../../collaboration/folderPublicLinks";
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

const navigation = {
  navigate: jest.fn(),
  push: jest.fn(),
  goBack: jest.fn(),
  canGoBack: jest.fn().mockReturnValue(true),
} as unknown as NativeStackScreenProps<RootStackParamList, "PublicItemDetail">["navigation"];

const renderDetail = async (token = "tok-1", itemId = "item-1") => {
  const route = { params: { token, itemId } } as unknown as NativeStackScreenProps<
    RootStackParamList,
    "PublicItemDetail"
  >["route"];
  await renderScreen(<PublicItemDetailScreen navigation={navigation} route={route} />);
};

const baseData = {
  folder: { id: "folder-1", name: "Trip" },
  folders: [
    { id: "folder-1", name: "Trip" },
    { id: "folder-2", name: "Packing", parentFolderId: "folder-1" },
  ],
  link: { scope: "folder_and_subfolders" as const },
};

describe("PublicItemDetailScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetSupabase.mockReturnValue({});
  });

  it("renders the item's title, folder path, description, and tags", async () => {
    mockFetchPublicFolder.mockResolvedValue({
      data: {
        ...baseData,
        items: [
          {
            id: "item-1",
            folderId: "folder-2",
            title: "Passport",
            description: "Don't forget this",
            type: "text",
            mediaItems: [],
            attachments: [],
            listItems: [],
            tags: [{ id: "tag-1", name: "Essential", color: "#43664A" }],
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
          },
        ],
      },
    });

    await renderDetail();

    expect(await screen.findByText("Passport")).toBeTruthy();
    expect(screen.getByText("Trip > Packing")).toBeTruthy();
    expect(screen.getByText("Don't forget this")).toBeTruthy();
    expect(screen.getByText("Essential")).toBeTruthy();
    expect(screen.getByText("NOTE")).toBeTruthy();
  });

  it("shows a locked tile for video media instead of playing it", async () => {
    mockFetchPublicFolder.mockResolvedValue({
      data: {
        ...baseData,
        items: [
          {
            id: "item-1",
            folderId: "folder-1",
            title: "Clip",
            type: "media",
            mediaItems: [{ id: "m1", mediaType: "video", url: "https://example.com/clip.mp4" }],
            attachments: [],
            listItems: [],
            tags: [],
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
          },
        ],
      },
    });

    await renderDetail();

    expect(await screen.findByText("Clip")).toBeTruthy();
    expect(screen.getByText(/Open Trove to/)).toBeTruthy();
  });

  it("renders checklist items without a toggle interaction", async () => {
    mockFetchPublicFolder.mockResolvedValue({
      data: {
        ...baseData,
        items: [
          {
            id: "item-1",
            folderId: "folder-1",
            title: "Packing list",
            type: "list",
            mediaItems: [],
            attachments: [],
            listItems: [{ id: "l1", kind: "check", text: "Passport", checked: true, indentLevel: 0 }],
            tags: [],
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
          },
        ],
      },
    });

    await renderDetail();

    expect(await screen.findByText("Passport")).toBeTruthy();
    expect(screen.getByText("☑")).toBeTruthy();
  });

  it("shows an unavailable state for a missing item", async () => {
    mockFetchPublicFolder.mockResolvedValue({
      data: { ...baseData, items: [] },
    });

    await renderDetail("tok-1", "missing-item");

    await waitFor(() => expect(screen.getByText("Item unavailable")).toBeTruthy());
  });

  it("shows an unavailable state when the link has been revoked", async () => {
    mockFetchPublicFolder.mockResolvedValue({ error: "This link has been revoked." });

    await renderDetail();

    expect(await screen.findByText("Item unavailable")).toBeTruthy();
    expect(screen.getByText("This link has been revoked.")).toBeTruthy();
  });
});
