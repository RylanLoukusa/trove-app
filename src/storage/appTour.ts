import AsyncStorage from "@react-native-async-storage/async-storage";

const appTourDoneKey = (userKey: string) => `trove:appTourDone:${userKey}`;

export const isAppTourDone = async (userKey: string): Promise<boolean> => {
  try {
    return (await AsyncStorage.getItem(appTourDoneKey(userKey))) === "true";
  } catch {
    return false;
  }
};

export const markAppTourDone = async (userKey: string): Promise<void> => {
  try {
    await AsyncStorage.setItem(appTourDoneKey(userKey), "true");
  } catch (error) {
    console.warn("Failed to persist app tour flag", error);
  }
};
