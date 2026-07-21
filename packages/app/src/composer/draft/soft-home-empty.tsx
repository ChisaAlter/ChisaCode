import { useMemo, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Text, useWindowDimensions, View } from "react-native";
import ReanimatedAnimated from "react-native-reanimated";
import { StyleSheet } from "react-native-unistyles";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Folder } from "lucide-react-native";
import { BranchSwitcher } from "@/components/branch-switcher";
import { ComposerImportPill } from "@/composer/draft/import-pill";
import { isWeb } from "@/constants/platform";
import { shortenPath } from "@/utils/shorten-path";

export interface SoftHomeHeroProps {
  formErrorMessage?: string | null;
}

/**
 * Soft Home hero: kicker + title + subtitle only (no segment / prompt chips).
 */
export function SoftHomeHero({ formErrorMessage = null }: SoftHomeHeroProps) {
  const { t } = useTranslation();

  return (
    <View style={styles.softHomeHero} testID="soft-home-hero">
      <Text style={styles.softHomeEyebrow}>{t("workspace.softHomeEyebrow")}</Text>
      <Text style={styles.softHomeTitle}>{t("workspace.softHomeTitle")}</Text>
      <Text style={styles.softHomeSubtitle}>{t("workspace.softHomeSubtitle")}</Text>
      {formErrorMessage ? (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{formErrorMessage}</Text>
        </View>
      ) : null}
    </View>
  );
}

