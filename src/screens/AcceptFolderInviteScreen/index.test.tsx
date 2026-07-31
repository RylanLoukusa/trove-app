import React from "react";
import { Alert } from "react-native";
import { fireEvent, screen, waitFor } from "@testing-library/react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { Session } from "@supabase/supabase-js";
import { AcceptFolderInviteScreen } from "./index";
import { useAuth } from "../../auth/AuthContext";
import { useTrove } from "../../storage/storage";
import {
  acceptFolderInvite,
  clearPendingFolderInviteToken,
  rememberPendingFolderInviteToken,
} from "../../collaboration/folderSharing";
import { getSupabase } from "../../lib/supabase";
import type { RootStackParamList } from "../../navigation/types";
import { renderScreen } from "../../test-utils/renderScreen";

jest.mock("../../auth/AuthContext", () => ({
  useAuth: jest.fn(),
}));

jest.mock("../../storage/storage", () => ({
  useTrove: jest.fn(),
}));

jest.mock("../../collaboration/folderSharing", () => ({
  acceptFolderInvite: jest.fn(),
  clearPendingFolderInviteToken: jest.fn(),
  rememberPendingFolderInviteToken: jest.fn(),
}));

jest.mock("../../lib/supabase", () => ({
  getSupabase: jest.fn(),
}));

const mockUseAuth = useAuth as jest.Mock;
const mockUseTrove = useTrove as jest.Mock;
const mockAcceptFolderInvite = acceptFolderInvite as jest.Mock;
const mockGetSupabase = getSupabase as jest.Mock;

const navigation = {
  navigate: jest.fn(),
  goBack: jest.fn(),
  canGoBack: jest.fn().mockReturnValue(true),
} as unknown as NativeStackScreenProps<RootStackParamList, "AcceptFolderInvite">["navigation"];

const session = { user: { id: "u1", email: "a@b.com", app_metadata: {} } } as unknown as Session;
const refreshFromRemote = jest.fn();

const renderInviteScreen = async (currentSession: Session | null) => {
  mockUseAuth.mockReturnValue({ session: currentSession });
  mockUseTrove.mockReturnValue({ refreshFromRemote });
  const route = { params: { token: "invite-token" } } as unknown as NativeStackScreenProps<
    RootStackParamList,
    "AcceptFolderInvite"
  >["route"];
  await renderScreen(<AcceptFolderInviteScreen navigation={navigation} route={route} />);
};

describe("AcceptFolderInviteScreen", () => {
  let alertSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetSupabase.mockReturnValue({});
    alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => {});
  });

  afterEach(() => {
    alertSpy.mockRestore();
  });

  it("prompts sign-in when signed out and remembers the token", async () => {
    await renderInviteScreen(null);

    await fireEvent.press(screen.getByText("Sign In to Accept"));

    expect(rememberPendingFolderInviteToken).toHaveBeenCalledWith("invite-token");
    expect(navigation.navigate).toHaveBeenCalledWith("Login");
  });

  it("accepts the invite and shows a confirmation", async () => {
    mockAcceptFolderInvite.mockResolvedValue({});
    refreshFromRemote.mockResolvedValue({ ok: true });

    await renderInviteScreen(session);
    await fireEvent.press(screen.getByText("Accept Invite"));

    await waitFor(() => expect(screen.getByText("Accepted")).toBeTruthy());
    expect(mockAcceptFolderInvite).toHaveBeenCalledWith(expect.anything(), "invite-token");
    expect(clearPendingFolderInviteToken).toHaveBeenCalledTimes(1);
    expect(alertSpy).toHaveBeenCalledWith("Folder added", "You now have access to this shared folder.");
  });

  it("shows an error and stays acceptable when the invite fails", async () => {
    mockAcceptFolderInvite.mockResolvedValue({ error: "This invite has expired." });

    await renderInviteScreen(session);
    await fireEvent.press(screen.getByText("Accept Invite"));

    await waitFor(() => expect(screen.getByText("This invite has expired.")).toBeTruthy());
    expect(screen.getByText("Accept Invite")).toBeTruthy();
    expect(refreshFromRemote).not.toHaveBeenCalled();
  });

  it("navigates home when Go Home is pressed", async () => {
    await renderInviteScreen(session);

    await fireEvent.press(screen.getByText("Go Home"));

    expect(navigation.navigate).toHaveBeenCalledWith("Home");
  });
});
