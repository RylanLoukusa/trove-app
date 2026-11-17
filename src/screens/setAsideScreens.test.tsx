import React from "react";
import { Alert } from "react-native";
import { fireEvent, screen } from "@testing-library/react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";

import { ArchivedScreen } from "./ArchivedScreen";
import { RecentlyDeletedScreen } from "./RecentlyDeletedScreen";
import { TemplatesScreen } from "./TemplatesScreen";
import type { RootStackParamList } from "../navigation/types";
import { useTrove } from "../storage/storage";
import { renderScreen } from "../test-utils/renderScreen";
import type { Folder, SavedItem } from "../types/models";

jest.mock("../storage/storage", () => ({
  useTrove: jest.fn(),
}));

const mockUseTrove = useTrove as jest.Mock;
const STAMP = "2026-01-01T00:00:00.000Z";
const daysAgo = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString();

const folder = (id: string, name: string): Folder => ({ id, name, parentFolderId: null, createdAt: STAMP, updatedAt: STAMP });
const list = (id: string, title: string, extra: Partial<SavedItem> = {}): SavedItem => ({
  id,
  folderId: "",
  title,
  type: "list",
  tagOptionIds: [],
  listItems: [],
  createdAt: STAMP,
  updatedAt: STAMP,
  ...extra,
});

const navigation = { navigate: jest.fn(), replace: jest.fn(), goBack: jest.fn(), canGoBack: jest.fn(() => true) };
const props = <Name extends keyof RootStackParamList>() =>
  ({ navigation, route: {} }) as unknown as NativeStackScreenProps<RootStackParamList, Name>;

const trove = {
  restoreItem: jest.fn(),
  restoreFolder: jest.fn(),
  deleteItem: jest.fn(),
  deleteFolder: jest.fn(),
  trashItem: jest.fn(),
  trashFolder: jest.fn(),
  setItemArchived: jest.fn(),
  setFolderArchived: jest.fn(),
  copyItem: jest.fn(),
  createItemWithLines: jest.fn(),
  canEditItem: jest.fn(() => true),
  canManageFolder: jest.fn(() => true),
};

let alertSpy: jest.SpyInstance;

beforeEach(() => {
  jest.clearAllMocks();
  alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => undefined);
  trove.canEditItem.mockReturnValue(true);
  trove.canManageFolder.mockReturnValue(true);
});

afterEach(() => alertSpy.mockRestore());

describe("RecentlyDeletedScreen", () => {
  const render = async (overrides: object = {}) => {
    mockUseTrove.mockReturnValue({
      ...trove,
      deletedFolders: [{ folder: folder("trips", "Trips"), at: daysAgo(1), listCount: 2 }],
      deletedItems: [
        list("packing", "Packing", { deletedAt: daysAgo(1), deletedWithFolderId: "trips" }),
        list("chores", "Chores", { deletedAt: daysAgo(10) }),
      ],
      ...overrides,
    });
    await renderScreen(<RecentlyDeletedScreen {...props<"RecentlyDeleted">()} />);
  };

  it("lists deleted folders and lists with how long each has left", async () => {
    await render();

    expect(screen.getByLabelText("📁 Trips, 2 lists · 29 days left")).toBeTruthy();
    expect(screen.getByLabelText("Chores, 20 days left")).toBeTruthy();
    // A list deleted with its folder comes back with the folder.
    expect(screen.queryByText("Packing")).toBeNull();
  });

  it("puts a list or a folder back", async () => {
    await render();

    await fireEvent.press(screen.getByLabelText("Chores, 20 days left"));
    await fireEvent.press(screen.getByLabelText("Put back"));
    expect(trove.restoreItem).toHaveBeenCalledWith("chores");

    await fireEvent.press(screen.getByLabelText("📁 Trips, 2 lists · 29 days left"));
    await fireEvent.press(screen.getByLabelText("Put back"));
    expect(trove.restoreFolder).toHaveBeenCalledWith("trips");
  });

  it("deletes for good only after it is confirmed", async () => {
    trove.deleteItem.mockResolvedValue({ ok: true });
    await render();

    await fireEvent.press(screen.getByLabelText("Chores, 20 days left"));
    await fireEvent.press(screen.getByLabelText("Delete for good"));

    expect(trove.deleteItem).not.toHaveBeenCalled();
    expect(alertSpy).toHaveBeenCalledWith("Delete this list for good?", "This can't be undone.", expect.any(Array));
    (alertSpy.mock.calls[0][2] as Array<{ onPress?: () => void }>)[1].onPress?.();
    expect(trove.deleteItem).toHaveBeenCalledWith("chores");
  });

  it("says so when nothing has been deleted", async () => {
    await render({ deletedFolders: [], deletedItems: [] });

    expect(screen.getByText("Nothing has been deleted.")).toBeTruthy();
  });
});

