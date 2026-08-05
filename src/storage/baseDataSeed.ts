import AsyncStorage from "@react-native-async-storage/async-storage";

const baseDataSeededKey = (userKey: string) => `trove:baseDataSeeded:${userKey}`;

export const isBaseDataSeeded = async (userKey: string): Promise<boolean> => {
  try {
    return (await AsyncStorage.getItem(baseDataSeededKey(userKey))) === "true";
  } catch {
    return false;
  }
};

export const markBaseDataSeeded = async (userKey: string): Promise<void> => {
  try {
    await AsyncStorage.setItem(baseDataSeededKey(userKey), "true");
  } catch (error) {
    console.warn("Failed to persist base data seed flag", error);
  }
};
