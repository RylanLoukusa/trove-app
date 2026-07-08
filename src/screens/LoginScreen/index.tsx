import React, { useCallback, useState } from "react";
import { ActivityIndicator, Alert, Linking, Platform, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { ChevronLeft, Mail } from "lucide-react-native";
import Svg, { Path } from "react-native-svg";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth, useIsSupabaseConfigured } from "../../auth/AuthContext";
import { getSignedInLabel } from "../../auth/authDisplay";
import { AppButton } from "../../components/AppButton";
import { PRIVACY_POLICY_URL, TERMS_OF_USE_URL } from "../../legal/legalLinks";
import { ScreenTopBar } from "../../components/ScreenTopBar";
import { RootStackParamList } from "../../navigation/types";
import { colors, spacing } from "../../theme/theme";
import { styles } from "./styles";

type Props = NativeStackScreenProps<RootStackParamList, "Login">;
type AuthMode = "chooser" | "signIn" | "signUp" | "reset";

type AuthOptionButtonProps = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  children: React.ReactNode;
};

const AppleLogo = () => (
  <Svg width={31} height={31} viewBox="0 0 24 24">
    <Path
      fill={colors.ink}
      d="M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09ZM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701Z"
    />
  </Svg>
);

const GoogleLogo = () => (
  <Svg width={31} height={31} viewBox="0 0 18 18">
    <Path
      fill="#4285F4"
      d="M17.64 9.205c0-.638-.057-1.252-.164-1.841H9v3.482h4.844c-.209 1.125-.843 2.078-1.796 2.716v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615Z"
    />
    <Path
      fill="#34A853"
      d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.258c-.806.54-1.837.859-3.048.859-2.344 0-4.328-1.583-5.036-3.71H.957v2.331C2.438 15.983 5.482 18 9 18Z"
    />
    <Path
      fill="#FBBC05"
      d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.594.103-1.171.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.331Z"
    />
    <Path
      fill="#EA4335"
      d="M9 3.58c1.321 0 2.508.454 3.44 1.346l2.582-2.582C13.463.892 11.426 0 9 0 5.482 0 2.438 2.017.957 4.958L3.964 7.29C4.672 5.162 6.656 3.58 9 3.58Z"
    />
  </Svg>
);

const AuthOptionButton = ({ label, onPress, disabled, children }: AuthOptionButtonProps) => (
  <Pressable
    accessibilityLabel={label}
    accessibilityRole="button"
    disabled={disabled}
    onPress={onPress}
    style={({ pressed }) => [
      styles.authOption,
      pressed && !disabled && styles.authOptionPressed,
      disabled && styles.authOptionDisabled,
    ]}
  >
    <View style={styles.authOptionCircle}>{children}</View>
    <Text style={styles.authOptionLabel}>{label}</Text>
  </Pressable>
);

const LegalAgreement = ({ onPressTerms, onPressPrivacy }: { onPressTerms: () => void; onPressPrivacy: () => void }) => (
  <Text style={styles.legalText}>
    By continuing, you agree to Trove,{" "}
    <Text onPress={onPressTerms} style={styles.legalLink}>
      Terms of Use
    </Text>{" "}
    and{" "}
    <Text onPress={onPressPrivacy} style={styles.legalLink}>
      Privacy Policy
    </Text>
    .
  </Text>
);

