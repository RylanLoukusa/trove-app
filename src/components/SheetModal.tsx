import React, { ReactNode } from "react";
import { Modal, Platform, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useThemeColors } from "../theme/ThemeContext";

type Props = {
  visible: boolean;
  onClose: () => void;
  children: ReactNode;
};

// A sheet that slides up over the screen. On iPhone it's a page sheet, which
// keeps clear of the status bar by itself. Android draws it full screen,
// edge to edge, so it's padded to stay clear of the status and navigation
// bars, and the back button closes it.
export const SheetModal = ({ visible, onClose, children }: Props) => {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();

  return (
    <Modal animationType="slide" visible={visible} presentationStyle="pageSheet" onRequestClose={onClose}>
      {Platform.OS === "android" ? (
        <View
          style={{
            backgroundColor: colors.background,
            flex: 1,
            paddingBottom: insets.bottom,
            paddingTop: insets.top,
          }}
        >
          {children}
        </View>
      ) : (
        children
      )}
    </Modal>
  );
};
