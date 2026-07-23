import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
  type PressableStateCallbackType,
} from "react-native";
import { Check, Folder, FolderPlus, FolderX, Search } from "lucide-react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { useKeyboardShortcutsStore } from "@/stores/keyboard-shortcuts-store";
import { shortenPath } from "@/utils/shorten-path";
import { useRecommendedProjectPaths } from "@/stores/session-store-hooks";
import { useHostRuntimeClient, useHostRuntimeIsConnected } from "@/runtime/host-runtime";
import { useOpenProject } from "@/hooks/use-open-project";
import { buildWorkingDirectorySuggestions } from "@/utils/working-directory-suggestions";
import { isNative } from "@/constants/platform";
import { useActiveServerId } from "@/hooks/use-active-server-id";
import { pickDirectory } from "@/desktop/pick-directory";
import { useIsLocalDaemon } from "@/hooks/use-is-local-daemon";

interface PathRowProps {
  path: string;
  active: boolean;
  onSelect: (path: string) => void;
}

function PathRow({ path, active, onSelect }: PathRowProps) {
  const { theme } = useUnistyles();
  const handlePress = useCallback(() => {
    onSelect(path);
  }, [onSelect, path]);
  const pressableStyle = useCallback(
    ({ hovered = false, pressed }: PressableStateCallbackType & { hovered?: boolean }) => [
      styles.row,
      (Boolean(hovered) || pressed || active) && {
        backgroundColor: theme.colors.surfaceWorkspace,
      },
    ],
    [active, theme.colors.surfaceWorkspace],
  );
  const rowTextStyle = useMemo(
    () => [styles.rowText, { color: theme.colors.foreground }],
    [theme.colors.foreground],
  );
  return (
    <Pressable style={pressableStyle} onPress={handlePress}>
      <View style={styles.rowContent}>
        <View style={styles.iconSlot}>
          <Folder size={16} strokeWidth={2.2} color={theme.colors.foregroundMuted} />
        </View>
        <Text style={rowTextStyle} numberOfLines={1}>
          {shortenPath(path)}
        </Text>
        {active ? (
          <View style={styles.checkSlot}>
            <Check size={16} strokeWidth={2.1} color={theme.colors.foregroundMuted} />
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

function ProjectPickerActionRow({
  label,
  onPress,
  icon,
  testID,
}: {
  label: string;
  onPress: () => void;
  icon: "add" | "none";
  testID: string;
}) {
  const { theme } = useUnistyles();
  const rowStyle = useCallback(
    ({ hovered = false, pressed }: PressableStateCallbackType & { hovered?: boolean }) => [
      styles.row,
      (Boolean(hovered) || pressed) && {
        backgroundColor: theme.colors.surfaceWorkspace,
      },
    ],
    [theme.colors.surfaceWorkspace],
  );
  const rowTextStyle = useMemo(
    () => [styles.rowText, { color: theme.colors.foreground }],
    [theme.colors.foreground],
  );
  return (
    <Pressable testID={testID} accessibilityRole="button" onPress={onPress} style={rowStyle}>
      <View style={styles.rowContent}>
        <View style={styles.iconSlot}>
          {icon === "add" ? (
            <FolderPlus size={16} strokeWidth={2.1} color={theme.colors.foregroundMuted} />
          ) : (
            <FolderX size={16} strokeWidth={2.1} color={theme.colors.foregroundMuted} />
          )}
        </View>
        <Text style={rowTextStyle} numberOfLines={1}>
          {label}
        </Text>
      </View>
    </Pressable>
  );
}

export function ProjectPickerModal() {
  const { theme } = useUnistyles();
  const { t } = useTranslation();
  const serverId = useActiveServerId();

  const open = useKeyboardShortcutsStore((s) => s.projectPickerOpen);
  const setOpen = useKeyboardShortcutsStore((s) => s.setProjectPickerOpen);

  const client = useHostRuntimeClient(serverId ?? "");
  const isConnected = useHostRuntimeIsConnected(serverId ?? "");
  const isLocalDaemon = useIsLocalDaemon(serverId ?? "");
  const recommendedPaths = useRecommendedProjectPaths(serverId);

  const inputRef = useRef<TextInput>(null);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const openProject = useOpenProject(serverId);

  const directorySuggestionsQuery = useQuery({
    queryKey: ["project-picker-directory-suggestions", serverId, query],
    queryFn: async () => {
      if (!client) return [];
      const result = await client.getDirectorySuggestions({
        query,
        includeDirectories: true,
        includeFiles: false,
        limit: 30,
      });
      return (
        result.entries?.flatMap((entry) => (entry.kind === "directory" ? [entry.path] : [])) ?? []
      );
    },
    enabled: Boolean(client) && isConnected && open,
    staleTime: 15_000,
    retry: false,
  });

  const options = useMemo(() => {
    const suggestedPaths = buildWorkingDirectorySuggestions({
      recommendedPaths,
      serverPaths: directorySuggestionsQuery.data ?? [],
      query,
    });
    const trimmedQuery = query.trim();
    if (!trimmedQuery || suggestedPaths.includes(trimmedQuery)) {
      return suggestedPaths;
    }
    return [trimmedQuery, ...suggestedPaths];
  }, [query, directorySuggestionsQuery.data, recommendedPaths]);

  const handleClose = useCallback(() => {
    setOpen(false);
  }, [setOpen]);

  const handleSelectPath = useCallback(
    async (path: string) => {
      const trimmed = path.trim();
      if (!trimmed || !client || !serverId) return;

      setIsSubmitting(true);
      try {
        const didOpenProject = await openProject(trimmed);
        if (didOpenProject) {
          setOpen(false);
        }
      } finally {
        setIsSubmitting(false);
      }
    },
    [client, openProject, serverId, setOpen],
  );

  const handleSubmitCustom = useCallback(() => {
    const trimmed = query.trim();
    if (!trimmed) return;
    void handleSelectPath(trimmed);
  }, [handleSelectPath, query]);

  const handleAddProject = useCallback(() => {
    if (!isLocalDaemon) {
      return;
    }
    void (async () => {
      const path = await pickDirectory();
      const trimmed = path?.trim();
      if (!trimmed) return;
      await handleSelectPath(trimmed);
    })();
  }, [handleSelectPath, isLocalDaemon]);

  const handleChangeQuery = useCallback((text: string) => {
    setQuery(text);
    setActiveIndex(0);
  }, []);

  // Reset state when opening/closing
  useEffect(() => {
    if (open) {
      setQuery("");
      setActiveIndex(0);
      const id = setTimeout(() => inputRef.current?.focus(), 0);
      return () => clearTimeout(id);
    }
  }, [open]);

  // Clamp active index
  useEffect(() => {
    if (!open) return;
    if (activeIndex >= options.length) {
      setActiveIndex(options.length > 0 ? options.length - 1 : 0);
    }
  }, [activeIndex, options.length, open]);

  // Keyboard navigation
  useEffect(() => {
    if (!open || isNative) return;

    function handler(event: KeyboardEvent) {
      const key = event.key;
      if (key !== "ArrowDown" && key !== "ArrowUp" && key !== "Enter" && key !== "Escape") return;

      if (key === "Escape") {
        event.preventDefault();
        setOpen(false);
        return;
      }

      if (key === "Enter") {
        event.preventDefault();
        if (options.length > 0 && activeIndex < options.length) {
          void handleSelectPath(options[activeIndex]);
        } else if (query.trim()) {
          handleSubmitCustom();
        }
        return;
      }

      if (key === "ArrowDown" || key === "ArrowUp") {
        if (options.length === 0) return;
        event.preventDefault();
        setActiveIndex((current) => {
          const delta = key === "ArrowDown" ? 1 : -1;
          const next = current + delta;
          if (next < 0) return options.length - 1;
          if (next >= options.length) return 0;
          return next;
        });
      }
    }

    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, [activeIndex, handleSelectPath, handleSubmitCustom, open, options, query, setOpen]);

  const panelStyle = useMemo(
    () => [
      styles.panel,
      {
        backgroundColor: theme.colors.surface0,
      },
    ],
    [theme.colors.surface0],
  );
  const headerStyle = useMemo(
    // Soft floating panel header: quiet border-soft rule.
    () => [styles.header, { borderBottomColor: theme.colors.secondary }],
    [theme.colors.secondary],
  );
  const inputStyle = useMemo(
    () => [styles.input, { color: theme.colors.foreground }],
    [theme.colors.foreground],
  );
  const emptyTextStyle = useMemo(
    () => [styles.emptyText, { color: theme.colors.foregroundMuted }],
    [theme.colors.foregroundMuted],
  );

  if (!serverId) return null;

  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={handleClose}>
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={handleClose} />

        <View style={panelStyle}>
          <View style={headerStyle}>
            <View style={styles.searchRow}>
              <Search size={16} strokeWidth={2} color={theme.colors.foregroundMuted} />
              <TextInput
                ref={inputRef}
                value={query}
                onChangeText={handleChangeQuery}
                placeholder={t("workspace.projectPickerSearchPlaceholder")}
                placeholderTextColor={theme.colors.foregroundMuted}
                style={inputStyle}
                autoCapitalize="none"
                autoCorrect={false}
                autoFocus
                editable={!isSubmitting}
                returnKeyType="go"
                onSubmitEditing={handleSubmitCustom}
              />
            </View>
          </View>

          <ScrollView
            style={styles.results}
            contentContainerStyle={styles.resultsContent}
            keyboardShouldPersistTaps="always"
            showsVerticalScrollIndicator={false}
          >
            {isSubmitting ? (
              <Text style={emptyTextStyle}>{t("workspace.projectPickerOpening")}</Text>
            ) : null}
            {!isSubmitting && options.length === 0 && !query.trim() ? (
              <Text style={emptyTextStyle}>{t("workspace.projectPickerNoRecent")}</Text>
            ) : null}
            {!isSubmitting && !(options.length === 0 && !query.trim()) ? (
              <>
                {options.map((path, index) => (
                  <PathRow
                    key={path}
                    path={path}
                    active={index === activeIndex}
                    onSelect={handleSelectPath}
                  />
                ))}
              </>
            ) : null}
          </ScrollView>
          <View style={styles.actions}>
            {isLocalDaemon ? (
              <ProjectPickerActionRow
                testID="project-picker-add-project"
                label={t("workspace.projectPickerAddNew")}
                icon="add"
                onPress={handleAddProject}
              />
            ) : null}
            <ProjectPickerActionRow
              testID="project-picker-no-project"
              label={t("workspace.projectPickerNone")}
              icon="none"
              onPress={handleClose}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create((theme) => ({
  overlay: {
    flex: 1,
    justifyContent: "flex-start",
    alignItems: "center",
    paddingTop: theme.spacing[12],
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(20, 23, 31, 0.28)",
  },
  // Soft floating project picker: r18 + Soft ink elevation.
  panel: {
    width: 640,
    maxWidth: "92%",
    maxHeight: "80%",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: theme.colors.border,
    overflow: "hidden",
    backgroundColor: theme.colors.surface0,
    ...theme.shadow.md,
  },
  header: {
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[2],
    borderBottomWidth: 1,
    // Soft floating panel header: quiet border-soft rule.
    borderBottomColor: theme.colors.secondary,
  },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
  },
  input: {
    flex: 1,
    // Soft picker chrome: 12.5 meta.
    fontSize: 12.5,
    lineHeight: 18,
    paddingVertical: theme.spacing[1],
    outlineStyle: "none",
  } as object,
  results: {
    flexGrow: 0,
  },
  resultsContent: {
    paddingVertical: theme.spacing[2],
  },
  // Soft quiet list row.
  row: {
    paddingHorizontal: theme.spacing[4],
    paddingVertical: theme.spacing[2],
    borderRadius: 10,
    marginHorizontal: theme.spacing[2],
  },
  rowContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[3],
  },
  iconSlot: {
    width: 16,
    height: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  rowText: {
    fontSize: 14.5,
    lineHeight: 20,
    flexShrink: 1,
  },
  checkSlot: {
    marginLeft: "auto",
    width: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyText: {
    paddingHorizontal: theme.spacing[4],
    paddingVertical: theme.spacing[4],
    // Soft picker chrome: 12.5 meta.
    fontSize: 12.5,
    lineHeight: 18,
  },
  actions: {
    borderTopWidth: 1,
    // Soft quiet chrome rule (--border-soft).
    borderTopColor: theme.colors.secondary,
    paddingVertical: theme.spacing[2],
  },
}));
