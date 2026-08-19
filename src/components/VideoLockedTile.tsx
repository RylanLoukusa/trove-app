import React from "react";
import { StyleProp, StyleSheet, Text, View, ViewStyle } from "react-native";
import { Lock } from "lucide-react-native";
import { spacing } from "../theme/theme";

type Props = {
  style?: StyleProp<ViewStyle>;
};

// Shown in place of a public link viewer's video -- there's no app installed to actually
// play it for them. Used by both PublicFolderPreview and PublicItemDetail.
export const VideoLockedTile = ({ style }: Props) => (
  <View style={[styles.tile, style]}>
    <Lock color="#FFF" size={22} />
    <Text style={styles.text}>Open Trove to{"\n"}watch this video</Text>
  </View>
);

const styles = StyleSheet.create({
  tile: {
    alignItems: "center",
    backgroundColor: "#000",
    borderRadius: 8,
    gap: 6,
    justifyContent: "center",
    padding: spacing.sm,
  },
  text: {
    color: "#FFF",
    fontSize: 12,
    fontWeight: "700",
    textAlign: "center",
  },
});
