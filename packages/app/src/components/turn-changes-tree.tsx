import { useCallback, useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { useTranslation } from "react-i18next";
import { buildTurnDiffTree, type DiffTreeNode } from "@/components/build-turn-diff-tree";
import { formatDiffCount } from "@/components/diff-stat";
import { Fonts } from "@/constants/theme";
import type { Theme } from "@/styles/theme";
import type { ChangedFileEntry } from "@/types/stream";

interface TurnChangesTreeProps {
  files: readonly ChangedFileEntry[];
  /** Opens the file preview tab for a clicked row. */
  onOpenFile: (path: string) => void;
}

function StatValue({ value, tone }: { value: number; tone: "add" | "del" }) {
  return (
    <Text style={tone === "add" ? sharedStatStyles.add : sharedStatStyles.del}>
      {tone === "add" ? "+" : "−"}
      {formatDiffCount(value)}
    </Text>
  );
}

function Stat({ additions, deletions }: { additions: number; deletions: number }) {
  if (additions === 0 && deletions === 0) {
    return <Text style={sharedStatStyles.zero}>+0 −0</Text>;
  }
  return (
    <View style={sharedStatStyles.row}>
      {additions > 0 ? <StatValue value={additions} tone="add" /> : null}
      {deletions > 0 ? <StatValue value={deletions} tone="del" /> : null}
    </View>
  );
}

const sharedStatStyles = StyleSheet.create((theme: Theme) => ({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    flexShrink: 0,
  },
  add: {
    fontSize: 12,
    fontFamily: Fonts.mono,
    color: theme.colors.diffAddition,
  },
  del: {
    fontSize: 12,
    fontFamily: Fonts.mono,
    color: theme.colors.diffDeletion,
  },
  zero: {
    fontSize: 12,
    fontFamily: Fonts.mono,
    color: theme.colors.foregroundMuted,
  },
}));

function FileRow({
  node,
  depth,
  onOpenFile,
}: {
  node: DiffTreeNode;
  depth: number;
  onOpenFile: (path: string) => void;
}) {
  const handleOpen = useCallback(() => {
    onOpenFile(node.path);
  }, [node.path, onOpenFile]);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={node.path}
      onPress={handleOpen}
      style={sharedRowStyles.row}
      testID="turn-changes-file-row"
    >
      <View style={depthIndentStyles[depth] ?? depthIndentStyles[0]} />
      <Text numberOfLines={1} style={sharedRowStyles.fileName}>
        {node.parentDir ? (
          <Text>
            <Text style={sharedRowStyles.disambiguation}>{node.parentDir}/</Text>
            {node.name}
          </Text>
        ) : (
          node.name
        )}
      </Text>
      <Stat additions={node.additions} deletions={node.deletions} />
    </Pressable>
  );
}

function DirRow({
  node,
  depth,
  onOpenFile,
}: {
  node: DiffTreeNode;
  depth: number;
  onOpenFile: (path: string) => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const toggle = useCallback(() => {
    setExpanded((value) => !value);
  }, []);
  return (
    <View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={node.path}
        onPress={toggle}
        style={sharedRowStyles.row}
      >
        <View style={depthIndentStyles[depth] ?? depthIndentStyles[0]} />
        <Text style={sharedRowStyles.chevron}>{expanded ? "▼" : "▶"}</Text>
        <Text numberOfLines={1} style={sharedRowStyles.dirName}>
          {node.path}/
        </Text>
        <Stat additions={node.additions} deletions={node.deletions} />
      </Pressable>
      {expanded ? (
        <View>
          {node.children.map((child) =>
            child.isDir ? (
              <DirRow key={child.path} node={child} depth={depth + 1} onOpenFile={onOpenFile} />
            ) : (
              <FileRow key={child.path} node={child} depth={depth + 1} onOpenFile={onOpenFile} />
            ),
          )}
        </View>
      ) : null}
    </View>
  );
}

// Indent widths for the first few nesting levels (cached stable objects;
// deeper nesting falls back to the last level).
const depthIndentStyles = [
  { width: 0, flexShrink: 0 },
  { width: 16, flexShrink: 0 },
  { width: 32, flexShrink: 0 },
  { width: 48, flexShrink: 0 },
  { width: 64, flexShrink: 0 },
] as const;

const sharedRowStyles = StyleSheet.create((theme: Theme) => ({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingLeft: 12,
    paddingRight: 12,
    paddingVertical: 6,
  },
  chevron: {
    color: theme.colors.foregroundMuted,
    fontSize: 10,
    width: 10,
    textAlign: "center",
  },
  dirName: {
    fontSize: 12.5,
    color: theme.colors.foregroundMuted,
    fontFamily: Fonts.mono,
    flex: 1,
  },
  fileDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: theme.colors.border,
    flexShrink: 0,
  },
  fileName: {
    fontSize: 12.5,
    color: theme.colors.foreground,
    fontFamily: Fonts.mono,
    flex: 1,
  },
  disambiguation: {
    color: theme.colors.foregroundMuted,
  },
}));

/**
 * Collapsible changed-files tree for a completed turn (T3 port M4): the
 * header row shows the aggregate diff stat; directories group files with
 * subtree-aggregated stats; clicking a file row opens its preview tab.
 * @param files The turn's changed files from its TurnChangesItem
 * @param onOpenFile Opens the workspace file preview for a path
 */
export function TurnChangesTree({ files, onOpenFile }: TurnChangesTreeProps) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const toggle = useCallback(() => {
    setExpanded((value) => !value);
  }, []);
  const tree = useMemo(() => buildTurnDiffTree(files), [files]);
  const totalAdditions = useMemo(
    () => files.reduce((sum, file) => sum + (file.additions ?? 0), 0),
    [files],
  );
  const totalDeletions = useMemo(
    () => files.reduce((sum, file) => sum + (file.deletions ?? 0), 0),
    [files],
  );

  return (
    <View style={styles.container} testID="turn-changes-tree">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t("stream.changedFilesToggle")}
        onPress={toggle}
        style={styles.header}
        testID="turn-changes-header"
      >
        <Text style={styles.chevron}>{expanded ? "▼" : "▶"}</Text>
        <Text style={styles.title}>{t("stream.changedFilesTitle")}</Text>
        <Stat additions={totalAdditions} deletions={totalDeletions} />
      </Pressable>
      {expanded ? (
        <View style={styles.body}>
          {tree.map((node) =>
            node.isDir ? (
              <DirRow key={node.path} node={node} depth={1} onOpenFile={onOpenFile} />
            ) : (
              <FileRow key={node.path} node={node} depth={1} onOpenFile={onOpenFile} />
            ),
          )}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create((theme: Theme) => ({
  container: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 10,
    backgroundColor: theme.colors.surface0,
    overflow: "hidden",
    marginTop: 8,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  body: {
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    paddingBottom: 4,
  },
  chevron: {
    color: theme.colors.foregroundMuted,
    fontSize: 10,
    width: 10,
    textAlign: "center",
  },
  title: {
    fontSize: 12.5,
    fontWeight: "600",
    color: theme.colors.foreground,
    flex: 1,
  },
}));
