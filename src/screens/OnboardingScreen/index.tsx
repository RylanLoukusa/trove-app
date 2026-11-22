import React, { useCallback, useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { CalendarDaysIcon, LayoutGridIcon, ListChecksIcon, SparklesIcon } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppButton } from "../../components/AppButton";
import { useEntitlement } from "../../entitlements/EntitlementContext";
import { RootStackParamList } from "../../navigation/types";
import { spacing } from "../../theme/theme";
import { useThemeColors } from "../../theme/ThemeContext";
import { createStyles } from "./styles";

type Props = NativeStackScreenProps<RootStackParamList, "Onboarding">;

type Step = {
  icon: typeof SparklesIcon;
  title: string;
  body: string;
  pro?: boolean;
};

// A few short slides, shown once after first sign-in and any time from
// Settings. The rest is taught in place, by tips where things happen.
export const ONBOARDING_STEPS: Step[] = [
  {
    icon: ListChecksIcon,
    title: "Lists that keep up",
    body: "Type a line and press return for the next. Check it off when it's done, or give it a date and it finds you when it's due.",
  },
  {
    icon: CalendarDaysIcon,
    title: "Today and This week",
    body: "Anything due soon shows up on Today and This week by itself, from every list. Your day in one place.",
  },
  {
    icon: LayoutGridIcon,
    title: "Trove on your Home Screen",
    body: "Add the Trove widget to see Today at a glance. Press and hold your Home Screen, tap Edit, then Add Widget.",
  },
  {
    icon: SparklesIcon,
    title: "Do more with Pro",
    body: "Lists that fill and reset themselves, reminders at the right time, and lists you edit together with family or friends.",
    pro: true,
  },
];

export const OnboardingScreen = ({ navigation }: Props) => {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const [stepIndex, setStepIndex] = useState(0);
  const { isPro, presentPaywall } = useEntitlement();
  // Someone with Pro already has it: no slide about it.
  const steps = useMemo(() => ONBOARDING_STEPS.filter((item) => !item.pro || !isPro), [isPro]);

  const isFirstStep = stepIndex === 0;
  const isLastStep = stepIndex === steps.length - 1;
  const step = steps[stepIndex];

  const finish = useCallback(() => {
    if (navigation.canGoBack()) {
      navigation.goBack();
    } else {
      navigation.replace("Home");
    }
  }, [navigation]);

  const seePro = useCallback(() => {
    finish();
    presentPaywall("general");
  }, [finish, presentPaywall]);

  const onNext = useCallback(() => {
    if (isLastStep) {
      finish();
      return;
    }
    setStepIndex((index) => index + 1);
  }, [finish, isLastStep, steps.length]);

  const onBack = useCallback(() => {
    setStepIndex((index) => Math.max(0, index - 1));
  }, []);

  const Icon = step.icon;

  return (
    <View style={styles.screen}>
      <View style={[styles.skipRow, { paddingTop: insets.top + spacing.md }]}>
        <Pressable accessibilityRole="button" onPress={finish} hitSlop={12}>
          <Text style={styles.skip}>Skip</Text>
        </Pressable>
      </View>

      <View style={styles.content}>
        <View style={styles.iconWrap}>
          <Icon size={40} color={colors.accentDark} />
        </View>
        <Text style={styles.title}>{step.title}</Text>
        <Text style={styles.body}>{step.body}</Text>
      </View>

      <View style={styles.dots}>
        {steps.map((dotStep, index) => (
          <View key={dotStep.title} style={[styles.dot, index === stepIndex && styles.dotActive]} />
        ))}
      </View>

      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}>
        {step.pro ? (
          <AppButton label="Not now" variant="secondary" onPress={finish} style={styles.footerButton} />
        ) : !isFirstStep ? (
          <AppButton label="Back" variant="secondary" onPress={onBack} style={styles.footerButton} />
        ) : null}
        {step.pro ? (
          <AppButton label="See Trove Pro" onPress={seePro} style={styles.footerButton} />
        ) : (
          <AppButton label={isLastStep ? "Get started" : "Next"} onPress={onNext} style={styles.footerButton} />
        )}
      </View>
    </View>
  );
};
