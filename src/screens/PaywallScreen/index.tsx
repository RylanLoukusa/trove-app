import React, { useCallback, useMemo } from "react";
import { Alert, Text, View, ScrollView } from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { AppButton } from "../../components/AppButton";
import { ScreenTopBar } from "../../components/ScreenTopBar";
import { useEntitlement } from "../../entitlements/EntitlementContext";
import { RootStackParamList } from "../../navigation/types";
import type { PaywallTrigger } from "../../utils/limits";
import { useThemeColors } from "../../theme/ThemeContext";
import { createStyles } from "./styles";

type Props = NativeStackScreenProps<RootStackParamList, "Paywall">;

const headlineForTrigger = (trigger: PaywallTrigger): string => {
  switch (trigger) {
    case "sync":
      return "Sync your folders everywhere";
    case "sharing":
      return "Share a folder with others";
    case "video_upload":
      return "Save videos to your collections";
    case "video_playback":
      return "Watch this video";
    case "editor_invite":
      return "Contribute to a shared folder";
    case "general":
      return "Upgrade to Trove Pro";
    default:
      return "Upgrade to Trove Pro";
  }
};

const bodyForTrigger = (trigger: PaywallTrigger): string => {
  switch (trigger) {
    case "sync":
      return "Cloud sync keeps your folders backed up and available on every device you own.";
    case "sharing":
      return "Sharing a folder you own requires Pro, since it keeps that folder synced for everyone you invite.";
    case "video_upload":
      return "Adding video requires Pro. Images, links, and text stay free with no limits.";
    case "video_playback":
      return "Playing full-quality video from a shared folder requires Pro.";
    case "editor_invite":
      return "Viewing a shared folder is always free. Contributing as an editor requires your own Pro subscription.";
    case "general":
      return "Sync your folders across devices, share collections with others, and save video — all with Trove Pro.";
    default:
      return "Upgrade to unlock this feature.";
  }
};

const features = [
  "Cloud sync across all your devices",
  "Share folders with anyone",
  "Save and watch video in your collections",
  "Contribute as an editor on shared folders",
];

export const PaywallScreen = ({ navigation, route }: Props) => {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { setDevIsPro } = useEntitlement();
  const trigger = route.params.trigger;

  const onUpgrade = useCallback(() => {
    setDevIsPro(true);
    Alert.alert("You're Pro", "This is a placeholder upgrade until real billing is wired up.");
    navigation.goBack();
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
        <AppButton label="Not now" variant="secondary" onPress={() => navigation.goBack()} style={styles.button} />

        <Text style={styles.devNote}>
          Billing isn't wired up yet — "Upgrade" flips a local dev flag so gated flows can be tested.
        </Text>
      </ScrollView>
    </View>
  );
};
