import React, { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, View } from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { AppButton } from "../../components/AppButton";
import { ScreenTopBar } from "../../components/ScreenTopBar";
import { RootStackParamList } from "../../navigation/types";
import { useTrove } from "../../storage/storage";
import type { SyncConflictResolution, SyncFieldChoice } from "../../sync/syncConflictResolution";
import { useThemeColors } from "../../theme/ThemeContext";
import { createStyles } from "./styles";

type Props = NativeStackScreenProps<RootStackParamList, "SyncConflict">;

const formatUpdatedAt = (value?: string): string => {
  if (!value) return "Unknown";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
};

export const SyncConflictScreen = ({ navigation }: Props) => {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const {
    folders,
    items,
    resolveSyncConflict,
    syncSnapshot,
  } = useTrove();
  const [busy, setBusy] = useState<"keepLocal" | "merge" | "useRemote" | null>(null);
  const [fieldChoices, setFieldChoices] = useState<Record<string, SyncFieldChoice>>({});

  const conflict = syncSnapshot.conflict;
  const entity = useMemo(() => {
    if (!conflict) return null;
    return conflict.entityKind === "folders"
      ? folders.find((folder) => folder.id === conflict.entityId)
      : items.find((item) => item.id === conflict.entityId);
  }, [conflict, folders, items]);

  const entityKindLabel = conflict?.entityKind === "folders" ? "folder" : "item";
  const choices = useMemo(() => {
    if (!conflict?.fields) return {};

    return Object.fromEntries(
      conflict.fields.map((field) => [
        field.field,
        fieldChoices[field.field] ?? "remote",
      ]),
    ) as Record<string, SyncFieldChoice>;
  }, [conflict?.fields, fieldChoices]);
  const entityTitle =
    conflict?.localLabel ??
    conflict?.remoteLabel ??
    (entity && "name" in entity ? entity.name : entity?.title) ??
    "Deleted locally";
  const conflictBody =
    conflict?.reason === "remote_deleted"
      ? `This ${entityKindLabel} was deleted somewhere else before this device finished syncing.`
      : `This ${entityKindLabel} changed somewhere else before this device finished syncing.`;

  const resolve = useCallback(async (resolution: SyncConflictResolution) => {
    setBusy(typeof resolution === "object" ? "merge" : resolution);
    const result = await resolveSyncConflict(resolution);
    setBusy(null);

    if (!result.ok) {
      Alert.alert("Could not resolve conflict", result.error ?? "Please try again.");
      return;
    }

    navigation.goBack();
  }, [navigation, resolveSyncConflict]);

  const confirmKeepLocal = useCallback(() => {
    Alert.alert(
      "Keep this device's version?",
      "This will overwrite the newer synced version with what is currently on this device.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Keep mine",
          style: "destructive",
          onPress: () => {
            void resolve("keepLocal");
          },
        },
      ],
    );
  }, [resolve]);

  const useLatest = useCallback(() => {
    void resolve("useRemote");
  }, [resolve]);

  const mergeSelectedFields = useCallback(() => {
    void resolve({ fieldChoices: choices, kind: "merge" });
  }, [choices, resolve]);

  const chooseFieldSide = useCallback((field: string, side: SyncFieldChoice) => {
    setFieldChoices((current) => ({
      ...current,
      [field]: side,
    }));
  }, []);

  return (
    <View style={styles.screen}>
      <ScreenTopBar navigation={navigation} />
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <Text style={styles.title}>Sync conflict</Text>

        {!conflict ? (
          <>
            <Text style={styles.body}>There is no active sync conflict.</Text>
            <AppButton label="Back to Trove" onPress={() => navigation.goBack()} style={styles.button} />
          </>
        ) : (
          <>
            <Text style={styles.body}>{conflictBody}</Text>

            <View style={styles.panel}>
              <Text style={styles.label}>Changed {entityKindLabel}</Text>
              <Text style={styles.value}>{entityTitle}</Text>

              {conflict.remoteLabel && conflict.remoteLabel !== entityTitle ? (
                <>
                  <Text style={styles.label}>Latest synced name</Text>
                  <Text style={styles.value}>{conflict.remoteLabel}</Text>
                </>
              ) : null}

              <Text style={styles.label}>This device</Text>
              <Text style={styles.value}>{formatUpdatedAt(conflict.localUpdatedAt)}</Text>

              <Text style={styles.label}>Latest synced version</Text>
              <Text style={styles.value}>{formatUpdatedAt(conflict.remoteUpdatedAt)}</Text>
            </View>

            {conflict.fields && conflict.fields.length > 0 ? (
              <View style={styles.panel}>
                <Text style={styles.compareTitle}>Changed fields</Text>
                {conflict.fields.map((field) => (
                  <View key={field.field} style={styles.fieldRow}>
                    <Text style={styles.label}>{field.field}</Text>
                    <View style={styles.choiceRow}>
                      <Pressable
                        accessibilityRole="button"
                        onPress={() => chooseFieldSide(field.field, "local")}
                        style={[
                          styles.choice,
                          choices[field.field] === "local" && styles.choiceSelected,
                        ]}
                      >
                        <Text
                          style={[
                            styles.choiceLabel,
                            choices[field.field] === "local" && styles.choiceLabelSelected,
                          ]}
                        >
                          This device
                        </Text>
                        <Text
                          style={[
                            styles.compareValue,
                            choices[field.field] === "local" && styles.compareValueSelected,
                          ]}
                        >
                          {field.localValue}
                        </Text>
                      </Pressable>
                      <Pressable
                        accessibilityRole="button"
                        onPress={() => chooseFieldSide(field.field, "remote")}
                        style={[
                          styles.choice,
                          choices[field.field] === "remote" && styles.choiceSelected,
                        ]}
                      >
                        <Text
                          style={[
                            styles.choiceLabel,
                            choices[field.field] === "remote" && styles.choiceLabelSelected,
                          ]}
                        >
                          Latest synced
                        </Text>
                        <Text
                          style={[
                            styles.compareValue,
                            choices[field.field] === "remote" && styles.compareValueSelected,
                          ]}
                        >
                          {field.remoteValue}
                        </Text>
                      </Pressable>
                    </View>
                  </View>
                ))}
              </View>
            ) : null}

            {conflict.fields && conflict.fields.length > 0 ? (
              <AppButton
                label="Save selected fields"
                onPress={mergeSelectedFields}
                disabled={busy !== null}
                style={styles.button}
              />
            ) : null}

            <AppButton
              label="Use latest synced version"
              onPress={useLatest}
              disabled={busy !== null}
              style={styles.button}
            />
            <AppButton
              label="Keep this device's version"
              variant="danger"
              onPress={confirmKeepLocal}
              disabled={busy !== null}
              style={styles.button}
            />
            {busy ? <ActivityIndicator style={styles.busy} /> : null}
          </>
        )}
      </ScrollView>
    </View>
  );
};
