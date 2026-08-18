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