function SoftHomePathPill({ path }: { path: string }) {
  const label = shortenPath(path) || path;
  return (
    <View testID="soft-home-path-pill" accessibilityLabel={path} style={styles.softHomePathPill}>
      <Folder size={14} color="#6f7686" />
      <Text style={styles.softHomePathPillText} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

export interface SoftHomeBranchContext {
  currentBranchName: string | null;
  serverId: string;
  workspaceId: string;
  isGitCheckout: boolean;
}

export interface SoftHomeContextRowProps {
  workspacePath?: string | null;
  branchContext?: SoftHomeBranchContext | null;
  onImportPress?: (() => void) | null;
  /** Interactive path / branch / import row from /new Soft Home. */
  children?: ReactNode;
}

/**
 * Path / branch / import row above the Soft Home pen-bar.
 * Pass `children` for interactive directory/branch pickers; otherwise display pills.
 */
export function SoftHomeContextRow({
  workspacePath = null,
  branchContext = null,
  onImportPress = null,
  children = null,
}: SoftHomeContextRowProps) {
  if (children) {
    return (
      <View style={styles.softHomeContextRow} testID="soft-home-context-row">
        {children}
      </View>
    );
  }

  const showContextRow = Boolean(workspacePath || branchContext || onImportPress);
  if (!showContextRow) {
    return null;
  }

  // Prefer a real branch name; fall back so git Soft Home still exposes the switcher
  // (matches /new Soft Home, which shows a branch pill even before checkout resolves).
  let branchTitle: string | null = null;
  let branchNameForSwitcher: string | null = null;
  if (branchContext?.isGitCheckout) {
    const resolved =
      branchContext.currentBranchName && branchContext.currentBranchName !== "HEAD"
        ? branchContext.currentBranchName
        : null;
    branchNameForSwitcher = resolved;
    branchTitle = resolved ?? "main";
  }

  return (
    <View style={styles.softHomeContextRow} testID="soft-home-context-row">
      <View style={styles.softHomeContextPills}>
        {workspacePath ? <SoftHomePathPill path={workspacePath} /> : null}
        {branchContext && branchTitle ? (
          <BranchSwitcher
            currentBranchName={branchNameForSwitcher}
            title={branchTitle}
            serverId={branchContext.serverId}
            // BranchSwitcher / useBranchSwitcher treat this as git cwd (path), not opaque id.
            workspaceId={branchContext.workspaceId}
            isGitCheckout={branchContext.isGitCheckout}
            presentation="soft-pill"
          />
        ) : null}
      </View>
      {onImportPress ? <ComposerImportPill onPress={onImportPress} /> : null}
    </View>
  );
}

export interface SoftHomeEmptyProps {
  formErrorMessage?: string | null;
  /** Optional keyboard shift style for the composer shell. */
  composerKeyboardStyle?: object;
  /**
   * Content above the pen-bar (path/branch/import). Prefer SoftHomeContextRow.
   */
  contextSlot?: ReactNode;
  /** When true, skip optical top inset (mobile new-workspace bottom sheet feel). */
  compact?: boolean;
  children: ReactNode;
}

/**
 * Shared Soft Home shell: centered hero + context row + floating pen-bar.
 * Used by default /new Soft Home and workspace draft empty center.
 */
export function SoftHomeEmpty({
  formErrorMessage = null,
  composerKeyboardStyle,
  contextSlot = null,
  compact = false,
  children,
}: SoftHomeEmptyProps) {
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();

  // Optical vertical placement from window height — does not depend on flex free space.
  const softHomeTopInset = useMemo(() => {
    if (compact) {
      return 0;
    }
    return Math.min(180, Math.max(56, Math.round(windowHeight * 0.18)));
  }, [compact, windowHeight]);

  const containerStyle = useMemo(
    () => [
      styles.container,
      compact ? styles.containerCompact : null,
      compact
        ? { paddingBottom: Math.max(insets.bottom, 16) }
        : {
            paddingTop: softHomeTopInset,
            paddingBottom: Math.max(insets.bottom, 40),
          },
    ],
    [compact, insets.bottom, softHomeTopInset],
  );

  const composerShell = (
    <View style={styles.softHomeComposerShell}>
      {contextSlot}
      {children}
    </View>
  );

  return (
    <View style={containerStyle} testID="soft-home-empty">
      <View style={styles.softHomeInner}>
        {!compact ? <SoftHomeHero formErrorMessage={formErrorMessage} /> : null}
        {composerKeyboardStyle ? (
          <ReanimatedAnimated.View style={composerKeyboardStyle}>
            {composerShell}
          </ReanimatedAnimated.View>
        ) : (
          composerShell
        )}
      </View>
    </View>
  );
}

export const softHomeComposerInputWrapperStyle = {
  borderRadius: 18,
  ...(isWeb
    ? {
        // Soft --shadow-composer
        boxShadow: "0 2px 8px rgba(20, 23, 31, 0.04), 0 14px 36px rgba(20, 23, 31, 0.07)",
      }
    : {}),
} as const;

/** Soft Home: zero Composer dock horizontal padding so path/import share pen-bar width. */
export const softHomeComposerInputAreaStyle = {
  paddingLeft: 0,
  paddingRight: 0,
  paddingTop: 0,
  paddingBottom: 0,
} as const;

const styles = StyleSheet.create((theme) => ({
  container: {
    flex: 1,
    flexDirection: "column",
    width: "100%",
    minWidth: 0,
    minHeight: 0,
    overflow: "hidden",
    backgroundColor: theme.colors.surfaceWorkspace,
    paddingHorizontal: 28,
  },
  containerCompact: {
    justifyContent: "flex-end",
  },
  softHomeInner: {
    width: "100%",
    maxWidth: 760,
    alignSelf: "center",
    flexShrink: 0,
    gap: theme.spacing[4],
  },
  softHomeHero: {
    width: "100%",
    alignItems: "center",
    gap: theme.spacing[1.5],
  },
  softHomeEyebrow: {
    color: theme.colors.foregroundMuted,
    fontSize: 12.5,
    lineHeight: 16,
    textAlign: "center",
  },
  softHomeTitle: {
    color: theme.colors.foreground,
    fontSize: 36,
    fontWeight: theme.fontWeight.bold,
    letterSpacing: -0.8,
    textAlign: "center",
    lineHeight: 42,
  },
  softHomeSubtitle: {
    color: theme.colors.foreground,
    fontSize: 28,
    fontWeight: theme.fontWeight.semibold,
    letterSpacing: -0.5,
    textAlign: "center",
    lineHeight: 34,
  },
  softHomeComposerShell: {
    width: "100%",
    gap: theme.spacing[2],
  },
  // Path / branch left, import right — never wider than the pen-bar below.
  softHomeContextRow: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing[2],
    minWidth: 0,
  },
  softHomeContextPills: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: theme.spacing[2],
  },
  softHomePathPill: {
    flexDirection: "row",
    alignItems: "center",
    height: 30,
    maxWidth: 220,
    paddingHorizontal: 10,
    borderRadius: theme.borderRadius.full,
    borderWidth: theme.borderWidth[1],
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface0,
    gap: 6,
  },
  softHomePathPillText: {
    color: theme.colors.foregroundMuted,
    fontSize: 12.5,
    lineHeight: 16,
    flexShrink: 1,
  },
  errorContainer: {
    marginTop: theme.spacing[2],
    width: "100%",
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[2],
    borderRadius: 14,
    backgroundColor: theme.colors.surface0,
    borderWidth: 1,
    borderColor: theme.colors.destructive,
  },
  errorText: {
    color: theme.colors.destructive,
  },
}));
