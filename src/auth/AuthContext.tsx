import type { Session } from "@supabase/supabase-js";
import * as AppleAuthentication from "expo-apple-authentication";
import * as Crypto from "expo-crypto";
import React, { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { Alert, Linking, Platform } from "react-native";
import { upsertProfileForUser } from "../collaboration/profiles";
import { getSupabase, isSupabaseConfigured } from "../lib/supabase";
import { friendlyErrorMessage } from "../utils/errorMessages";
import { AUTH_CALLBACK_SCHEME_URL, AUTH_CALLBACK_URL } from "./authRedirect";

type AuthContextValue = {
  session: Session | null;
  isAuthReady: boolean;
  isPasswordRecovery: boolean;
  signInWithPassword: (email: string, password: string) => Promise<{ error?: string }>;
  signUpWithPassword: (email: string, password: string) => Promise<{ error?: string }>;
  signInWithGoogle: () => Promise<{ error?: string }>;
  signInWithApple: () => Promise<{ error?: string }>;
  deleteAccount: () => Promise<{ error?: string }>;
  requestPasswordReset: (email: string) => Promise<{ error?: string }>;
  updateRecoveredPassword: (newPassword: string) => Promise<{ error?: string }>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const decodeParam = (value: string): string => {
  try {
    return decodeURIComponent(value.replace(/\+/g, " "));
  } catch {
    return value;
  }
};

const parseAuthCallbackParams = (url: string): Map<string, string> | null => {
  if (!url.startsWith(AUTH_CALLBACK_URL) && !url.startsWith(AUTH_CALLBACK_SCHEME_URL)) return null;

  const params = new Map<string, string>();
  const [, hash = ""] = url.split("#");
  const query = url.split("#")[0]?.split("?")[1] ?? "";

  [query, hash].forEach((segment) => {
    segment
      .split("&")
      .map((pair) => pair.trim())
      .filter(Boolean)
      .forEach((pair) => {
        const [rawKey, ...rawValue] = pair.split("=");
        if (!rawKey) return;
        params.set(decodeParam(rawKey), decodeParam(rawValue.join("=")));
      });
  });

  return params;
};

const createNonce = (): string => Crypto.randomUUID().replace(/-/g, "");

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [isPasswordRecovery, setIsPasswordRecovery] = useState(false);

  useEffect(() => {
    const supabase = getSupabase();
    if (!supabase) {
      setSession(null);
      setIsAuthReady(true);
      return;
    }

    let cancelled = false;

    void supabase.auth.getSession().then(({ data: { session: next } }) => {
      if (!cancelled) {
        setSession(next);
        setIsAuthReady(true);
      }
    });

    const { data: sub } = supabase.auth.onAuthStateChange((event, next) => {
      setSession(next);
      if (event === "PASSWORD_RECOVERY") {
        setIsPasswordRecovery(true);
      }
      if (event === "SIGNED_OUT") {
        setIsPasswordRecovery(false);
      }
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  const handleAuthCallbackUrl = useCallback(async (url: string | null): Promise<void> => {
    if (!url) return;

    const params = parseAuthCallbackParams(url);
    if (!params) return;

    const supabase = getSupabase();
    if (!supabase) return;

    const errorDescription = params.get("error_description") ?? params.get("error") ?? params.get("error_code");
    if (errorDescription) {
      setIsPasswordRecovery(false);
      Alert.alert("Authentication link failed", errorDescription);
      return;
    }

    const type = params.get("type");
    const isRecoveryLink = type === "recovery";
    const code = params.get("code");
    const accessToken = params.get("access_token");
    const refreshToken = params.get("refresh_token");

    try {
      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) throw error;
        if (isRecoveryLink) setIsPasswordRecovery(true);
        return;
      }

      if (accessToken && refreshToken) {
        const { error } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
        if (error) throw error;
        if (isRecoveryLink) setIsPasswordRecovery(true);
        return;
      }

      Alert.alert("Authentication link failed", "This link is missing the information needed to sign you in.");
    } catch (error) {
      setIsPasswordRecovery(false);
      Alert.alert(
        "Authentication link failed",
        friendlyErrorMessage(error instanceof Error ? error.message : undefined, "Unable to open this link."),
      );
    }
  }, []);

  useEffect(() => {
    const supabase = getSupabase();
    if (!supabase) return;

    void Linking.getInitialURL().then(handleAuthCallbackUrl);
    const subscription = Linking.addEventListener("url", ({ url }) => {
      void handleAuthCallbackUrl(url);
    });

    return () => {
      subscription.remove();
    };
  }, [handleAuthCallbackUrl]);

  useEffect(() => {
    const supabase = getSupabase();
    if (!supabase || !session?.user) return;

    void upsertProfileForUser(supabase, session.user);
  }, [session?.user]);

  const signInWithPassword = useCallback(async (email: string, password: string) => {
    const supabase = getSupabase();
    if (!supabase) {
      Alert.alert("Supabase", "Add EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY to your environment.");
      return { error: "not_configured" };
    }
    const trimmed = email.trim();
    const { error } = await supabase.auth.signInWithPassword({ email: trimmed, password });
    if (error) return { error: friendlyErrorMessage(error.message) };
    return {};
  }, []);

  const signUpWithPassword = useCallback(async (email: string, password: string) => {
    const supabase = getSupabase();
    if (!supabase) {
      Alert.alert("Supabase", "Add EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY to your environment.");
      return { error: "not_configured" };
    }
    const trimmed = email.trim();
    const { error } = await supabase.auth.signUp({
      email: trimmed,
      password,
      options: { emailRedirectTo: AUTH_CALLBACK_URL },
    });
    if (error) return { error: friendlyErrorMessage(error.message) };
    return {};
  }, []);

  const signInWithGoogle = useCallback(async () => {
    const supabase = getSupabase();
    if (!supabase) {
      Alert.alert("Supabase", "Add EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY to your environment.");
      return { error: "not_configured" };
    }

    try {
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: AUTH_CALLBACK_URL,
          scopes: "openid email profile",
          skipBrowserRedirect: true,
        },
      });
      if (error) return { error: friendlyErrorMessage(error.message) };
      if (!data.url) {
        return { error: "Missing Google sign-in URL" };
      }

      await Linking.openURL(data.url);
      return {};
    } catch (error: unknown) {
      return {
        error: friendlyErrorMessage(error instanceof Error ? error.message : undefined, "Unable to sign in with Google"),
      };
    }
  }, []);

  const signInWithApple = useCallback(async () => {
    const supabase = getSupabase();
    if (!supabase) {
      Alert.alert("Supabase", "Add EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY to your environment.");
      return { error: "not_configured" };
    }

    if (Platform.OS !== "ios") {
      return { error: "Sign in with Apple is only available on iOS." };
    }

    const isAvailable = await AppleAuthentication.isAvailableAsync();
    if (!isAvailable) {
      return { error: "Sign in with Apple is not available on this device." };
    }

    try {
      const nonce = createNonce();
      const hashedNonce = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, nonce);
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
        nonce: hashedNonce,
      });

      if (!credential.identityToken) {
        return { error: "Missing Apple identity token" };
      }

      const { error } = await supabase.auth.signInWithIdToken({
        provider: "apple",
        token: credential.identityToken,
        nonce,
      });
      if (error) return { error: friendlyErrorMessage(error.message) };

      const fullName = credential.fullName
        ? [credential.fullName.givenName, credential.fullName.familyName].filter(Boolean).join(" ").trim()
        : "";
      if (fullName || credential.fullName?.givenName || credential.fullName?.familyName) {
        await supabase.auth.updateUser({
          data: {
            full_name: fullName || undefined,
            given_name: credential.fullName?.givenName ?? undefined,
            family_name: credential.fullName?.familyName ?? undefined,
          },
        });
      }

      return {};
    } catch (error: unknown) {
      const code = typeof error === "object" && error !== null && "code" in error ? (error as { code?: unknown }).code : null;
      if (code === "ERR_REQUEST_CANCELED") {
        return { error: "Apple sign-in cancelled" };
      }
      return {
        error: friendlyErrorMessage(error instanceof Error ? error.message : undefined, "Unable to sign in with Apple"),
      };
    }
  }, []);

  const deleteAccount = useCallback(async () => {
    const supabase = getSupabase();
    if (!supabase) {
      Alert.alert("Supabase", "Add EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY to your environment.");
      return { error: "not_configured" };
    }

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (userError) return { error: friendlyErrorMessage(userError.message) };
    if (!user) return { error: "You must be signed in to delete your account." };

    const { error } = await supabase.rpc("delete_current_user");
    if (error) return { error: friendlyErrorMessage(error.message) };

    setIsPasswordRecovery(false);
    await supabase.auth.signOut();
    return {};
  }, []);


  const requestPasswordReset = useCallback(async (email: string) => {
    const supabase = getSupabase();
    if (!supabase) {
      Alert.alert("Supabase", "Add EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY to your environment.");
      return { error: "not_configured" };
    }

    const trimmed = email.trim();
    if (!trimmed) {
      return { error: "Enter the email address for your account." };
    }

    const { error } = await supabase.auth.resetPasswordForEmail(trimmed, { redirectTo: AUTH_CALLBACK_URL });
    if (error) return { error: friendlyErrorMessage(error.message) };
    return {};
  }, []);

  const updateRecoveredPassword = useCallback(async (newPassword: string) => {
    const supabase = getSupabase();
    if (!supabase) {
      Alert.alert("Supabase", "Add EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY to your environment.");
      return { error: "not_configured" };
    }

    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) return { error: friendlyErrorMessage(error.message) };
    setIsPasswordRecovery(false);
    return {};
  }, []);

  const signOut = useCallback(async () => {
    const supabase = getSupabase();
    if (!supabase) return;
    setIsPasswordRecovery(false);
    await supabase.auth.signOut();
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      isAuthReady,
      isPasswordRecovery,
      signInWithPassword,
      signUpWithPassword,
      signInWithGoogle,
      signInWithApple,
      deleteAccount,
      requestPasswordReset,
      updateRecoveredPassword,
      signOut,
    }),
    [
      session,
      isAuthReady,
      isPasswordRecovery,
      signInWithPassword,
      signUpWithPassword,
      signInWithGoogle,
      signInWithApple,
      deleteAccount,
      requestPasswordReset,
      updateRecoveredPassword,
      signOut,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = (): AuthContextValue => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
};

export const useIsSupabaseConfigured = (): boolean => isSupabaseConfigured();