describe("ArchivedScreen", () => {
  const render = async (overrides: object = {}) => {
    mockUseTrove.mockReturnValue({
      ...trove,
      archivedFolders: [{ folder: folder("trips", "Trips"), at: STAMP, listCount: 1 }],
      archivedItems: [
        list("packing", "Packing", { archivedAt: STAMP, archivedWithFolderId: "trips" }),
        list("lisbon", "Lisbon 2024", { archivedAt: STAMP }),
      ],
      ...overrides,
    });
    await renderScreen(<ArchivedScreen {...props<"Archived">()} />);
  };

  it("opens an archived list", async () => {
    await render();

    await fireEvent.press(screen.getByLabelText("Lisbon 2024"));

    expect(navigation.navigate).toHaveBeenCalledWith("List", { listId: "lisbon" });
  });

  it("unarchives a list or a folder", async () => {
    await render();

    await fireEvent(screen.getByLabelText("Lisbon 2024"), "longPress");
    await fireEvent.press(screen.getByLabelText("Unarchive"));
    expect(trove.setItemArchived).toHaveBeenCalledWith("lisbon", false);

    await fireEvent.press(screen.getByLabelText("📁 Trips, 1 list"));
    await fireEvent.press(screen.getByLabelText("Unarchive"));
    expect(trove.setFolderArchived).toHaveBeenCalledWith("trips", false);
  });

  it("moves an archived list to Recently deleted", async () => {
    trove.trashItem.mockReturnValue({ ok: true });
    await render();

    await fireEvent(screen.getByLabelText("Lisbon 2024"), "longPress");
    await fireEvent.press(screen.getByLabelText("Delete list"));

    expect(trove.trashItem).toHaveBeenCalledWith("lisbon");
  });

  it("says so when nothing is archived", async () => {
    await render({ archivedFolders: [], archivedItems: [] });

    expect(screen.getByText("Nothing is archived.")).toBeTruthy();
  });
});

describe("TemplatesScreen", () => {
  const render = async (templates: SavedItem[] = []) => {
    mockUseTrove.mockReturnValue({ ...trove, templates });
    await renderScreen(<TemplatesScreen {...props<"Templates">()} />);
  };
  const packing = list("tpl", "Packing", {
    isTemplate: true,
    listItems: [{ id: "l1", kind: "check", text: "Passport", checked: false }],
  });

  it("starts a list from one of the person's templates and opens it", async () => {
    trove.copyItem.mockReturnValue(list("new", "Packing"));
    await render([packing]);

    await fireEvent.press(screen.getByLabelText("Packing, 1 line"));

    expect(trove.copyItem).toHaveBeenCalledWith("tpl", { title: "Packing", fresh: true });
    expect(navigation.replace).toHaveBeenCalledWith("List", { listId: "new" });
  });

  it("starts a list from a ready-made template", async () => {
    trove.createItemWithLines.mockReturnValue(list("new", "Groceries"));
    await render();

    expect(screen.queryByText("Your templates")).toBeNull();
    await fireEvent.press(screen.getByLabelText("Groceries, Sorted by where things are in the store"));

    expect(trove.createItemWithLines).toHaveBeenCalledWith("Groceries", expect.arrayContaining([{ text: "Milk" }]));
    expect(navigation.replace).toHaveBeenCalledWith("List", { listId: "new" });
  });

  it("edits or deletes a template from its menu", async () => {
    await render([packing]);

    await fireEvent(screen.getByLabelText("Packing, 1 line"), "longPress");
    await fireEvent.press(screen.getByLabelText("Edit template"));
    expect(navigation.navigate).toHaveBeenCalledWith("List", { listId: "tpl" });

    await fireEvent(screen.getByLabelText("Packing, 1 line"), "longPress");
    await fireEvent.press(screen.getByLabelText("Delete template"));
    expect(trove.trashItem).toHaveBeenCalledWith("tpl");
  });
});
