import React from "react";
import { fireEvent, screen } from "@testing-library/react-native";
import { TagMultiSelectSheet } from "./TagMultiSelectSheet";
import type { TagOption } from "../types/models";
import { renderScreen } from "../test-utils/renderScreen";

const now = "2026-01-01T00:00:00.000Z";

const makeOption = (id: string, name: string, sortOrder = 0): TagOption => ({
  id,
  groupId: "group-1",
  name,
  sortOrder,
  createdAt: now,
  updatedAt: now,
});

const options: TagOption[] = [makeOption("dinner", "dinner", 0), makeOption("italian", "italian", 1)];

describe("TagMultiSelectSheet", () => {
  it("toggles an option on and off", async () => {
    const onToggleOption = jest.fn();
    await renderScreen(
      <TagMultiSelectSheet
        visible
        title="Tags"
        options={options}
        selectedOptionIds={["dinner"]}
        allowInlineCreate={false}
        onToggleOption={onToggleOption}
        onCreateOption={jest.fn()}
        onClose={jest.fn()}
      />,
    );

    await fireEvent.press(screen.getByText("italian"));

    expect(onToggleOption).toHaveBeenCalledWith("italian");
  });

  it("filters options by the search query", async () => {
    await renderScreen(
      <TagMultiSelectSheet
        visible
        title="Tags"
        options={options}
        selectedOptionIds={[]}
        allowInlineCreate={false}
        onToggleOption={jest.fn()}
        onCreateOption={jest.fn()}
        onClose={jest.fn()}
      />,
    );

    await fireEvent.changeText(screen.getByPlaceholderText("Search tags..."), "ital");

    expect(screen.getByText("italian")).toBeTruthy();
    expect(screen.queryByText("dinner")).toBeNull();
  });

  it("shows a create row for a new name when inline create is allowed", async () => {
    const onCreateOption = jest.fn();
    await renderScreen(
      <TagMultiSelectSheet
        visible
        title="Tags"
        options={options}
        selectedOptionIds={[]}
        allowInlineCreate
        onToggleOption={jest.fn()}
        onCreateOption={onCreateOption}
        onClose={jest.fn()}
      />,
    );

    await fireEvent.changeText(screen.getByPlaceholderText("Search tags..."), "quick");
    await fireEvent.press(screen.getByText("Create “quick”"));

    expect(onCreateOption).toHaveBeenCalledWith("quick");
  });

  it("does not show a create row when inline create is disabled", async () => {
    await renderScreen(
      <TagMultiSelectSheet
        visible
        title="Tags"
        options={options}
        selectedOptionIds={[]}
        allowInlineCreate={false}
        onToggleOption={jest.fn()}
        onCreateOption={jest.fn()}
        onClose={jest.fn()}
      />,
    );

    await fireEvent.changeText(screen.getByPlaceholderText("Search tags..."), "quick");

    expect(screen.queryByText("Create “quick”")).toBeNull();
  });

  it("does not show a create row when the query exactly matches an existing option", async () => {
    await renderScreen(
      <TagMultiSelectSheet
        visible
        title="Tags"
        options={options}
        selectedOptionIds={[]}
        allowInlineCreate
        onToggleOption={jest.fn()}
        onCreateOption={jest.fn()}
        onClose={jest.fn()}
      />,
    );

    await fireEvent.changeText(screen.getByPlaceholderText("Search tags..."), "dinner");

    expect(screen.queryByText('Create "dinner"')).toBeNull();
  });
});
