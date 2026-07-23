"""Migrate remaining settings/new-workspace useUnistyles call sites."""
from __future__ import annotations

import re
from pathlib import Path

files = [
    Path("packages/app/src/screens/new-workspace-screen.tsx"),
    Path("packages/app/src/screens/settings/custom-model-providers-section.tsx"),
    Path("packages/app/src/screens/settings/custom-models-section.tsx"),
    Path("packages/app/src/screens/settings/mcp-servers-section.tsx"),
    Path("packages/app/src/screens/settings/providers-section.tsx"),
    Path("packages/app/src/screens/settings/skills-section.tsx"),
    Path("packages/app/src/screens/settings/synthetic-models-section.tsx"),
    Path("packages/app/src/screens/settings/usage-statistics-section.tsx"),
]

MAPPINGS = """
const foregroundMutedColorMapping = (theme: Theme) => ({
  color: theme.colors.foregroundMuted,
});
const foregroundColorMapping = (theme: Theme) => ({
  color: theme.colors.foreground,
});
const accentColorMapping = (theme: Theme) => ({
  color: theme.colors.accent,
});
const destructiveColorMapping = (theme: Theme) => ({
  color: theme.colors.destructive,
});
const placeholderTextColorMapping = (theme: Theme) => ({
  placeholderTextColor: theme.colors.foregroundMuted,
});
const placeholderColorMapping = (theme: Theme) => ({
  placeholderColor: theme.colors.foregroundMuted,
});
"""

ICON_WRAPPERS = {
    "Search": "const ThemedSearch = withUnistyles(Search);",
    "Plus": "const ThemedPlus = withUnistyles(Plus);",
    "Pencil": "const ThemedPencil = withUnistyles(Pencil);",
    "Trash2": "const ThemedTrash2 = withUnistyles(Trash2);",
    "Download": "const ThemedDownload = withUnistyles(Download);",
    "RefreshCw": "const ThemedRefreshCw = withUnistyles(RefreshCw);",
    "Brain": "const ThemedBrain = withUnistyles(Brain);",
    "FlaskConical": "const ThemedFlaskConical = withUnistyles(FlaskConical);",
    "ChevronRight": "const ThemedChevronRight = withUnistyles(ChevronRight);",
    "LoadingSpinner": "const ThemedLoadingSpinner = withUnistyles(LoadingSpinner);",
    "TextInput": "const ThemedTextInput = withUnistyles(TextInput);",
}


def ensure_imports(text: str) -> str:
    text = text.replace(
        'import { StyleSheet, useUnistyles } from "react-native-unistyles";',
        'import { StyleSheet, withUnistyles } from "react-native-unistyles";',
    )
    text = re.sub(
        r'import \{([^}]*?)useUnistyles,\s*withUnistyles([^}]*)\} from "react-native-unistyles";',
        r'import {\1withUnistyles\2} from "react-native-unistyles";',
        text,
    )
    text = re.sub(
        r'import \{([^}]*?)withUnistyles,\s*useUnistyles([^}]*)\} from "react-native-unistyles";',
        r'import {\1withUnistyles\2} from "react-native-unistyles";',
        text,
    )
    if 'from "@/styles/theme"' not in text:
        text = text.replace(
            'from "react-native-unistyles";\n',
            'from "react-native-unistyles";\nimport { ICON_SIZE, type Theme } from "@/styles/theme";\n',
            1,
        )
    else:

        def fix_theme_import(m: re.Match[str]) -> str:
            body = m.group(1)
            parts = [p.strip() for p in body.split(",") if p.strip()]
            if "ICON_SIZE" not in body:
                parts.insert(0, "ICON_SIZE")
            if "type Theme" not in body and not any(
                p == "Theme" or p.endswith(" Theme") for p in parts
            ):
                parts.append("type Theme")
            return f'import {{ {", ".join(parts)} }} from "@/styles/theme";'

        text = re.sub(
            r'import \{([^}]+)\} from "@/styles/theme";',
            fix_theme_import,
            text,
            count=1,
        )
    return text


def ensure_wrappers(text: str) -> str:
    needed: list[str] = []
    for name, decl in ICON_WRAPPERS.items():
        if decl in text or f"Themed{name}" in text:
            continue
        if name == "LoadingSpinner" and "LoadingSpinner" in text and "color={theme" in text:
            needed.append(decl)
        elif name == "TextInput" and "placeholderTextColor={theme" in text:
            needed.append(decl)
        elif name not in ("LoadingSpinner", "TextInput"):
            if re.search(rf"<{name}\b[\s\S]{{0,160}}theme\.(colors|iconSize)", text):
                needed.append(decl)
    if "foregroundMutedColorMapping" not in text and (
        needed
        or "placeholderTextColor={theme" in text
        or "placeholderColor={theme" in text
        or "color={theme" in text
    ):
        needed.append(MAPPINGS.strip())
    if not needed:
        return text
    insert = "\n".join(needed) + "\n"
    theme_import = 'from "@/styles/theme";\n'
    if theme_import in text:
        return text.replace(theme_import, theme_import + "\n" + insert, 1)
    return text.replace(
        'from "react-native-unistyles";\n',
        'from "react-native-unistyles";\n\n' + insert,
        1,
    )


