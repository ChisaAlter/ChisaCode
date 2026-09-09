import { useCallback, useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { useTranslation } from "react-i18next";
import type { ComposerTaskBadge } from "@/composer/tasks-badge";
import { Fonts } from "@/constants/theme";
import type { Theme } from "@/styles/theme";

interface TasksBadgeProps {
  badge: ComposerTaskBadge;
}

const SEGMENT_STYLES = {
  completed: { width: 10, height: 4, borderRadius: 2, backgroundColor: "#15803d" },
  in_progress: { width: 10, height: 4, borderRadius: 2, backgroundColor: "#2a6cf0" },
  pending: {
    width: 10,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(20, 23, 31, 0.15)",
  },
} as const;

function segmentStyle(status: string) {
  if (status === "completed") return SEGMENT_STYLES.completed;
  if (status === "in_progress") return SEGMENT_STYLES.in_progress;
  return SEGMENT_STYLES.pending;
}

function taskIcon(status: string): string {
  if (status === "completed") return "✓";
  if (status === "in_progress") return "◐";
  return "○";
}

/**
 * Task-progress badge for the composer (T3 port M6+18): segmented progress
 * bar (completed/in-progress/pending), count, and an expandable task list.
 * @param badge The derived task model from deriveComposerTasks
 */
export function TasksBadge({ badge }: TasksBadgeProps) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const toggle = useCallback(() => {
    setExpanded((value) => !value);
  }, []);
  const segments = useMemo(
    () =>
      badge.tasks.map((task, index) => ({
        status: task.status,
        key: `${index}:${task.status}`,
      })),
    [badge.tasks],
  );

  return (
    <View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t("composer.tasksToggle")}
        onPress={toggle}
        style={styles.row}
        testID="composer-tasks-badge"
      >
        <View style={styles.bar}>
          {segments.map((segment) => (
            <View key={segment.key} style={segmentStyle(segment.status)} />
          ))}
        </View>
        <Text style={styles.count}>
          {badge.completed}/{badge.total}
        </Text>
      </Pressable>
      {expanded ? (
        <View style={styles.listContainer}>
          {badge.tasks.map((task) => (
            <View key={task.id} style={styles.taskRow}>
              <Text style={styles.taskIcon}>{taskIcon(task.status)}</Text>
              <Text
                numberOfLines={1}
                style={task.status === "completed" ? styles.taskDone : styles.taskText}
              >
                {task.title}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create((theme: Theme) => ({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  bar: {
    flexDirection: "row",
    gap: 2,
    alignItems: "center",
  },
  count: {
    fontSize: 11.5,
    lineHeight: 15,
    fontFamily: Fonts.mono,
    color: theme.colors.foregroundMuted,
  },
  listContainer: {
    marginTop: 4,
    gap: 3,
  },
  taskRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  taskIcon: {
    fontSize: 11,
    width: 12,
    textAlign: "center",
    color: theme.colors.foregroundMuted,
  },
  taskText: {
    fontSize: 12,
    lineHeight: 16,
    color: theme.colors.foreground,
    flexShrink: 1,
  },
  taskDone: {
    color: theme.colors.foregroundMuted,
  },
}));
