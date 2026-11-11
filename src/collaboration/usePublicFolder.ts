import { useEffect, useState } from "react";
import { getSupabase } from "../lib/supabase";
import { fetchPublicFolder, PublicFolderData } from "./folderPublicLinks";

type PublicFolderState = {
  data: PublicFolderData | null;
  error: string | null;
  isLoading: boolean;
};

// Loads what a shareable folder link exposes. The screens for one link share
// a cached copy, so moving between them doesn't fetch again.
export const usePublicFolder = (token: string): PublicFolderState => {
  const [state, setState] = useState<PublicFolderState>({ data: null, error: null, isLoading: true });

  useEffect(() => {
    let cancelled = false;
    setState({ data: null, error: null, isLoading: true });

    void (async () => {
      const supabase = getSupabase();
      if (!supabase) {
        if (!cancelled) setState({ data: null, error: "This link can't be opened right now.", isLoading: false });
        return;
      }

      const result = await fetchPublicFolder(supabase, token);
      if (cancelled) return;
      if (result.error || !result.data) {
        setState({ data: null, error: result.error ?? "This link is no longer available.", isLoading: false });
      } else {
        setState({ data: result.data, error: null, isLoading: false });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [token]);

  return state;
};
