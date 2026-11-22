import React, { useCallback, useMemo } from "react";
import { Alert, Text, View, ScrollView } from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { AppButton } from "../../components/AppButton";
import { ScreenTopBar } from "../../components/ScreenTopBar";
import { useEntitlement } from "../../entitlements/EntitlementContext";
import { RootStackParamList } from "../../navigation/types";
import { FREE_TEMPLATE_LIMIT, type PaywallTrigger } from "../../utils/limits";
import { useThemeColors } from "../../theme/ThemeContext";
import { createStyles } from "./styles";
import { leaveScreen } from "../../navigation/leaveScreen";

type Props = NativeStackScreenProps<RootStackParamList, "Paywall">;

const headlineForTrigger = (trigger: PaywallTrigger): string => {
  switch (trigger) {
    case "sharing":
      return "Edit lists together";
    case "editor_invite":
      return "Help edit this shared folder";
    case "automation":
      return "Let your lists keep themselves";
    case "reminders":
      return "Get reminded on time";
    case "templates":
      return "Save as many templates as you like";
    case "widgets":
      return "More widgets for your Home and Lock Screen";
    default:
      return "Upgrade to Trove Pro";
  }
};

const bodyForTrigger = (trigger: PaywallTrigger): string => {
  switch (trigger) {
    case "sharing":
      return "Anyone can view what you share for free. With Pro, the people you invite can add, check off and change lines too.";
    case "editor_invite":
      return "Viewing a shared folder is always free. Editing it with everyone else comes with Trove Pro.";
    case "automation":
      return "Pro lists can add lines on their own by due date or tag, pull lines in from other lists, and uncheck themselves on a schedule.";
    case "reminders":
      return "Give a line a time and Trove Pro sends you a reminder when it's due.";
    case "templates":
      return `The free plan keeps up to ${FREE_TEMPLATE_LIMIT} of your own templates. Pro has no limit, and the starter templates are always free.`;
    case "widgets":
      return "Pro adds the large widget with Today and This week side by side, and widgets for your Lock Screen.";
    default:
      return "Your lists, folders and sync stay free. Pro adds the features that save you time every day.";
  }
};

const features = [
  "Edit shared folders and lists together",
  "Lists that add lines and uncheck themselves",
  "Reminders at the time a line is due",
  "Unlimited templates of your own",
  "The large widget and Lock Screen widgets",
];

export const PaywallScreen = ({ navigation, route }: Props) => {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { setDevIsPro } = useEntitlement();
  const trigger = route.params.trigger;

  const onUpgrade = useCallback(() => {
    setDevIsPro(true);
    Alert.alert("You're Pro", "This is a placeholder upgrade until real billing is wired up.");
    leaveScreen(navigation);
  }, [navigation, setDevIsPro]);

  return (
    <View style={styles.screen}>
      <ScreenTopBar navigation={navigation} />
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <Text style={styles.title}>{headlineForTrigger(trigger)}</Text>
        <Text style={styles.body}>{bodyForTrigger(trigger)}</Text>

        <View style={styles.panel}>
          {features.map((feature) => (
            <View key={feature} style={styles.featureRow}>
              <Text style={styles.featureBullet}>{"✓"}</Text>
              <Text style={styles.featureText}>{feature}</Text>
            </View>
          ))}
        </View>

        <AppButton label="Upgrade to Pro" onPress={onUpgrade} style={styles.button} />
        <AppButton label="Not now" variant="secondary" onPress={() => leaveScreen(navigation)} style={styles.button} />

        <Text style={styles.devNote}>
          Billing isn't wired up yet — "Upgrade" flips a local dev flag so gated flows can be tested.
        </Text>
      </ScrollView>
    </View>
  );
};
