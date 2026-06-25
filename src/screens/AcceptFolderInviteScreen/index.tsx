import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import React, { useCallback, useEffect, useState } from "react";
import { Alert, Text, View } from "react-native";
import { useAuth } from "../../auth/AuthContext";
import { AppButton } from "../../components/AppButton";
import { ScreenTopBar } from "../../components/ScreenTopBar";
import {
  acceptFolderInvite,
  clearPendingFolderInviteToken,
  rememberPendingFolderInviteToken,
} from "../../collaboration/folderSharing";
import { getSupabase } from "../../lib/supabase";
import { RootStackParamList } from "../../navigation/types";
import { useWaitingList } from "../../storage/storage";
import { styles } from "./styles";

type Props = NativeStackScreenProps<RootStackParamList, "AcceptFolderInvite">;

export const AcceptFolderInviteScreen = ({ navigation, route }: Props) => {
  const { session } = useAuth();
  const { refreshFromRemote } = useWaitingList();
  const token = route.params.token;
  const [error, setError] = useState<string | null>(null);
  const [isAccepting, setIsAccepting] = useState(false);
  const [didAccept, setDidAccept] = useState(false);

  useEffect(() => {
    if (session?.user) return;
    void rememberPendingFolderInviteToken(token);
  }, [session?.user, token]);

  const onAccept = useCallback(async (): Promise<void> => {
    const supabase = getSupabase();
    if (!supabase || !session?.user) {
      await rememberPendingFolderInviteToken(token);
      navigation.navigate("Login");
      return;
    }

    setIsAccepting(true);
    setError(null);

    const result = await acceptFolderInvite(supabase, token);
    setIsAccepting(false);

    if (result.error) {
      setError(result.error);
      return;
    }

    setDidAccept(true);
    await clearPendingFolderInviteToken();
    const refreshResult = await refreshFromRemote({ force: true });
    if (!refreshResult.ok) {
      setError(refreshResult.error ?? "The invite was accepted, but shared folders could not refresh.");
      return;
    }
    Alert.alert("Folder added", "You now have access to this shared folder.");
  }, [navigation, refreshFromRemote, session?.user, token]);

  const onDone = useCallback((): void => {
    navigation.navigate("Home");
  }, [navigation]);

  const onSignIn = useCallback(async (): Promise<void> => {
    await rememberPendingFolderInviteToken(token);
    navigation.navigate("Login");
  }, [navigation, token]);

  return (
    <View style={styles.screen}>
      <ScreenTopBar navigation={navigation} showBack={!!session?.user} />
      <View style={styles.content}>
        <View style={styles.icon}>
          <Text style={styles.iconText}>📁</Text>
        </View>
        <Text style={styles.title}>Shared folder invite</Text>
        <Text style={styles.message}>
          {session?.user
            ? "Accept this invite to add the shared folder to The Waiting List."
            : "Sign in with the invited email address to accept this folder invite."}
        </Text>

        {!!error && <Text style={styles.error}>{error}</Text>}

        {session?.user ? (
          <>
            <AppButton
              disabled={isAccepting || didAccept}
              label={didAccept ? "Accepted" : isAccepting ? "Accepting..." : "Accept Invite"}
              onPress={() => {
                void onAccept();
              }}
              style={styles.primaryButton}
            />
            <AppButton
              label="Go Home"
              onPress={onDone}
              variant="secondary"
              style={styles.secondaryButton}
            />
          </>
        ) : (
          <AppButton
            label="Sign In to Accept"
            onPress={() => {
              void onSignIn();
            }}
            style={styles.primaryButton}
          />
        )}
      </View>
    </View>
  );
};