def migrate_jsx(text: str) -> str:
    text = re.sub(r"^\s*const \{ theme \} = useUnistyles\(\);\n", "", text, flags=re.M)
    reps = [
        (
            r'<LoadingSpinner\s+size="small"\s+color=\{theme\.colors\.foregroundMuted\}\s*/>',
            '<ThemedLoadingSpinner size="small" uniProps={foregroundMutedColorMapping} />',
        ),
        (
            r"<LoadingSpinner\s+size=\{14\}\s+color=\{theme\.colors\.accent\}\s*/>",
            "<ThemedLoadingSpinner size={14} uniProps={accentColorMapping} />",
        ),
        (
            r"<LoadingSpinner\s+size=\{10\}\s+color=\{theme\.colors\.foregroundMuted\}\s*/>",
            "<ThemedLoadingSpinner size={10} uniProps={foregroundMutedColorMapping} />",
        ),
        (
            r"<Search\s+size=\{16\}\s+color=\{theme\.colors\.foregroundMuted\}\s*/>",
            "<ThemedSearch size={16} uniProps={foregroundMutedColorMapping} />",
        ),
        (
            r"<Plus\s+size=\{theme\.iconSize\.sm\}\s+color=\{theme\.colors\.foregroundMuted\}\s*/>",
            "<ThemedPlus size={ICON_SIZE.sm} uniProps={foregroundMutedColorMapping} />",
        ),
        (
            r"<Pencil\s+size=\{theme\.iconSize\.sm\}\s+color=\{theme\.colors\.foregroundMuted\}\s*/>",
            "<ThemedPencil size={ICON_SIZE.sm} uniProps={foregroundMutedColorMapping} />",
        ),
        (
            r"<Trash2\s+size=\{theme\.iconSize\.sm\}\s+color=\{theme\.colors\.destructive\}\s*/>",
            "<ThemedTrash2 size={ICON_SIZE.sm} uniProps={destructiveColorMapping} />",
        ),
        (
            r"<Download\s+size=\{14\}\s+color=\{theme\.colors\.accent\}\s*/>",
            "<ThemedDownload size={14} uniProps={accentColorMapping} />",
        ),
        (
            r"<RefreshCw\s+size=\{14\}\s+color=\{theme\.colors\.accent\}\s*/>",
            "<ThemedRefreshCw size={14} uniProps={accentColorMapping} />",
        ),
        (
            r"<Brain\s+size=\{theme\.iconSize\.md\}\s+color=\{theme\.colors\.foregroundMuted\}\s*/>",
            "<ThemedBrain size={ICON_SIZE.md} uniProps={foregroundMutedColorMapping} />",
        ),
        (
            r"<FlaskConical\s+size=\{theme\.iconSize\.sm\}\s+color=\{theme\.colors\.foregroundMuted\}\s*/>",
            "<ThemedFlaskConical size={ICON_SIZE.sm} uniProps={foregroundMutedColorMapping} />",
        ),
    ]
    for pat, repl in reps:
        text = re.sub(pat, repl, text)

    text = text.replace(
        "placeholderTextColor={theme.colors.foregroundMuted}",
        "uniProps={placeholderTextColorMapping}",
    )
    text = re.sub(
        r"<TextInput([^>]*?)uniProps=\{placeholderTextColorMapping\}",
        r"<ThemedTextInput\1uniProps={placeholderTextColorMapping}",
        text,
    )
    text = text.replace(
        "placeholderColor={theme.colors.foregroundMuted}",
        "uniProps={placeholderColorMapping}",
    )
    text = text.replace("iconSize={theme.iconSize.sm}", "iconSize={ICON_SIZE.sm}")

    text = re.sub(r",\s*theme\.colors\.foregroundMuted,\s*theme\.iconSize\.sm", "", text)
    text = re.sub(r",\s*theme\.iconSize\.sm,\s*theme\.colors\.foregroundMuted", "", text)
    text = re.sub(r",\s*theme\.colors\.foregroundMuted", "", text)
    text = re.sub(r",\s*theme\.iconSize\.sm", "", text)
    text = re.sub(r"theme\.colors\.foregroundMuted,\s*", "", text)
    text = re.sub(r"theme\.iconSize\.sm,\s*", "", text)
    return text


