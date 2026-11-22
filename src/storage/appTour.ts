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

// The intro slides show once per account on this device, after first sign-in.
const introSeenKey = (userKey: string) => `trove:introSeen:${userKey}`;

export const isIntroSeen = async (userKey: string): Promise<boolean> => {
  try {
    return (await AsyncStorage.getItem(introSeenKey(userKey))) === "true";
  } catch {
    return true;
  }
};

export const markIntroSeen = async (userKey: string): Promise<void> => {
  try {
    await AsyncStorage.setItem(introSeenKey(userKey), "true");
  } catch (error) {
    console.warn("Failed to persist intro flag", error);
  }
};
