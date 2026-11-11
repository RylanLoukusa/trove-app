import React, { useCallback, useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { ArrowLeftRightIcon, CloudIcon, FolderIcon, ListChecksIcon, Share2Icon, SparklesIcon } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppButton } from "../../components/AppButton";
import { RootStackParamList } from "../../navigation/types";
import { spacing } from "../../theme/theme";
import { useThemeColors } from "../../theme/ThemeContext";
import { createStyles } from "./styles";

type Props = NativeStackScreenProps<RootStackParamList, "Onboarding">;

type Step = {
  icon: typeof SparklesIcon;
  title: string;
  body: string;
};

const steps: Step[] = [
  {
    icon: SparklesIcon,
    title: "Welcome to Trove",
    body: "Trove is a fast, simple home for your lists: to-dos, plans, groceries, anything you want to keep track of.",
  },
  {
    icon: ListChecksIcon,
    title: "Lists that keep up",
    body: "Type a line and press return for the next one. Check lines off, indent them, make headings bold, and mix checkboxes, bullets, and plain text.",
  },
  {
    icon: ArrowLeftRightIcon,
    title: "One line, many lists",
    body: "Add a line from one list to another, like a chore to Today. Check it off in either place and both lists agree.",
  },
  {
    icon: FolderIcon,
    title: "Organize with folders",
    body: "Keep related lists together in folders, and nest folders inside each other however you like.",
  },
  {
    icon: Share2Icon,
    title: "Save from anywhere",
    body: "Share text or a link into Trove from any app and it lands as a line on your Inbox list.",
  },
  {
    icon: CloudIcon,
    title: "Sync across devices",
    body: "Upgrade to Trove Pro any time to keep your lists backed up and in sync everywhere, and to share folders with others.",
  },
];

export const OnboardingScreen = ({ navigation }: Props) => {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const [stepIndex, setStepIndex] = useState(0);

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

  const onNext = useCallback(() => {
    if (isLastStep) {
      finish();
      return;
    }
    setStepIndex((index) => index + 1);
  }, [finish, isLastStep]);

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
        {!isFirstStep ? (
          <AppButton label="Back" variant="secondary" onPress={onBack} style={styles.footerButton} />
        ) : null}
        <AppButton label={isLastStep ? "Get started" : "Next"} onPress={onNext} style={styles.footerButton} />
      </View>
    </View>
  );
};