def migrate_providers(text: str) -> str:
    text = text.replace(
        'function getDotColor(tone: StatusTone, theme: ReturnType<typeof useUnistyles>["theme"]): string {',
        "function getDotColor(tone: StatusTone, theme: Theme): string {",
    )
    text = re.sub(
        r"<ChevronRight\s+size=\{theme\.iconSize\.sm\}\s+color=\{hovered \? theme\.colors\.foreground : theme\.colors\.foregroundMuted\}\s*/>",
        "<ThemedChevronRight size={ICON_SIZE.sm} uniProps={hovered ? foregroundColorMapping : foregroundMutedColorMapping} />",
        text,
    )
    text = text.replace(
        """function ProviderSummary({
  hovered,
  label,
  providerStatus,
  providerError,
  ProviderIcon,
}: {
  hovered: boolean;
  label: string;
  providerStatus: ProviderStatus;
  providerError: string | null;
  ProviderIcon: ReturnType<typeof getProviderIcon>;
}) {
  const isCompact = useIsCompactFormFactor();
""",
        """function ProviderSummary({
  hovered,
  label,
  providerStatus,
  providerError,
  ProviderIcon,
}: {
  hovered: boolean;
  label: string;
  providerStatus: ProviderStatus;
  providerError: string | null;
  ProviderIcon: ReturnType<typeof getProviderIcon>;
}) {
  const isCompact = useIsCompactFormFactor();
  const ThemedProviderIcon = useMemo(() => withUnistyles(ProviderIcon), [ProviderIcon]);
""",
    )
    text = re.sub(
        r"<ProviderIcon\s+size=\{theme\.iconSize\.md\}\s+color=\{theme\.colors\.foreground\}\s*/>",
        "<ThemedProviderIcon size={ICON_SIZE.md} uniProps={foregroundColorMapping} />",
        text,
    )
    if "statusDotSuccess" not in text:
        text = text.replace(
            """function StatusIndicator({
  status,
  compact = false,
}: {
  status: ProviderStatus;
  compact?: boolean;
}) {
  const { t } = useTranslation();
  const rowStyle = useMemo(() => [styles.statusRow, compact && styles.compactStatusRow], [compact]);
  const dotStyle = useMemo(
    () => [styles.statusDot, { backgroundColor: getDotColor(status.tone, theme) }],
    [status.tone, theme],
  );

  return (
    <View style={rowStyle}>
      {status.tone === "loading" ? (
        <ThemedLoadingSpinner size={10} uniProps={foregroundMutedColorMapping} />
      ) : (
        <View style={dotStyle} />
      )}
""",
            """function statusDotStyleForTone(tone: StatusTone) {
  if (tone === "success") return styles.statusDotSuccess;
  if (tone === "warning") return styles.statusDotWarning;
  if (tone === "danger") return styles.statusDotDanger;
  return styles.statusDotMuted;
}

function StatusIndicator({
  status,
  compact = false,
}: {
  status: ProviderStatus;
  compact?: boolean;
}) {
  const { t } = useTranslation();
  const rowStyle = useMemo(() => [styles.statusRow, compact && styles.compactStatusRow], [compact]);
  const dotStyle = useMemo(
    () => [styles.statusDot, statusDotStyleForTone(status.tone)],
    [status.tone],
  );

  return (
    <View style={rowStyle}>
      {status.tone === "loading" ? (
        <ThemedLoadingSpinner size={10} uniProps={foregroundMutedColorMapping} />
      ) : (
        <View style={dotStyle} />
      )}
""",
        )
        text = re.sub(
            r"(statusDot:\s*\{[^}]*\},)",
            r"""\1
  statusDotSuccess: {
    backgroundColor: theme.colors.statusSuccess,
  },
  statusDotWarning: {
    backgroundColor: theme.colors.statusWarning,
  },
  statusDotDanger: {
    backgroundColor: theme.colors.statusDanger,
  },
  statusDotMuted: {
    backgroundColor: theme.colors.foregroundMuted,
  },""",
            text,
            count=1,
        )
    if text.count("getDotColor(") <= 1:
        text = re.sub(
            r"function getDotColor\(tone: StatusTone, theme: Theme\): string \{\n(?:.|\n)*?\n\}\n\n",
            "",
            text,
            count=1,
        )
    return text


