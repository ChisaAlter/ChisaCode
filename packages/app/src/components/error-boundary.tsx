import { Component, type ErrorInfo, type ReactNode } from "react";
import { Pressable, Text, View, type PressableStateCallbackType } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { appI18n } from "@/i18n";

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: (error: unknown, resetError: () => void) => ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: unknown;
}

/**
 * React Error Boundary that catches render errors in its subtree and displays
 * a recovery UI instead of crashing the entire application.
 *
 * Place at strategic points in the component tree (e.g. wrapping the main
 * shell, individual agent screens, or heavy components like the sidebar) to
 * limit the blast radius of render errors.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: undefined };
  }

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: unknown, errorInfo: ErrorInfo): void {
    console.error("[ErrorBoundary] Uncaught render error:", error, errorInfo.componentStack);
  }

  resetError = () => {
    this.setState({ hasError: false, error: undefined });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback(this.state.error, this.resetError);
      }
      return <DefaultErrorFallback error={this.state.error} onReset={this.resetError} />;
    }
    return this.props.children;
  }
}

/**
 * Standalone fallback component with no hook dependencies so it can render
 * even when the hook tree is corrupted. Uses static, theme-independent styles
 * as a safe fallback — the rest of the app may be in a broken state.
 */
function DefaultErrorFallback({ error, onReset }: { error: unknown; onReset: () => void }) {
  const message =
    error instanceof Error
      ? error.message
      : appI18n.t("errors.generic", { defaultValue: "出了点问题。" });

  return (
    <View style={fallbackStyles.container}>
      <Text style={fallbackStyles.title}>
        {appI18n.t("startup.errorTitle", { defaultValue: "出错了" })}
      </Text>
      <Text style={fallbackStyles.message} numberOfLines={5}>
        {message}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={appI18n.t("common.retry", { defaultValue: "重试" })}
        onPress={onReset}
        style={retryButtonStyle}
      >
        <Text style={fallbackStyles.retryText}>
          {appI18n.t("common.retry", { defaultValue: "重试" })}
        </Text>
      </Pressable>
    </View>
  );
}

function retryButtonStyle({ pressed }: PressableStateCallbackType) {
  return [fallbackStyles.retryButton, pressed && fallbackStyles.retryButtonPressed];
}

const fallbackStyles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    gap: 12,
  },
  title: {
    fontSize: 18,
    fontWeight: "600",
  },
  message: {
    fontSize: 14,
    textAlign: "center",
    maxWidth: 400,
  },
  retryButton: {
    marginTop: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  retryButtonPressed: {
    opacity: 0.7,
  },
  retryText: {
    fontSize: 14,
    fontWeight: "500",
  },
});
