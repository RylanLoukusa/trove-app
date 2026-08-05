import React, { useCallback, useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { CloudIcon, FolderIcon, Share2Icon, SparklesIcon, TagsIcon } from "lucide-react-native";
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
    body: "Trove is a place to collect links, notes, and media so nothing you find gets lost.",
  },
  {
    icon: FolderIcon,
    title: "Organize with folders",
    body: "Group anything you save into folders, and nest folders inside each other however you like.",
  },
  {
    icon: TagsIcon,
    title: "Tag anything",
    body: "Add your own tags to items so you can filter and find things fast, no matter which folder they're in.",
  },
  {
    icon: Share2Icon,
    title: "Save from anywhere",
    body: "Share a link, photo, or video into Trove from any app using the share sheet.",
  },
  {
    icon: CloudIcon,
    title: "Sync across devices",
    body: "Upgrade to Trove Pro any time to keep your folders backed up and in sync everywhere, and to share folders with others.",
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
