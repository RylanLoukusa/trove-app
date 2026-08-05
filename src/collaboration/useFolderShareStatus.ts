import { useEffect, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import { getSupabase } from "../lib/supabase";
import { loadFolderSharing } from "./folderSharing";

type FolderShareStatus = {
  isLoading: boolean;
  /** True once the folder has been shared with anyone — an accepted collaborator or a
   * not-yet-accepted invite. Doesn't cover the invited side's own accessRole; check
   * isSharedAccess separately for that (it's known synchronously, no fetch needed). */
  isShared: boolean;
};

export const useFolderShareStatus = (folderId: string | undefined): FolderShareStatus => {
  const { session } = useAuth();
  const supabase = getSupabase();
  const userId = session?.user?.id;
  const [status, setStatus] = useState<FolderShareStatus>({ isLoading: !!folderId, isShared: false });

  useEffect(() => {
    if (!supabase || !userId || !folderId) {
      setStatus({ isLoading: false, isShared: false });
      return;
    }

    let cancelled = false;
    setStatus({ isLoading: true, isShared: false });

    void (async () => {
      const result = await loadFolderSharing(supabase, folderId);
      if (cancelled) return;

      const isShared =
        !result.error &&
        (result.shares.length > 0 ||
          result.invites.some((invite) => invite.status !== "revoked") ||
          result.access.some((entry) => entry.kind !== "owner"));

      setStatus({ isLoading: false, isShared });
    })();

    return () => {
      cancelled = true;
    };
  }, [folderId, supabase, userId]);

  return status;
};
