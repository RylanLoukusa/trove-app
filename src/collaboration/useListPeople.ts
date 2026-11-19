import { useEffect, useState } from "react";

import { useAuth } from "../auth/AuthContext";
import { getSupabase } from "../lib/supabase";
import { loadFolderSharing } from "./folderSharing";
import type { ListPerson } from "./listPeople";
import { accessName, loadListAccess } from "./listSharing";



// Everyone who has a shared list: its owner, the people it is shared with on
// its own, and the people its folder is shared with. Invites still waiting
// are left out, since they can't see the list yet. Empty while loading, and
// for a list nobody else has.
export const useListPeople = (listId: string, folderId: string | undefined, shared: boolean): ListPerson[] => {
  const { session } = useAuth();
  const userId = session?.user?.id;
  const [people, setPeople] = useState<ListPerson[]>([]);

  useEffect(() => {
    const supabase = getSupabase();
    if (!shared || !supabase || !userId) {
      setPeople([]);
      return;
    }
    let cancelled = false;
    void (async () => {
      const [list, folder] = await Promise.all([
        loadListAccess(supabase, listId),
        folderId ? loadFolderSharing(supabase, folderId) : Promise.resolve(null),
      ]);
      if (cancelled) return;
      const byId = new Map<string, ListPerson>();
      const add = (id: string | undefined, name: string) => {
        if (!id || byId.has(id)) return;
        byId.set(id, { id, name, isMe: id === userId });
      };
      list.access.forEach((access) => add(access.userId, accessName(access)));
      folder?.access.forEach((access) => add(access.userId, accessName(access)));
      // Me first, then everyone else by name.
      const sorted = [...byId.values()].sort((a, b) => Number(b.isMe) - Number(a.isMe) || a.name.localeCompare(b.name));
      setPeople(sorted.length > 1 ? sorted : []);
    })().catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [folderId, listId, shared, userId]);

  return people;
};
