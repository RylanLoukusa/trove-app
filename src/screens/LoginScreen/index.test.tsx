import React from "react";
import { Alert } from "react-native";
import { fireEvent, screen, waitFor } from "@testing-library/react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { Session } from "@supabase/supabase-js";
import { LoginScreen } from "./index";
import { useAuth, useIsSupabaseConfigured } from "../../auth/AuthContext";
import type { RootStackParamList } from "../../navigation/types";
import { renderScreen } from "../../test-utils/renderScreen";

jest.mock("../../auth/AuthContext", () => ({
  useAuth: jest.fn(),
  useIsSupabaseConfigured: jest.fn(),
}));

jest.mock("expo-apple-authentication", () => ({
  isAvailableAsync: jest.fn().mockResolvedValue(false),
  AppleAuthenticationButton: "AppleAuthenticationButton",
  AppleAuthenticationButtonStyle: { WHITE: 0, WHITE_OUTLINE: 1, BLACK: 2 },
  AppleAuthenticationButtonType: { SIGN_IN: 0, CONTINUE: 1, SIGN_UP: 2 },
}));

const mockUseAuth = useAuth as jest.Mock;
const mockUseIsSupabaseConfigured = useIsSupabaseConfigured as jest.Mock;

const navigation = {
  navigate: jest.fn(),
  goBack: jest.fn(),
  canGoBack: jest.fn().mockReturnValue(true),
} as unknown as NativeStackScreenProps<RootStackParamList, "Login">["navigation"];

const signInWithPassword = jest.fn();
const signUpWithPassword = jest.fn();
const signInWithGoogle = jest.fn();
const signInWithApple = jest.fn();
const requestPasswordReset = jest.fn();

const session = { user: { id: "u1", email: "a@b.com", app_metadata: {} } } as unknown as Session;

const renderLoginScreen = async (currentSession: Session | null = null) => {
  mockUseIsSupabaseConfigured.mockReturnValue(true);
  mockUseAuth.mockReturnValue({
    session: currentSession,
    signInWithPassword,
    signUpWithPassword,
    signInWithGoogle,
    signInWithApple,
    requestPasswordReset,
  });
  await renderScreen(<LoginScreen navigation={navigation} route={{} as never} />);
};

describe("LoginScreen", () => {
  let alertSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => {});
  });

  afterEach(() => {
    alertSpy.mockRestore();
  });

  it("shows a setup message when Supabase is not configured", async () => {
    mockUseIsSupabaseConfigured.mockReturnValue(false);
    mockUseAuth.mockReturnValue({ session: null });
    await renderScreen(<LoginScreen navigation={navigation} route={{} as never} />);

    expect(screen.getByText(/Add EXPO_PUBLIC_SUPABASE_URL/)).toBeTruthy();
  });

  it("shows an already-signed-in message", async () => {
    await renderLoginScreen(session);

    expect(screen.getByText(/You are already signed in/)).toBeTruthy();
  });

  it("signs in with Google from the chooser", async () => {
    signInWithGoogle.mockResolvedValue({});
    await renderLoginScreen();

    await fireEvent.press(screen.getByText("Sign in with Google"));

    expect(signInWithGoogle).toHaveBeenCalledTimes(1);
  });

  it("shows an error when Google sign-in fails", async () => {
    signInWithGoogle.mockResolvedValue({ error: "You're offline. Check your connection and try again." });
    await renderLoginScreen();

    await fireEvent.press(screen.getByText("Sign in with Google"));

    await waitFor(() =>
      expect(screen.getByText("You're offline. Check your connection and try again.")).toBeTruthy(),
    );
  });

  it("signs in with email and password", async () => {
    signInWithPassword.mockResolvedValue({});
    await renderLoginScreen();

    await fireEvent.press(screen.getByText("Continue with Email"));
    await fireEvent.changeText(screen.getByPlaceholderText("you@example.com"), "a@b.com");
    await fireEvent.changeText(screen.getByPlaceholderText("••••••••"), "hunter2");
    await fireEvent.press(screen.getByText("Sign in"));

    expect(signInWithPassword).toHaveBeenCalledWith("a@b.com", "hunter2");
  });

  it("shows a sign-in error inline", async () => {
    signInWithPassword.mockResolvedValue({ error: "Invalid login credentials" });
    await renderLoginScreen();

    await fireEvent.press(screen.getByText("Continue with Email"));
    await fireEvent.changeText(screen.getByPlaceholderText("you@example.com"), "a@b.com");
    await fireEvent.changeText(screen.getByPlaceholderText("••••••••"), "wrong");
    await fireEvent.press(screen.getByText("Sign in"));

    await waitFor(() => expect(screen.getByText("Invalid login credentials")).toBeTruthy());
  });

  it("creates a new account and shows a confirmation alert", async () => {
    signUpWithPassword.mockResolvedValue({});
    await renderLoginScreen();

    await fireEvent.press(screen.getByText("Continue with Email"));
    await fireEvent.press(screen.getByText("New here? Create an account"));
    await fireEvent.changeText(screen.getByPlaceholderText("you@example.com"), "new@b.com");
    await fireEvent.changeText(screen.getByPlaceholderText("••••••••"), "hunter2");
    const createAccountMatches = screen.getAllByText("Create account");
    await fireEvent.press(createAccountMatches[createAccountMatches.length - 1]);

    expect(signUpWithPassword).toHaveBeenCalledWith("new@b.com", "hunter2");
    expect(alertSpy).toHaveBeenCalledWith(
      "Check your email",
      "Confirm the sign-up link if your project requires email verification.",
    );
  });

  it("requests a password reset and returns to sign in", async () => {
    requestPasswordReset.mockResolvedValue({});
    await renderLoginScreen();

    await fireEvent.press(screen.getByText("Continue with Email"));
    await fireEvent.press(screen.getByText("Forgot Password?"));
    await fireEvent.changeText(screen.getByPlaceholderText("you@example.com"), "a@b.com");
    await fireEvent.press(screen.getByText("Send reset link"));

    expect(requestPasswordReset).toHaveBeenCalledWith("a@b.com");
    await waitFor(() => expect(screen.getByText("Sign in")).toBeTruthy());
  });

  it("returns to the chooser from the email flow", async () => {
    await renderLoginScreen();

    await fireEvent.press(screen.getByText("Continue with Email"));
    expect(screen.getByText("Email sign in")).toBeTruthy();

    await fireEvent.press(screen.getByText("Back"));

    expect(screen.getByText("Continue with Email")).toBeTruthy();
  });
});