def migrate_usage(text: str) -> str:
    text = text.replace(
        'function chartColor(index: number, theme: ReturnType<typeof useUnistyles>["theme"]): string {',
        "function chartColor(index: number, theme: Theme): string {",
    )
    if "UnistylesRuntime" not in text:
        text = text.replace(
            'import { StyleSheet, withUnistyles } from "react-native-unistyles";',
            'import { StyleSheet, UnistylesRuntime, withUnistyles } from "react-native-unistyles";',
        )
    if "function chartColorStyle" not in text:
        text = text.replace(
            "function chartColor(index: number, theme: Theme): string {\n",
            """function chartColorStyle(index: number) {
  if (index % 4 === 0) return styles.chartColor0;
  if (index % 4 === 1) return styles.chartColor1;
  if (index % 4 === 2) return styles.chartColor2;
  return styles.chartColor3;
}

function chartColor(index: number, theme: Theme): string {
""",
        )
    text = text.replace(
        """function TrendBarSegment({ segment }: { segment: UsageTrendSegment }) {
  const segmentStyle = useMemo(
    () => [
      styles.trendBarSegment,
      {
        flexGrow: Math.max(segment.totalTokens, 1),
        backgroundColor: chartColor(segment.colorIndex, theme),
      },
    ],
    [segment.colorIndex, segment.totalTokens, theme],
  );
  return <View style={segmentStyle} />;
}
""",
        """function TrendBarSegment({ segment }: { segment: UsageTrendSegment }) {
  const segmentStyle = useMemo(
    () => [
      styles.trendBarSegment,
      chartColorStyle(segment.colorIndex),
      {
        flexGrow: Math.max(segment.totalTokens, 1),
      },
    ],
    [segment.colorIndex, segment.totalTokens],
  );
  return <View style={segmentStyle} />;
}
""",
    )
    text = re.sub(
        r"chartColor\(([^,]+),\s*theme\)",
        r"chartColor(\1, UnistylesRuntime.getTheme() as Theme)",
        text,
    )
    text = text.replace(
        """  const swatchStyle = useMemo(
    () => [styles.modelSwatch, { backgroundColor: chartColor(segment.colorIndex, UnistylesRuntime.getTheme() as Theme) }],
    [segment.colorIndex, theme],
  );
""",
        """  const swatchStyle = useMemo(
    () => [styles.modelSwatch, chartColorStyle(segment.colorIndex)],
    [segment.colorIndex],
  );
""",
    )
    text = text.replace("[segment.colorIndex, theme]", "[segment.colorIndex]")
    if "chartColor0:" not in text:
        text = re.sub(
            r"(const styles = StyleSheet\.create\(\(theme\) => \(\{)",
            r"""\1
  chartColor0: {
    backgroundColor: theme.colors.palette.blue[600],
  },
  chartColor1: {
    backgroundColor: theme.colors.palette.green[600],
  },
  chartColor2: {
    backgroundColor: theme.colors.palette.amber[500],
  },
  chartColor3: {
    backgroundColor: theme.colors.palette.red[600],
  },""",
            text,
            count=1,
        )
    return text


def migrate_new_workspace(text: str) -> str:
    text = text.replace("          iconColor={theme.colors.foregroundMuted}\n", "")
    text = text.replace("        iconColor={theme.colors.foregroundMuted}\n", "")
    text = text.replace("theme.iconSize.sm", "ICON_SIZE.sm")
    text = text.replace("theme.iconSize.md", "ICON_SIZE.md")
    return text


def main() -> None:
    for path in files:
        original = path.read_text(encoding="utf-8")
        if "useUnistyles" not in original:
            print(f"skip clean {path}")
            continue
        text = ensure_imports(original)
        text = ensure_wrappers(text)
        text = migrate_jsx(text)
        if path.name == "providers-section.tsx":
            text = migrate_providers(text)
        if path.name == "usage-statistics-section.tsx":
            text = migrate_usage(text)
        if path.name == "new-workspace-screen.tsx":
            text = migrate_new_workspace(text)

        remaining_hooks = text.count("const { theme } = useUnistyles()")
        bare = re.findall(
            r"(color|size|placeholderTextColor|placeholderColor|iconColor|tintColor)=\{theme\.",
            text,
        )
        leftovers = [
            (i, line)
            for i, line in enumerate(text.splitlines(), 1)
            if "useUnistyles" in line
            or "const { theme }" in line
            or re.search(
                r"(color|size|placeholderTextColor|placeholderColor|iconColor)=\{theme\.",
                line,
            )
        ]
        path.write_text(text, encoding="utf-8")
        print(f"{path}: hooks={remaining_hooks} bare={len(bare)}")
        for i, line in leftovers[:30]:
            print(f"  {i}:{line.strip()[:140]}")


if __name__ == "__main__":
    main()
