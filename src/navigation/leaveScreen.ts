import type { NavigationProp, ParamListBase } from "@react-navigation/native";

type Leavable = Pick<NavigationProp<ParamListBase>, "goBack" | "navigate"> & { canGoBack?: () => boolean };

// Go back if there is somewhere to go back to. A screen opened from a link,
// the widget or Siri can be the only one on the stack, and a plain goBack()
// there does nothing but log "GO_BACK was not handled"; go Home instead.
export const leaveScreen = (navigation: Leavable): void => {
  if (!navigation.canGoBack || navigation.canGoBack()) {
    navigation.goBack();
    return;
  }
  navigation.navigate("Home");
};
