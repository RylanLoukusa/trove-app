import React, { Component, ReactNode } from "react";
import { SafeAreaView, StyleSheet, Text, View } from "react-native";
import { AppButton } from "./AppButton";
import { colors, spacing } from "../theme/theme";

type Props = { children: ReactNode };
type State = { hasError: boolean };

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: unknown): void {
    console.error("Unhandled error caught by ErrorBoundary:", error);
  }

  private handleRetry = (): void => {
    this.setState({ hasError: false });
  };

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <SafeAreaView style={styles.screen}>
          <View style={styles.content}>
            <Text style={styles.title}>Something went wrong</Text>
            <Text style={styles.body}>
              Trove ran into an unexpected error. Your local data is safe. Try again, and if this
              keeps happening, reopen the app.
            </Text>
            <AppButton label="Try again" onPress={this.handleRetry} style={styles.button} />
          </View>
        </SafeAreaView>
      );
    }

    return this.props.children;
  }
}

const styles = StyleSheet.create({
  screen: {
    backgroundColor: colors.background,
    flex: 1,
  },
  content: {
    flex: 1,
    justifyContent: "center",
    padding: spacing.lg,
  },
  title: {
    color: colors.ink,
    fontSize: 24,
    fontWeight: "900",
    marginBottom: spacing.sm,
    textAlign: "center",
  },
  body: {
    color: colors.muted,
    fontSize: 16,
    lineHeight: 22,
    marginBottom: spacing.lg,
    textAlign: "center",
  },
  button: {
    alignSelf: "center",
    minWidth: 160,
  },
});
