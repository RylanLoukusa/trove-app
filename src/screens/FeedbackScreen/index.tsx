import React, { useMemo, useState } from "react";
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";

import { AppButton } from "../../components/AppButton";
import { ScreenTopBar } from "../../components/ScreenTopBar";
import { useAuth } from "../../auth/AuthContext";
import { leaveScreen } from "../../navigation/leaveScreen";
import { RootStackParamList } from "../../navigation/types";
import { FeedbackKind, sendFeedback, submitFeedback, SUPPORT_EMAIL } from "../../support/feedback";
import { radius, spacing, ThemeColors } from "../../theme/theme";
import { useThemeColors } from "../../theme/ThemeContext";

type Props = NativeStackScreenProps<RootStackParamList, "Feedback">;

const kinds: Array<{ value: FeedbackKind; label: string }> = [
  { value: "idea", label: "An idea" },
  { value: "problem", label: "Something's wrong" },
  { value: "general", label: "Something else" },
];

// Tell us what's working and what isn't, without leaving Trove.
export const FeedbackScreen = ({ navigation }: Props) => {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { session } = useAuth();
  const [kind, setKind] = useState<FeedbackKind>("idea");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);

  const send = async () => {
    if (!message.trim() || sending) return;
    setSending(true);
    const sent = await submitFeedback(message, kind, session?.user?.id);
    setSending(false);
    if (sent) {
      Alert.alert("Thanks for telling us", "We read every message.");
      leaveScreen(navigation);
      return;
    }
    // Signed out or offline: email still works.
    Alert.alert("Couldn't send that here", `You can email it to ${SUPPORT_EMAIL} instead.`, [
      { text: "Cancel", style: "cancel" },
      { text: "Email it", onPress: () => void sendFeedback(message) },
    ]);
  };

  return (
    <View style={styles.screen}>
      <ScreenTopBar navigation={navigation} />
      <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Text accessibilityRole="header" style={styles.title}>
            Send feedback
          </Text>
          <Text style={styles.body}>What's working, and what isn't? It goes straight to the people who make Trove.</Text>

          <View style={styles.kinds} accessibilityRole="radiogroup">
            {kinds.map((option) => {
              const selected = option.value === kind;
              return (
                <Pressable
                  key={option.value}
                  accessibilityRole="radio"
                  accessibilityState={{ selected, checked: selected }}
                  onPress={() => setKind(option.value)}
                  style={[styles.kind, selected && styles.kindSelected]}
                >
                  <Text style={[styles.kindText, selected && styles.kindTextSelected]}>{option.label}</Text>
                </Pressable>
              );
            })}
          </View>

          <TextInput
            accessibilityLabel="Your feedback"
            value={message}
            onChangeText={setMessage}
            multiline
            maxLength={5000}
            autoFocus
            placeholder={kind === "problem" ? "What happened, and what did you expect?" : "Tell us here"}
            placeholderTextColor={colors.muted}
            style={styles.input}
          />

          <AppButton label={sending ? "Sending…" : "Send"} onPress={() => void send()} disabled={!message.trim() || sending} style={styles.button} />

          <Pressable accessibilityRole="button" onPress={() => void sendFeedback(message)} hitSlop={8}>
            <Text style={styles.email}>
              Prefer email? <Text style={styles.emailLink}>{SUPPORT_EMAIL}</Text>
            </Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
};

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    screen: { backgroundColor: colors.background, flex: 1 },
    content: { padding: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.xl },
    title: { color: colors.ink, fontSize: 30, fontWeight: "900", marginBottom: spacing.sm },
    body: { color: colors.muted, fontSize: 16, lineHeight: 23, marginBottom: spacing.md },
    kinds: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs, marginBottom: spacing.md },
    kind: {
      borderColor: colors.border,
      borderRadius: 999,
      borderWidth: 1,
      paddingHorizontal: spacing.sm,
      paddingVertical: 7,
    },
    kindSelected: { backgroundColor: colors.accentDark, borderColor: colors.accentDark },
    kindText: { color: colors.ink, fontSize: 15 },
    kindTextSelected: { color: colors.onAccent, fontWeight: "600" },
    input: {
      backgroundColor: colors.surface,
      borderColor: colors.border,
      borderRadius: radius.sm,
      borderWidth: 1,
      color: colors.ink,
      fontSize: 16,
      minHeight: 160,
      padding: spacing.sm,
      textAlignVertical: "top",
    },
    button: { marginTop: spacing.md },
    email: { color: colors.muted, fontSize: 14, marginTop: spacing.lg, textAlign: "center" },
    emailLink: { color: colors.accentDark, fontWeight: "600" },
  });
