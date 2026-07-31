import React from "react";
import { fireEvent, screen, waitFor } from "@testing-library/react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { Session } from "@supabase/supabase-js";
import { ProfileScreen } from "./index";
import { useAuth } from "../../auth/AuthContext";
import { loadCurrentProfile, updateCurrentProfile } from "../../collaboration/profiles";
import { getSupabase } from "../../lib/supabase";
import type { RootStackParamList } from "../../navigation/types";
import { renderScreen } from "../../test-utils/renderScreen";

jest.mock("../../auth/AuthContext", () => ({
  useAuth: jest.fn(),
}));

jest.mock("../../collaboration/profiles", () => ({
  loadCurrentProfile: jest.fn(),
  updateCurrentProfile: jest.fn(),
}));

jest.mock("../../lib/supabase", () => ({
  getSupabase: jest.fn(),
}));

const mockUseAuth = useAuth as jest.Mock;
const mockLoadCurrentProfile = loadCurrentProfile as jest.Mock;
const mockUpdateCurrentProfile = updateCurrentProfile as jest.Mock;
const mockGetSupabase = getSupabase as jest.Mock;

const navigation = {
  navigate: jest.fn(),
  goBack: jest.fn(),
  canGoBack: jest.fn().mockReturnValue(true),
} as unknown as NativeStackScreenProps<RootStackParamList, "Profile">["navigation"];

const session = { user: { id: "u1", email: "a@b.com", app_metadata: {} } } as unknown as Session;

const renderProfileScreen = async () => {
  await renderScreen(<ProfileScreen navigation={navigation} route={{} as never} />);
};

describe("ProfileScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetSupabase.mockReturnValue({});
  });

  it("prompts sign in when there is no session", async () => {
    mockUseAuth.mockReturnValue({ session: null });
    await renderProfileScreen();

    expect(screen.getByText("Sign in to view your profile.")).toBeTruthy();
  });

  it("loads and displays the current profile", async () => {
    mockUseAuth.mockReturnValue({ session });
    mockLoadCurrentProfile.mockResolvedValue({
      profile: { avatarUrl: null, displayName: "Ada", email: "a@b.com", id: "u1", updatedAt: null },
    });

    await renderProfileScreen();

    await waitFor(() => expect(screen.getByDisplayValue("Ada")).toBeTruthy());
    expect(screen.getByText("a@b.com")).toBeTruthy();
  });

  it("shows an error with a retry option when loading fails", async () => {
    mockUseAuth.mockReturnValue({ session });
    mockLoadCurrentProfile.mockResolvedValueOnce({ error: "Network request failed" });

    await renderProfileScreen();

    await waitFor(() => expect(screen.getByText("Network request failed")).toBeTruthy());

    mockLoadCurrentProfile.mockResolvedValueOnce({
      profile: { avatarUrl: null, displayName: "Ada", email: "a@b.com", id: "u1", updatedAt: null },
    });
    await fireEvent.press(screen.getByText("Try again"));

    await waitFor(() => expect(screen.getByDisplayValue("Ada")).toBeTruthy());
    expect(mockLoadCurrentProfile).toHaveBeenCalledTimes(2);
  });

  it("saves a new display name", async () => {
    mockUseAuth.mockReturnValue({ session });
    mockLoadCurrentProfile.mockResolvedValue({
      profile: { avatarUrl: null, displayName: "Ada", email: "a@b.com", id: "u1", updatedAt: null },
    });
    mockUpdateCurrentProfile.mockResolvedValue({
      profile: { avatarUrl: null, displayName: "Ada Lovelace", email: "a@b.com", id: "u1", updatedAt: null },
    });

    await renderProfileScreen();
    await waitFor(() => expect(screen.getByDisplayValue("Ada")).toBeTruthy());

    await fireEvent.changeText(screen.getByDisplayValue("Ada"), "Ada Lovelace");
    await fireEvent.press(screen.getByText("Save Profile"));

    await waitFor(() => expect(screen.getByText("Profile saved.")).toBeTruthy());
    expect(mockUpdateCurrentProfile).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ displayName: "Ada Lovelace", userId: "u1" }),
    );
  });
});
