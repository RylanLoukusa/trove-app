import React, { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, Alert, ScrollView, Text, TextInput, View } from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useAuth } from "../../auth/AuthContext";
import { AppButton } from "../../components/AppButton";
import { ScreenTopBar } from "../../components/ScreenTopBar";
import { RootStackParamList } from "../../navigation/types";
import { useThemeColors } from "../../theme/ThemeContext";
import { createStyles } from "./styles";

type Props = NativeStackScreenProps<RootStackParamList, "ResetPassword">;

const MIN_PASSWORD_LENGTH = 8;

export const ResetPasswordScreen = ({ navigation }: Props) => {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { updateRecoveredPassword, signOut } = useAuth();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onSubmit = useCallback(async () => {
    setError(null);

    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Use at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setBusy(true);
    const result = await updateRecoveredPassword(password);
    setBusy(false);

    if (result.error) {
      setError(result.error);
      return;
    }

    Alert.alert("Password updated", "Your new password is ready to use.");
  }, [confirmPassword, password, updateRecoveredPassword]);

  const onCancel = useCallback(async () => {
    setBusy(true);
    await signOut();
    setBusy(false);
  }, [signOut]);

  return (
    <View style={styles.screen}>
      <ScreenTopBar navigation={navigation} showBack={false} />
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <Text style={styles.title}>Choose a new password</Text>
        <Text style={styles.body}>This reset link is active. Set a new password to finish recovering your account.</Text>

        <Text style={styles.label}>New password</Text>
        <TextInput
          accessibilityLabel="New password"
          autoCapitalize="none"
          autoCorrect={false}
          onChangeText={setPassword}
          placeholder="At least 8 characters"
          placeholderTextColor={colors.muted}
          secureTextEntry
          style={styles.input}
          value={password}
        />

        <Text style={styles.label}>Confirm password</Text>
        <TextInput
          accessibilityLabel="Confirm password"
          autoCapitalize="none"
          autoCorrect={false}
          onChangeText={setConfirmPassword}
          placeholder="Re-enter new password"
          placeholderTextColor={colors.muted}
          secureTextEntry
          style={styles.input}
          value={confirmPassword}
        />

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <AppButton label="Update password" onPress={onSubmit} disabled={busy} style={styles.button} />
        <AppButton label="Cancel reset" variant="secondary" onPress={onCancel} disabled={busy} style={styles.button} />
        {busy ? <ActivityIndicator style={styles.button} /> : null}
      </ScrollView>
    </View>
  );
};
