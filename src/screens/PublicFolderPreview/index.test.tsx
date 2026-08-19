import React from "react";
import { screen, waitFor } from "@testing-library/react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { PublicFolderPreviewScreen } from "./index";
import { fetchPublicFolder } from "../../collaboration/folderPublicLinks";
import { getSupabase } from "../../lib/supabase";
import type { RootStackParamList } from "../../navigation/types";
import { renderScreen } from "../../test-utils/renderScreen";

jest.mock("../../collaboration/folderPublicLinks", () => ({
  fetchPublicFolder: jest.fn(),
}));

jest.mock("../../lib/supabase", () => ({
  getSupabase: jest.fn(),
}));

const mockFetchPublicFolder = fetchPublicFolder as jest.Mock;
const mockGetSupabase = getSupabase as jest.Mock;

const navigation = {
  navigate: jest.fn(),
  goBack: jest.fn(),
  canGoBack: jest.fn().mockReturnValue(false),
} as unknown as NativeStackScreenProps<RootStackParamList, "PublicFolderPreview">["navigation"];

const renderPreview = async (token = "tok-1") => {
  const route = { params: { token } } as unknown as NativeStackScreenProps<
    RootStackParamList,
    "PublicFolderPreview"
  >["route"];
  await renderScreen(<PublicFolderPreviewScreen navigation={navigation} route={route} />);
};

