import { useCallback, useEffect, useRef } from "react";
import { Alert, AppState, Linking } from "react-native";

import { navigationRef } from "../navigation/navigationRef";
import { SHARED_INBOX_TITLE } from "../share/sharedImport";
import { useTrove } from "../storage/storage";
import { createId } from "../utils/id";
import { parseSmartText } from "../utils/smartText";
import { priorityOptionsFor } from "../utils/listView";
import { parseShortcutUrl, runShortcutCommand, ShortcutCommand, shortcutListIndex } from "./shortcutCommands";
import { saveShortcutLists, takePendingShortcutCommands } from "./shortcutsBridge";

// Carries out what Siri, the Shortcuts app or a trove://add or trove://open
// link asks for, once the person is signed in and their lists have loaded.
// A link opens the list afterwards; something added by voice in the
// background doesn't.
export const useShortcutCommands = (enabled: boolean): void => {
  const { items, canEditItem, createItem, insertListEntries, isReady, tagGroups, tagOptions } = useTrove();
  const latest = useRef({ items, canEditItem, createItem, insertListEntries, tagGroups, tagOptions });
  latest.current = { items, canEditItem, createItem, insertListEntries, tagGroups, tagOptions };
  const waiting = useRef<Array<{ command: ShortcutCommand; open: boolean }>>([]);
  const ready = enabled && isReady;
  const readyRef = useRef(ready);
  readyRef.current = ready;

  const run: () => void = useCallback(() => {
    if (!readyRef.current) return;
    if (!navigationRef.isReady()) {
      // The screens are still mounting: try again in a moment.
      setTimeout(() => run(), 300);
      return;
    }
    const queue = waiting.current;
    waiting.current = [];
    queue.forEach(({ command, open }) => {
      const { items: lists, tagGroups: groups, tagOptions: options } = latest.current;
      const priorityOptions = priorityOptionsFor(groups, options);
      // Each line reads like quick add: "Milk !high #store".
      const smart = (line: string) => parseSmartText(line, { priorityOptions, tagOptions: options });
      const outcome = runShortcutCommand(command, {
        items: lists,
        canEditItem: latest.current.canEditItem,
        inboxTitle: SHARED_INBOX_TITLE,
        createList: (title, lines) =>
          latest.current.createItem({
            folderId: "",
            title,
            type: "list",
            tagOptionIds: [],
            listItems: lines.map((line) => ({ id: createId("entry"), kind: "check", text: smart(line).text })),
          }),
        addLines: (listId, lines) =>
          latest.current.insertListEntries(
            listId,
            null,
            lines.map((line) => {
              const { text, fields } = smart(line);
              return { text, ...fields };
            }),
          ).length,
      });
      if (!outcome.ok) {
        if (open) Alert.alert("Trove", outcome.error);
        return;
      }
      if (open || command.action === "open") navigationRef.navigate("List", { listId: outcome.listId });
    });
  }, []);

  const takeFromSiri = useCallback(async () => {
    const commands = await takePendingShortcutCommands();
    if (commands.length === 0) return;
    waiting.current.push(...commands.map((command) => ({ command, open: false })));
    run();
  }, [run]);

  // Links, whether they opened the app or arrived while it was open.
  useEffect(() => {
    const take = (url: string | null) => {
      const command = url ? parseShortcutUrl(url) : null;
      if (!command) return;
      waiting.current.push({ command, open: true });
      run();
    };
    void Linking.getInitialURL().then(take).catch(() => undefined);
    const subscription = Linking.addEventListener("url", ({ url }) => take(url));
    return () => subscription.remove();
  }, [run]);

  // Siri asks "Which list?" with the person's lists: keep its copy current.
  const savedLists = useRef<string | null>(null);
  useEffect(() => {
    if (!ready) return;
    const handle = setTimeout(() => {
      const index = shortcutListIndex(items, canEditItem, SHARED_INBOX_TITLE);
      const key = JSON.stringify(index);
      if (key === savedLists.current) return;
      void saveShortcutLists(index).then((saved) => {
        if (saved) savedLists.current = key;
      });
    }, 1500);
    return () => clearTimeout(handle);
  }, [ready, items, canEditItem]);

  // Signed out: Siri stops offering this person's lists.
  useEffect(() => {
    if (enabled || savedLists.current === null) return;
    savedLists.current = null;
    void saveShortcutLists([]);
  }, [enabled]);

  useEffect(() => {
    if (!ready) return;
    void takeFromSiri();
    run();
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") void takeFromSiri();
    });
    return () => subscription.remove();
  }, [ready, run, takeFromSiri]);
};