export const LoginScreen = ({ navigation }: Props) => {
  const { session, signInWithPassword, signUpWithPassword, signInWithGoogle, signInWithApple, requestPasswordReset } = useAuth();
  const supabaseConfigured = useIsSupabaseConfigured();
  const insets = useSafeAreaInsets();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authMode, setAuthMode] = useState<AuthMode>("chooser");

  const onSignIn = useCallback(async () => {
    setAuthError(null);
    setBusy(true);
    const result = await signInWithPassword(email, password);
    setBusy(false);
    if (result.error) {
      setAuthError(result.error);
      return;
    }
  }, [email, password, signInWithPassword]);

  const onSignUp = useCallback(async () => {
    setAuthError(null);
    setBusy(true);
    const result = await signUpWithPassword(email, password);
    setBusy(false);
    if (result.error) {
      setAuthError(result.error);
      return;
    }
    Alert.alert("Check your email", "Confirm the sign-up link if your project requires email verification.");
  }, [email, password, signUpWithPassword]);

  const onSignInWithGoogle = useCallback(async () => {
    setAuthError(null);
    setBusy(true);
    const result = await signInWithGoogle();
    setBusy(false);
    if (result.error) {
      setAuthError(result.error);
      return;
    }
  }, [signInWithGoogle]);

  const onSignInWithApple = useCallback(async () => {
    setAuthError(null);
    setBusy(true);
    const result = await signInWithApple();
    setBusy(false);
    if (result.error) {
      setAuthError(result.error);
      return;
    }
  }, [signInWithApple]);

  const onRequestPasswordReset = useCallback(async () => {
    setAuthError(null);
    setBusy(true);
    const result = await requestPasswordReset(email);
    setBusy(false);
    if (result.error) {
      setAuthError(result.error);
      return;
    }
    Alert.alert("Check your email", "Open the reset link on this device to choose a new password.");
    setAuthMode("signIn");
  }, [email, requestPasswordReset]);

  const onPressForgotPassword = useCallback(() => {
    setAuthError(null);
    setAuthMode("reset");
  }, []);

  const onPressSignInMode = useCallback(() => {
    setAuthError(null);
    setAuthMode("signIn");
  }, []);

  const onPressSignUpMode = useCallback(() => {
    setAuthError(null);
    setAuthMode("signUp");
  }, []);

  const onPressChooserMode = useCallback(() => {
    setAuthError(null);
    setAuthMode("chooser");
  }, []);

  const openLegalLink = useCallback(async (url: string): Promise<void> => {
    try {
      await Linking.openURL(url);
    } catch {
      Alert.alert("Could not open link", "Please try again.");
    }
  }, []);
  const isEmailAuthFlow = !session?.user && authMode !== "chooser";

  if (!supabaseConfigured) {
    return (
      <View style={styles.screen}>
        <ScreenTopBar navigation={navigation} />
        <View style={styles.content}>
          <Text style={styles.title}>Log in to Trove</Text>
          <Text style={styles.body}>
            Supabase is not configured yet. Add EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY to your environment.
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      {isEmailAuthFlow ? (
        <View style={[styles.emailFlowTopBar, { paddingTop: insets.top + spacing.xl }]}>
          <Pressable onPress={onPressChooserMode} style={({ pressed }) => [styles.emailFlowBackButton, pressed && styles.inlineLinkPressed]}>
            <ChevronLeft color={colors.muted} size={20} />
            <Text style={styles.emailFlowBackText}>Back</Text>
          </Pressable>
        </View>
      ) : (
        <ScreenTopBar navigation={navigation} />
      )}
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <Text style={styles.title}>Log in to Trove</Text>
        {session?.user ? (
          <>
            <Text style={styles.body}>You are already signed in. {getSignedInLabel(session)}.</Text>
            <AppButton label="Back" onPress={() => navigation.goBack()} style={styles.button} />
          </>
        ) : authMode === "chooser" ? (
          <View style={styles.bottomAuthArea}>
            <View style={styles.authSection}>
              <View style={styles.authOptionsRow}>
                <AuthOptionButton label="Google" onPress={onSignInWithGoogle} disabled={busy}>
                  <GoogleLogo />
                </AuthOptionButton>
                {Platform.OS === "ios" ? (
                  <AuthOptionButton label="Apple" onPress={onSignInWithApple} disabled={busy}>
                    <AppleLogo />
                  </AuthOptionButton>
                ) : null}
                <AuthOptionButton label="Email" onPress={onPressSignInMode} disabled={busy}>
                  <Mail color={colors.ink} size={29} strokeWidth={2.4} />
                </AuthOptionButton>
              </View>
              {authError ? <Text style={styles.errorCentered}>{authError}</Text> : null}
              {busy ? <ActivityIndicator style={styles.busyIndicator} /> : null}
            </View>
            <View style={styles.legalFooter}>
              <LegalAgreement
                onPressTerms={() => void openLegalLink(TERMS_OF_USE_URL)}
                onPressPrivacy={() => void openLegalLink(PRIVACY_POLICY_URL)}
              />
            </View>
          </View>
        ) : authMode === "reset" ? (
          <View style={styles.bottomAuthArea}>
            <View style={styles.emailFormSection}>
              <Text style={styles.formTitle}>Reset password</Text>
              <Text style={styles.label}>Email</Text>
              <TextInput
                style={styles.input}
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                placeholder="you@example.com"
              />
              {authError ? <Text style={styles.error}>{authError}</Text> : null}
              <AppButton label="Send reset link" onPress={onRequestPasswordReset} disabled={busy} style={styles.button} />
              <Pressable onPress={onPressSignInMode} disabled={busy} style={({ pressed }) => [styles.inlineAction, pressed && styles.inlineLinkPressed]}>
                <Text style={styles.inlineActionText}>Back to sign in</Text>
              </Pressable>
              {busy ? <ActivityIndicator style={styles.button} /> : null}
            </View>
          </View>
        ) : (
          <View style={styles.bottomAuthArea}>
            <View style={styles.emailFormSection}>
              <Text style={styles.formTitle}>{authMode === "signUp" ? "Create account" : "Email sign in"}</Text>
              <Text style={styles.label}>Email</Text>
              <TextInput
                style={styles.input}
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                placeholder="you@example.com"
              />
              <View style={styles.labelRow}>
                <Text style={[styles.label, styles.labelInline]}>Password</Text>
                {authMode === "signIn" ? (
                  <Pressable onPress={onPressForgotPassword} disabled={busy} style={({ pressed }) => pressed && styles.inlineLinkPressed}>
                    <Text style={styles.forgotLink}>Forgot Password?</Text>
                  </Pressable>
                ) : null}
              </View>
              <TextInput
                style={styles.input}
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                placeholder="••••••••"
              />
              {authError ? <Text style={styles.error}>{authError}</Text> : null}
              <AppButton
                label={authMode === "signUp" ? "Create account" : "Sign in"}
                onPress={authMode === "signUp" ? onSignUp : onSignIn}
                disabled={busy}
                style={styles.button}
              />
              <Pressable
                onPress={authMode === "signUp" ? onPressSignInMode : onPressSignUpMode}
                disabled={busy}
                style={({ pressed }) => [styles.inlineAction, pressed && styles.inlineLinkPressed]}
              >
                <Text style={styles.inlineActionText}>
                  {authMode === "signUp" ? "Already have an account? Sign in" : "New here? Create an account"}
                </Text>
              </Pressable>
              {busy ? <ActivityIndicator style={styles.button} /> : null}
            </View>
            <View style={styles.legalFooter}>
              <LegalAgreement
                onPressTerms={() => void openLegalLink(TERMS_OF_USE_URL)}
                onPressPrivacy={() => void openLegalLink(PRIVACY_POLICY_URL)}
              />
            </View>
          </View>
        )}
      </ScrollView>
    </View>
  );
};