describe("PublicFolderPreviewScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetSupabase.mockReturnValue({});
  });

  it("renders the folder and its items on success", async () => {
    mockFetchPublicFolder.mockResolvedValue({
      data: {
        folder: { id: "folder-1", name: "Recipes", icon: "🍳" },
        folders: [{ id: "folder-1", name: "Recipes", icon: "🍳" }],
        items: [
          {
            id: "item-1",
            folderId: "folder-1",
            title: "Pasta",
            description: "A simple recipe",
            type: "text",
            mediaItems: [],
            attachments: [],
            listItems: [],
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
          },
        ],
        link: { scope: "folder_only" },
      },
    });

    await renderPreview();

    expect(await screen.findByText("🍳 Recipes")).toBeTruthy();
    expect(screen.getByText("Pasta")).toBeTruthy();
    expect(screen.getByText("A simple recipe")).toBeTruthy();
    expect(mockFetchPublicFolder).toHaveBeenCalledWith(expect.anything(), "tok-1");
  });

  it("shows an unavailable state when the link has been revoked", async () => {
    mockFetchPublicFolder.mockResolvedValue({ error: "This link has been revoked." });

    await renderPreview();

    expect(await screen.findByText("Link unavailable")).toBeTruthy();
    expect(screen.getByText("This link has been revoked.")).toBeTruthy();
  });

  it("shows an unavailable state when Supabase isn't configured", async () => {
    mockGetSupabase.mockReturnValue(null);

    await renderPreview();

    await waitFor(() => expect(screen.getByText("Link unavailable")).toBeTruthy());
    expect(mockFetchPublicFolder).not.toHaveBeenCalled();
  });

  it("renders a media gallery for items with multiple mediaItems (not just a single mediaUrl)", async () => {
    mockFetchPublicFolder.mockResolvedValue({
      data: {
        folder: { id: "folder-1", name: "Trip" },
        folders: [{ id: "folder-1", name: "Trip" }],
        items: [
          {
            id: "item-1",
            folderId: "folder-1",
            title: "Beach photos",
            type: "media",
            mediaItems: [
              { id: "m1", mediaType: "image", url: "https://example.com/1.jpg" },
              { id: "m2", mediaType: "video", url: "https://example.com/2.mp4" },
            ],
            attachments: [],
            listItems: [],
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
          },
        ],
        link: { scope: "folder_only" },
      },
    });

    await renderPreview();

    expect(await screen.findByText("Beach photos")).toBeTruthy();
    expect(screen.getByTestId("itemMediaGallery")).toBeTruthy();
    expect(screen.getByTestId("mediaTile-m1")).toBeTruthy();
    expect(screen.getByTestId("mediaTile-m2")).toBeTruthy();
    // m1 is an image, so it should not show the video-locked placeholder.
    expect(screen.getAllByText(/Open Trove to/)).toHaveLength(1);
  });

  it("shows a locked placeholder instead of playing video attachments", async () => {
    mockFetchPublicFolder.mockResolvedValue({
      data: {
        folder: { id: "folder-1", name: "Clips" },
        folders: [{ id: "folder-1", name: "Clips" }],
        items: [
          {
            id: "item-1",
            folderId: "folder-1",
            title: "Screen recording",
            type: "text",
            mediaItems: [],
            attachments: [{ id: "a1", uri: "https://example.com/clip.mp4", mediaType: "video" }],
            listItems: [],
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
          },
        ],
        link: { scope: "folder_only" },
      },
    });

    await renderPreview();

    expect(await screen.findByText("Screen recording")).toBeTruthy();
    expect(screen.getByText(/Open Trove to/)).toBeTruthy();
  });

  it("renders subfolders as folder cards with an item count, not a plain chip", async () => {
    mockFetchPublicFolder.mockResolvedValue({
      data: {
        folder: { id: "folder-1", name: "Trip", icon: "🧳" },
        folders: [
          { id: "folder-1", name: "Trip", icon: "🧳" },
          { id: "folder-2", name: "Packing", icon: "🎒", parentFolderId: "folder-1" },
        ],
        items: [
          {
            id: "item-1",
            folderId: "folder-2",
            title: "Passport",
            type: "text",
            mediaItems: [],
            attachments: [],
            listItems: [],
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
          },
          {
            id: "item-2",
            folderId: "folder-2",
            title: "Chargers",
            type: "text",
            mediaItems: [],
            attachments: [],
            listItems: [],
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
          },
        ],
        link: { scope: "folder_and_subfolders" },
      },
    });

    await renderPreview();

    expect(await screen.findByText("Packing")).toBeTruthy();
    expect(screen.getByText("2 saved here")).toBeTruthy();
    expect(screen.getByText("Passport")).toBeTruthy();
    expect(screen.getByText("Chargers")).toBeTruthy();
  });

  it("renders indented checklist items with the right marker per kind", async () => {
    mockFetchPublicFolder.mockResolvedValue({
      data: {
        folder: { id: "folder-1", name: "Packing" },
        folders: [{ id: "folder-1", name: "Packing" }],
        items: [
          {
            id: "item-1",
            folderId: "folder-1",
            title: "Packing list",
            type: "list",
            mediaItems: [],
            attachments: [],
            listItems: [
              { id: "l1", kind: "check", text: "Passport", checked: true, indentLevel: 0 },
              { id: "l2", kind: "bullet", text: "Chargers", checked: false, indentLevel: 1 },
            ],
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
          },
        ],
        link: { scope: "folder_only" },
      },
    });

    await renderPreview();

    expect(await screen.findByText("Passport")).toBeTruthy();
    expect(screen.getByText("Chargers")).toBeTruthy();
    expect(screen.getByText("☑")).toBeTruthy();
  });

  it("falls back to attachments only when there is no stored media", async () => {
    mockFetchPublicFolder.mockResolvedValue({
      data: {
        folder: { id: "folder-1", name: "Notes" },
        folders: [{ id: "folder-1", name: "Notes" }],
        items: [
          {
            id: "item-1",
            folderId: "folder-1",
            title: "Screenshot",
            type: "text",
            mediaItems: [],
            attachments: [{ id: "a1", uri: "https://example.com/a1.jpg", mediaType: "image" }],
            listItems: [],
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
          },
          {
            id: "item-2",
            folderId: "folder-1",
            title: "Has both",
            type: "image",
            mediaUrl: "https://example.com/stored.jpg",
            mediaItems: [],
            attachments: [{ id: "a2", uri: "https://example.com/a2.jpg", mediaType: "image" }],
            listItems: [],
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
          },
        ],
        link: { scope: "folder_only" },
      },
    });

    await renderPreview();

    await waitFor(() => expect(screen.getByText("Screenshot")).toBeTruthy());
    expect(screen.getAllByTestId("itemAttachments")).toHaveLength(1);
    expect(screen.getByTestId("mediaTile-item-2")).toBeTruthy();
  });

  it("shows an empty state for a folder with no items", async () => {
    mockFetchPublicFolder.mockResolvedValue({
      data: {
        folder: { id: "folder-1", name: "Recipes" },
        folders: [{ id: "folder-1", name: "Recipes" }],
        items: [],
        link: { scope: "folder_only" },
      },
    });

    await renderPreview();

    expect(await screen.findByText("No items yet")).toBeTruthy();
  });
});
