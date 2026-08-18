import { useEffect, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import { getSupabase } from "../lib/supabase";
import { FolderPublicLink, loadPublicLinkStatus } from "./folderPublicLinks";

type PublicLinkStatus = {
  isLoading: boolean;
  link?: FolderPublicLink;
};

export const usePublicLinkStatus = (
  folderId: string | undefined,
  refreshKey?: unknown,
): PublicLinkStatus => {
  const { session } = useAuth();
  const supabase = getSupabase();
  const userId = session?.user?.id;
  const [status, setStatus] = useState<PublicLinkStatus>({ isLoading: !!folderId });

  useEffect(() => {
    if (!supabase || !userId || !folderId) {
      setStatus({ isLoading: false, link: undefined });
      return;
    }

    let cancelled = false;
    setStatus((previous) => ({ isLoading: true, link: previous.link }));

    void (async () => {
      const result = await loadPublicLinkStatus(supabase, folderId);
      if (cancelled) return;

      setStatus({ isLoading: false, link: result.error ? undefined : result.link });
    })();

    return () => {
      cancelled = true;
    };
  }, [folderId, refreshKey, supabase, userId]);

  return status;
};
