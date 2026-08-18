import React from "react";
import { Linking, Text } from "react-native";
import { act, render, screen, waitFor } from "@testing-library/react-native";
import { AuthProvider, useAuth } from "./AuthContext";
import { getSupabase } from "../lib/supabase";

jest.mock("../lib/supabase", () => ({
  getSupabase: jest.fn(),
  isSupabaseConfigured: jest.fn().mockReturnValue(true),
}));

jest.mock("../collaboration/profiles", () => ({
  upsertProfileForUser: jest.fn(),
}));

const mockGetSupabase = getSupabase as jest.Mock;

const Consumer = () => {
  const { isAuthReady } = useAuth();
  return <Text>{isAuthReady ? "ready" : "loading"}</Text>;
};

describe("AuthContext auth callback handling", () => {
  let urlListener: ((event: { url: string }) => void) | undefined;
  let exchangeCodeForSession: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    urlListener = undefined;
    exchangeCodeForSession = jest.fn().mockResolvedValue({ error: null });
    mockGetSupabase.mockReturnValue({
      auth: {
        getSession: jest.fn().mockResolvedValue({ data: { session: null } }),
        onAuthStateChange: jest.fn().mockReturnValue({ data: { subscription: { unsubscribe: jest.fn() } } }),
        exchangeCodeForSession,
      },
    });

    jest.spyOn(Linking, "getInitialURL").mockResolvedValue(null);
    jest.spyOn(Linking, "addEventListener").mockImplementation((_event, handler) => {
      urlListener = handler as (event: { url: string }) => void;
      return { remove: jest.fn() } as unknown as ReturnType<typeof Linking.addEventListener>;
    });
  });

  const renderProvider = async (): Promise<void> => {
    await act(async () => {
      render(
        <AuthProvider>
          <Consumer />
        </AuthProvider>,
      );
    });
    await waitFor(() => expect(screen.getByText("ready")).toBeTruthy());
  };

  it("exchanges the code from the https callback URL (Universal Links)", async () => {
    await renderProvider();

    await act(async () => {
      urlListener?.({ url: "https://trovecollections.app/auth/callback?code=abc123" });
    });

    await waitFor(() => expect(exchangeCodeForSession).toHaveBeenCalledWith("abc123"));
  });

  it("exchanges the code from the trove:// scheme fallback URL (trove-web redirect)", async () => {
    await renderProvider();

    await act(async () => {
      urlListener?.({ url: "trove://auth/callback?code=xyz789" });
    });

    await waitFor(() => expect(exchangeCodeForSession).toHaveBeenCalledWith("xyz789"));
  });

  it("ignores URLs unrelated to the auth callback", async () => {
    await renderProvider();

    await act(async () => {
      urlListener?.({ url: "trove://shared/some-token" });
    });

    expect(exchangeCodeForSession).not.toHaveBeenCalled();
  });
});
