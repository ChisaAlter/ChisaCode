import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { router } from "expo-router";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Check, ChevronDown, MoreVertical, Pencil, Plus, X } from "lucide-react-native";
import { ProjectIconView } from "@/components/project-icon-view";
import { projectIconToDataUri, useProjectIconQuery } from "@/hooks/use-project-icon-query";
import type {
  PaseoConfigRaw,
  PaseoConfigRevision,
  ProjectConfigRpcError,
} from "@fleurdelys/protocol/messages";
import type { DaemonClient } from "@fleurdelys/client/internal/daemon-client";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Alert } from "@/components/ui/alert";
import { ExternalLink } from "@/components/ui/external-link";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { Switch } from "@/components/ui/switch";
import { AdaptiveModalSheet, type SheetHeader } from "@/components/adaptive-modal-sheet";
import { SettingsTextAreaCard } from "@/components/settings-textarea";
import { SettingsGroup } from "@/screens/settings/settings-group";
import { SettingsSection } from "@/screens/settings/settings-section";
import { settingsStyles } from "@/styles/settings";
import { useProjects } from "@/hooks/use-projects";
import { useHostRuntimeClient, useHostRuntimeSnapshot } from "@/runtime/host-runtime";
import { useToast } from "@/contexts/toast-context";
import { confirmDialog } from "@/utils/confirm-dialog";
import {
  applyDraftToConfig,
  configToDraft,
  METADATA_PROMPT_KEYS,
  type LifecycleOriginalKind,
  type MetadataPromptKey,
  type ProjectConfigDraft,
  type ProjectScriptDraft,
} from "@/utils/project-config-form";
import { buildProjectsSettingsRoute } from "@/utils/host-routes";
import type { ProjectHostEntry, ProjectSummary } from "@/utils/projects";

const SCRIPT_SERVICE_TYPE = "service";

const ICON_SIZE = 14;

interface MetadataPromptField {
  title: string;
  placeholder: string;
  sectionTestID: string;
  inputTestID: string;
}

const METADATA_PROMPT_FIELDS: Record<MetadataPromptKey, MetadataPromptField> = {
  agentTitle: {
    title: "智能体标题",
    placeholder: "使用祈使句，标题控制在 40 个字符以内",
    sectionTestID: "metadata-prompt-agent-title-section",
    inputTestID: "metadata-prompt-agent-title-input",
  },
  branchName: {
    title: "分支名称",
    placeholder: "分支使用 feat/ 或 fix/ 前缀，个人分支使用 mb/",
    sectionTestID: "metadata-prompt-branch-name-section",
    inputTestID: "metadata-prompt-branch-name-input",
  },
  commitMessage: {
    title: "Commit 消息",
    placeholder: "使用带 scope 的 Conventional Commits",
    sectionTestID: "metadata-prompt-commit-message-section",
    inputTestID: "metadata-prompt-commit-message-input",
  },
  pullRequest: {
    title: "Pull request",
    placeholder: "开头写一段摘要，并包含 Test plan 部分",
    sectionTestID: "metadata-prompt-pull-request-section",
    inputTestID: "metadata-prompt-pull-request-input",
  },
};

const WORKTREE_GROUP_INFO = "为此项目创建或清理 worktree 时运行的命令";
const WORKTREE_DOCS_URL = "https://paseo.sh/docs/worktrees";
const WORKTREE_DOCS_TOOLTIP = "查看文档，了解更多细节以及这些命令可用的环境变量";
const SCRIPTS_GROUP_INFO = "可从此项目中任意智能体启动的长期运行服务和一次性命令";
const METADATA_GROUP_INFO =
  "注入到芙露德莉斯元数据生成提示中的项目专属指令，可用于约束分支命名、commit 风格或 PR 格式等团队规范";

const NO_TARGET_MESSAGE = "任何已连接主机上都没有此项目的可编辑副本。";

const HOST_SWITCHER_LABEL = "切换主机";

type ReadProjectConfigData = Awaited<ReturnType<DaemonClient["readProjectConfig"]>>;

export interface ProjectSettingsScreenProps {
  projectKey: string;
}

export default function ProjectSettingsScreen({ projectKey }: ProjectSettingsScreenProps) {
  const { projects } = useProjects();
  const project = useMemo(
    () => projects.find((entry) => entry.projectKey === projectKey),
    [projects, projectKey],
  );
  const editableHosts = useMemo(() => filterEditableHosts(project), [project]);

  const [selectedServerId, setSelectedServerId] = useState<string>(
    () => editableHosts[0]?.serverId ?? "",
  );

  useEffect(() => {
    const stillValid = editableHosts.some((host) => host.serverId === selectedServerId);
    if (!stillValid) {
      setSelectedServerId(editableHosts[0]?.serverId ?? "");
    }
  }, [editableHosts, selectedServerId]);

  const selectedSnapshot = useHostRuntimeSnapshot(selectedServerId);
  const isHostGone =
    Boolean(selectedServerId) &&
    (selectedSnapshot?.connectionStatus === "offline" ||
      selectedSnapshot?.connectionStatus === "error");

  const selectedHost = editableHosts.find((host) => host.serverId === selectedServerId);
  const client = useHostRuntimeClient(selectedHost?.serverId ?? "");

  if (!project || editableHosts.length === 0 || !selectedHost || !client) {
    return <NoEditableTarget />;
  }

  return (
    <ProjectSettingsBody
      project={project}
      hosts={editableHosts}
      selectedHost={selectedHost}
      onSelectHost={setSelectedServerId}
      client={client}
      isHostGone={isHostGone}
    />
  );
}

function filterEditableHosts(project: ProjectSummary | undefined): ProjectHostEntry[] {
  if (!project) return [];
  return project.hosts.filter(
    (host) => host.isOnline && host.serverId.trim().length > 0 && host.repoRoot.trim().length > 0,
  );
}

function navigateBackToProjects() {
  router.navigate(buildProjectsSettingsRoute());
}

function NoEditableTarget() {
  return (
    <View style={styles.noTargetContainer}>
      <BackToProjectsButton />
      <Text style={styles.noTargetText}>{NO_TARGET_MESSAGE}</Text>
      <Button
        testID="project-settings-back-button"
        onPress={navigateBackToProjects}
        variant="secondary"
        size="md"
      >
        返回项目
      </Button>
    </View>
  );
}

function BackToProjectsButton() {
  return (
    <Button
      testID="project-settings-back-link"
      accessibilityLabel="返回项目"
      onPress={navigateBackToProjects}
      variant="ghost"
      size="sm"
      leftIcon={ArrowLeft}
      style={styles.backButton}
    >
      返回项目
    </Button>
  );
}

interface ProjectSettingsBodyProps {
  project: ProjectSummary;
  hosts: ProjectHostEntry[];
  selectedHost: ProjectHostEntry;
  onSelectHost: (serverId: string) => void;
  client: DaemonClient;
  isHostGone: boolean;
}

function ProjectSettingsBody({
  project,
  hosts,
  selectedHost,
  onSelectHost,
  client,
  isHostGone,
}: ProjectSettingsBodyProps) {
  const queryKey = useMemo(
    () => ["project-config", selectedHost.serverId, selectedHost.repoRoot] as const,
    [selectedHost.serverId, selectedHost.repoRoot],
  );

  const readQuery = useQuery({
    queryKey,
    queryFn: () => client.readProjectConfig(selectedHost.repoRoot),
    retry: false,
  });

  const data = readQuery.data;
  const loadedConfig: PaseoConfigRaw | null = data?.ok ? (data.config ?? {}) : null;
  const loadedRevision: PaseoConfigRevision | null = data?.ok ? data.revision : null;
  const readError: ProjectConfigRpcError | null = data && !data.ok ? data.error : null;

  const handleReload = useCallback(() => {
    void readQuery.refetch();
  }, [readQuery]);

  const hasMultipleHosts = hosts.length > 1;

  return (
    <View style={styles.body}>
      <BackToProjectsButton />

      <View style={styles.headerBlock}>
        <View style={styles.titleRow}>
          <ProjectTitleIcon
            host={selectedHost}
            projectName={project.projectName}
            projectKey={project.projectKey}
          />
          <ProjectNameEditor project={project} client={client} />
        </View>
        <HostContext hosts={hosts} selectedHost={selectedHost} onSelectHost={onSelectHost} />
      </View>

      {renderContent({
        readQuery,
        loadedConfig,
        loadedRevision,
        readError,
        selectedHost,
        queryKey,
        client,
        onReload: handleReload,
        hasMultipleHosts,
        isHostGone,
      })}
    </View>
  );
}

interface RenderContentInput {
  readQuery: ReturnType<typeof useQuery<ReadProjectConfigData>>;
  loadedConfig: PaseoConfigRaw | null;
  loadedRevision: PaseoConfigRevision | null;
  readError: ProjectConfigRpcError | null;
  selectedHost: ProjectHostEntry;
  queryKey: readonly [string, string, string];
  client: DaemonClient;
  onReload: () => void;
  hasMultipleHosts: boolean;
  isHostGone: boolean;
}

function renderContent({
  readQuery,
  loadedConfig,
  loadedRevision,
  readError,
  selectedHost,
  queryKey,
  client,
  onReload,
  hasMultipleHosts,
  isHostGone,
}: RenderContentInput) {
  if (readQuery.isLoading) {
    return (
      <View style={styles.centered}>
        <LoadingSpinner color={ResolveSpinnerColor()} />
      </View>
    );
  }

  if (readQuery.isError) {
    return (
      <ReadFailureCallout
        kind="transport"
        error={readQuery.error}
        onReload={onReload}
        hasMultipleHosts={hasMultipleHosts}
      />
    );
  }

  if (readError) {
    return (
      <ReadFailureCallout
        kind={readError.code}
        error={null}
        onReload={onReload}
        hasMultipleHosts={hasMultipleHosts}
      />
    );
  }

  if (isHostGone) {
    return <NoEditableTarget />;
  }

  if (!loadedConfig) {
    return (
      <View style={styles.centered}>
        <LoadingSpinner color={ResolveSpinnerColor()} />
      </View>
    );
  }

  const formKey = `${selectedHost.serverId}::${selectedHost.repoRoot}::${revisionToKey(loadedRevision)}`;
  return (
    <ProjectConfigForm
      key={formKey}
      baseConfig={loadedConfig}
      revision={loadedRevision}
      repoRoot={selectedHost.repoRoot}
      queryKey={queryKey}
      client={client}
      onReload={onReload}
    />
  );
}

function revisionToKey(revision: PaseoConfigRevision | null): string {
  if (!revision) return "none";
  return `${revision.mtimeMs}-${revision.size}`;
}

interface ReadFailureCalloutProps {
  kind: "transport" | ProjectConfigRpcError["code"];
  error: unknown;
  onReload: () => void;
  hasMultipleHosts: boolean;
}

function ReadFailureCallout({ kind, error, onReload, hasMultipleHosts }: ReadFailureCalloutProps) {
  const { testID, title, description } = resolveReadFailureCopy({ kind, error, hasMultipleHosts });
  return (
    <View style={styles.errorBlock}>
      <Alert testID={testID} variant="error" title={title} description={description}>
        <Button testID={`${testID}-action-0`} onPress={onReload} variant="outline" size="sm">
          重新加载
        </Button>
      </Alert>
    </View>
  );
}

function resolveReadFailureCopy(input: {
  kind: ReadFailureCalloutProps["kind"];
  error: unknown;
  hasMultipleHosts: boolean;
}): { testID: string; title: string; description: string } {
  if (input.kind === "invalid_project_config") {
    return {
      testID: "invalid-callout",
      title: "无法解析 paseo.json",
      description: "请修复磁盘上的文件，然后重新加载。",
    };
  }
  if (input.kind === "project_not_found") {
    return {
      testID: "project-not-found-callout",
      title: "此主机没有这个项目",
      description: input.hasMultipleHosts
        ? "请在上方切换到其他主机，或重新加载。"
        : "所选主机没有此项目的记录。",
    };
  }
  if (input.kind === "transport") {
    const detail = errorToDetail(input.error);
    return {
      testID: "read-transport-callout",
      title: "无法加载 paseo.json",
      description: detail ?? "主机没有响应。",
    };
  }
  return {
    testID: "read-failed-callout",
    title: "无法加载 paseo.json",
    description: "请重新加载后重试。",
  };
}

function errorToDetail(error: unknown): string | null {
  if (error instanceof Error && error.message.length > 0) return error.message;
  if (typeof error === "string" && error.length > 0) return error;
  return null;
}

interface ProjectConfigFormProps {
  baseConfig: PaseoConfigRaw;
  revision: PaseoConfigRevision | null;
  repoRoot: string;
  queryKey: readonly [string, string, string];
  client: DaemonClient;
  onReload: () => void;
}

function ProjectConfigForm({
  baseConfig,
  revision,
  repoRoot,
  queryKey,
  client,
  onReload,
}: ProjectConfigFormProps) {
  const queryClient = useQueryClient();
  const toast = useToast();

  const [draft, setDraft] = useState<ProjectConfigDraft>(() => configToDraft(baseConfig));
  const [writeError, setWriteError] = useState<ProjectConfigRpcError | null>(null);
  const [editingScriptId, setEditingScriptId] = useState<string | null>(null);

  const saveMutation = useMutation({
    mutationFn: async (input: {
      config: PaseoConfigRaw;
      expectedRevision: PaseoConfigRevision | null;
    }) => {
      return client.writeProjectConfig({
        repoRoot,
        config: input.config,
        expectedRevision: input.expectedRevision,
      });
    },
    onSuccess: (result) => {
      if (result.ok) {
        queryClient.setQueryData<ReadProjectConfigData>(queryKey, {
          ok: true,
          config: result.config,
          revision: result.revision,
          requestId: "local-cache",
          repoRoot,
        });
        setWriteError(null);
        queryClient.invalidateQueries({ queryKey: ["projects"] });
        toast.show("项目已保存", { variant: "success" });
      } else {
        setWriteError(result.error);
      }
    },
  });

  const handleSave = useCallback(() => {
    if (writeError?.code === "stale_project_config") return;
    const config = applyDraftToConfig({ draft, base: baseConfig });
    saveMutation.mutate({ config, expectedRevision: revision });
  }, [draft, baseConfig, revision, writeError, saveMutation]);

  const handleReload = useCallback(() => {
    setWriteError(null);
    onReload();
  }, [onReload]);

  const updateDraft = useCallback((updater: (draft: ProjectConfigDraft) => ProjectConfigDraft) => {
    setDraft((prev) => updater(prev));
  }, []);

  const handleSetupChange = useCallback(
    (text: string) => updateDraft((d) => ({ ...d, setupText: text })),
    [updateDraft],
  );
  const handleTeardownChange = useCallback(
    (text: string) => updateDraft((d) => ({ ...d, teardownText: text })),
    [updateDraft],
  );

  const handleMetadataPromptChange = useCallback(
    (key: MetadataPromptKey, text: string) =>
      updateDraft((d) => ({
        ...d,
        metadataPrompts: { ...d.metadataPrompts, [key]: text },
      })),
    [updateDraft],
  );

  const handleRemoveScript = useCallback(
    async (script: ProjectScriptDraft) => {
      const ok = await confirmDialog({
        title: "移除脚本？",
        message: `要移除 ${script.name || "此脚本"} 吗？`,
        confirmLabel: "移除",
        cancelLabel: "取消",
        destructive: true,
      });
      if (!ok) return;
      updateDraft((d) => ({
        ...d,
        scripts: d.scripts.filter((entry) => entry.id !== script.id),
      }));
    },
    [updateDraft],
  );

  const handleEditScript = useCallback((script: ProjectScriptDraft) => {
    setEditingScriptId(script.id);
  }, []);

  const handleAddScript = useCallback(() => {
    const id = `script-draft-new-${Date.now()}`;
    updateDraft((d) => ({
      ...d,
      scripts: [
        ...d.scripts,
        {
          id,
          name: "",
          commandText: "",
          commandOriginalKind: "missing" satisfies LifecycleOriginalKind,
          type: "",
          portText: "",
          rawEntry: {},
        },
      ],
    }));
    setEditingScriptId(id);
  }, [updateDraft]);

  const handleEditingDraftChange = useCallback(
    (next: ProjectScriptDraft) => {
      updateDraft((d) => ({
        ...d,
        scripts: d.scripts.map((entry) => (entry.id === next.id ? next : entry)),
      }));
    },
    [updateDraft],
  );

  const handleCancelEditing = useCallback(() => {
    if (!editingScriptId) {
      return;
    }
    updateDraft((d) => {
      const entry = d.scripts.find((row) => row.id === editingScriptId);
      if (!entry) return d;
      const isEmpty =
        entry.name.trim().length === 0 &&
        entry.commandText.trim().length === 0 &&
        entry.type.trim().length === 0 &&
        entry.portText.trim().length === 0;
      if (!isEmpty) return d;
      return { ...d, scripts: d.scripts.filter((row) => row.id !== editingScriptId) };
    });
    setEditingScriptId(null);
  }, [editingScriptId, updateDraft]);

  const handleSaveEditing = useCallback(() => {
    setEditingScriptId(null);
  }, []);

  const editingScript = draft.scripts.find((entry) => entry.id === editingScriptId);

  const hasInvalidScripts = useMemo(
    () => draft.scripts.some((script) => validateScript(script).hasErrors),
    [draft.scripts],
  );

  const scriptsTrailing = useMemo(
    () => (
      <Pressable
        onPress={handleAddScript}
        hitSlop={8}
        style={settingsStyles.sectionHeaderLink}
        accessibilityRole="button"
        accessibilityLabel="添加脚本"
        testID="scripts-add-button"
      >
        <Plus size={ICON_SIZE} color={styles.iconColor.color} />
      </Pressable>
    ),
    [handleAddScript],
  );

  const setupDocsLink = useMemo(
    () => (
      <ExternalLink
        href={WORKTREE_DOCS_URL}
        label="文档"
        tooltip={WORKTREE_DOCS_TOOLTIP}
        testID="worktree-setup-docs-link"
      />
    ),
    [],
  );
  const teardownDocsLink = useMemo(
    () => (
      <ExternalLink
        href={WORKTREE_DOCS_URL}
        label="文档"
        tooltip={WORKTREE_DOCS_TOOLTIP}
        testID="worktree-teardown-docs-link"
      />
    ),
    [],
  );

  const isStale = writeError?.code === "stale_project_config";
  const isWriteFailed = writeError?.code === "write_failed";
  const saveDisabled = saveMutation.isPending || isStale || hasInvalidScripts;

  return (
    <View>
      <SettingsGroup
        title="Worktree 生命周期钩子"
        info={WORKTREE_GROUP_INFO}
        testID="worktree-group"
      >
        <SettingsSection title="设置" testID="worktree-setup-section" trailing={setupDocsLink}>
          <SettingsTextAreaCard
            testID="worktree-setup-input"
            accessibilityLabel="Worktree 设置命令"
            value={draft.setupText}
            onChangeText={handleSetupChange}
            placeholder="npm install"
          />
        </SettingsSection>

        <SettingsSection
          title="清理"
          testID="worktree-teardown-section"
          trailing={teardownDocsLink}
          flush
        >
          <SettingsTextAreaCard
            testID="worktree-teardown-input"
            accessibilityLabel="Worktree 清理命令"
            value={draft.teardownText}
            onChangeText={handleTeardownChange}
            placeholder="docker compose down"
          />
        </SettingsSection>
      </SettingsGroup>

      <SettingsGroup
        title="脚本"
        info={SCRIPTS_GROUP_INFO}
        trailing={scriptsTrailing}
        testID="scripts-group"
      >
        <View style={settingsStyles.card} testID="scripts-list">
          {draft.scripts.length === 0 ? (
            <View style={settingsStyles.row}>
              <Text style={styles.emptyScripts}>还没有脚本。</Text>
            </View>
          ) : (
            draft.scripts.map((script, index) => (
              <ScriptRow
                key={script.id}
                script={script}
                isFirst={index === 0}
                onEdit={handleEditScript}
                onRemove={handleRemoveScript}
              />
            ))
          )}
        </View>
      </SettingsGroup>

      <SettingsGroup title="元数据生成" info={METADATA_GROUP_INFO} testID="metadata-group">
        {METADATA_PROMPT_KEYS.map((key, index) => (
          <MetadataPromptSection
            key={key}
            promptKey={key}
            value={draft.metadataPrompts[key]}
            onChange={handleMetadataPromptChange}
            flush={index === METADATA_PROMPT_KEYS.length - 1}
          />
        ))}
      </SettingsGroup>

      {isStale ? (
        <View style={styles.calloutWrap}>
          <Alert
            testID="stale-callout"
            variant="error"
            title="磁盘上的配置已更改"
            description="保存前请重新加载最新的 paseo.json。"
          >
            <Button
              testID="stale-callout-action-0"
              onPress={handleReload}
              variant="outline"
              size="sm"
            >
              重新加载
            </Button>
          </Alert>
        </View>
      ) : null}

      {isWriteFailed ? (
        <View style={styles.calloutWrap}>
          <Alert
            testID="write-failed-callout"
            variant="error"
            title="无法保存 paseo.json"
            description="请重试，或从磁盘重新加载最新版本。"
          >
            <Button
              testID="write-failed-callout-action-0"
              onPress={handleSave}
              variant="outline"
              size="sm"
            >
              重试
            </Button>
            <Button
              testID="write-failed-callout-action-1"
              onPress={handleReload}
              variant="outline"
              size="sm"
            >
              重新加载
            </Button>
          </Alert>
        </View>
      ) : null}

      <View style={styles.footer}>
        <Button
          testID="save-button"
          accessibilityLabel="保存项目配置"
          variant="default"
          size="md"
          disabled={saveDisabled}
          loading={saveMutation.isPending}
          onPress={handleSave}
        >
          {saveMutation.isPending ? "保存中..." : "保存"}
        </Button>
      </View>

      {editingScript ? (
        <ScriptEditModal
          script={editingScript}
          onChange={handleEditingDraftChange}
          onCancel={handleCancelEditing}
          onSave={handleSaveEditing}
        />
      ) : null}
    </View>
  );
}

function ResolveSpinnerColor(): string {
  return styles.spinnerColor.color;
}

interface ProjectNameEditorProps {
  project: ProjectSummary;
  client: DaemonClient;
}

function ProjectNameEditor({ project, client }: ProjectNameEditorProps) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [isEditing, setIsEditing] = useState(false);
  const [value, setValue] = useState(project.projectCustomName ?? "");

  const renameMutation = useMutation({
    mutationFn: (customName: string | null) => client.renameProject(project.projectKey, customName),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      setIsEditing(false);
      toast.show("项目已重命名", { variant: "success" });
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : "无法重命名项目";
      toast.show(message, { variant: "error" });
    },
  });

  const handleStartEdit = useCallback(() => {
    setValue(project.projectCustomName ?? "");
    setIsEditing(true);
  }, [project.projectCustomName]);

  const handleCancel = useCallback(() => {
    setIsEditing(false);
    setValue(project.projectCustomName ?? "");
  }, [project.projectCustomName]);

  const handleSave = useCallback(() => {
    const trimmed = value.trim();
    const next = trimmed.length === 0 ? null : trimmed;
    if (next === (project.projectCustomName ?? null)) {
      setIsEditing(false);
      return;
    }
    renameMutation.mutate(next);
  }, [value, project.projectCustomName, renameMutation]);

  const handleReset = useCallback(() => {
    renameMutation.mutate(null);
  }, [renameMutation]);

  if (!isEditing) {
    return (
      <View style={styles.nameEditorRow}>
        <Text style={styles.projectTitle} numberOfLines={1}>
          {project.projectName}
        </Text>
        <Pressable
          testID="project-name-edit-button"
          accessibilityLabel="重命名项目"
          onPress={handleStartEdit}
          hitSlop={8}
          style={styles.nameEditorIconButton}
        >
          <Pencil size={ICON_SIZE} color={styles.iconColor.color} />
        </Pressable>
        {project.projectCustomName ? (
          <Pressable
            testID="project-name-reset-button"
            accessibilityLabel="将项目名称重置为默认值"
            onPress={handleReset}
            disabled={renameMutation.isPending}
            hitSlop={8}
            style={styles.nameEditorResetButton}
          >
            <Text style={styles.nameEditorResetText}>重置</Text>
          </Pressable>
        ) : null}
      </View>
    );
  }

  return (
    <View style={styles.nameEditorRow}>
      <TextInput
        testID="project-name-input"
        accessibilityLabel="项目名称"
        value={value}
        onChangeText={setValue}
        placeholder={project.projectName}
        placeholderTextColor={styles.placeholderColor.color}
        autoFocus
        style={styles.nameEditorInput}
        editable={!renameMutation.isPending}
        onSubmitEditing={handleSave}
        returnKeyType="done"
      />
      <Pressable
        testID="project-name-save-button"
        accessibilityLabel="保存项目名称"
        onPress={handleSave}
        disabled={renameMutation.isPending}
        hitSlop={8}
        style={styles.nameEditorIconButton}
      >
        <Check size={ICON_SIZE} color={styles.iconColor.color} />
      </Pressable>
      <Pressable
        testID="project-name-cancel-button"
        accessibilityLabel="取消重命名"
        onPress={handleCancel}
        disabled={renameMutation.isPending}
        hitSlop={8}
        style={styles.nameEditorIconButton}
      >
        <X size={ICON_SIZE} color={styles.iconColor.color} />
      </Pressable>
    </View>
  );
}

function ProjectTitleIcon({
  host,
  projectName,
  projectKey,
}: {
  host: ProjectHostEntry;
  projectName: string;
  projectKey: string;
}) {
  const initial = projectName.trim().charAt(0).toUpperCase() || "?";
  const { icon } = useProjectIconQuery({ serverId: host.serverId, cwd: host.repoRoot });
  return (
    <ProjectIconView
      iconDataUri={projectIconToDataUri(icon)}
      initial={initial}
      projectKey={projectKey}
      imageStyle={styles.titleIcon}
      fallbackStyle={styles.titleIconFallback}
      textStyle={styles.titleIconFallbackText}
    />
  );
}

interface HostContextProps {
  hosts: ProjectHostEntry[];
  selectedHost: ProjectHostEntry;
  onSelectHost: (serverId: string) => void;
}

function HostContext({ hosts, selectedHost, onSelectHost }: HostContextProps) {
  if (hosts.length > 1) {
    return <HostPicker hosts={hosts} selectedHost={selectedHost} onSelectHost={onSelectHost} />;
  }
  return (
    <View testID="host-indicator" style={styles.hostIndicator}>
      <HostStatusDot serverId={selectedHost.serverId} />
      <Text style={styles.hostName} numberOfLines={1}>
        {selectedHost.serverName}
      </Text>
    </View>
  );
}

function HostStatusDot({ serverId }: { serverId: string }) {
  const { theme } = useUnistyles();
  const snapshot = useHostRuntimeSnapshot(serverId);
  const status = snapshot?.connectionStatus ?? "connecting";
  let color: string;
  if (status === "online") color = theme.colors.palette.green[400];
  else if (status === "connecting") color = theme.colors.palette.amber[500];
  else color = theme.colors.palette.red[500];
  const dotStyle = useMemo(() => [styles.hostStatusDot, { backgroundColor: color }], [color]);
  return <View style={dotStyle} />;
}

interface HostPickerProps {
  hosts: ProjectHostEntry[];
  selectedHost: ProjectHostEntry;
  onSelectHost: (serverId: string) => void;
}

function HostPicker({ hosts, selectedHost, onSelectHost }: HostPickerProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        accessibilityLabel={HOST_SWITCHER_LABEL}
        testID="host-picker"
        style={styles.hostIndicator}
      >
        <HostStatusDot serverId={selectedHost.serverId} />
        <Text style={styles.hostName} numberOfLines={1}>
          {selectedHost.serverName}
        </Text>
        <ChevronDown size={ICON_SIZE} color={styles.chevronColor.color} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" minWidth={240}>
        {hosts.map((host) => (
          <HostPickerItem
            key={host.serverId}
            host={host}
            isSelected={host.serverId === selectedHost.serverId}
            onSelectHost={onSelectHost}
          />
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

interface HostPickerItemProps {
  host: ProjectHostEntry;
  isSelected: boolean;
  onSelectHost: (serverId: string) => void;
}

function HostPickerItem({ host, isSelected, onSelectHost }: HostPickerItemProps) {
  const handleSelect = useCallback(
    () => onSelectHost(host.serverId),
    [host.serverId, onSelectHost],
  );
  return (
    <DropdownMenuItem
      testID={`host-picker-item-${host.serverId}`}
      selected={isSelected}
      onSelect={handleSelect}
    >
      {host.serverName}
    </DropdownMenuItem>
  );
}

interface MetadataPromptSectionProps {
  promptKey: MetadataPromptKey;
  value: string;
  onChange: (key: MetadataPromptKey, text: string) => void;
  flush?: boolean;
}

function MetadataPromptSection({ promptKey, value, onChange, flush }: MetadataPromptSectionProps) {
  const meta = METADATA_PROMPT_FIELDS[promptKey];
  const handleChange = useCallback(
    (text: string) => onChange(promptKey, text),
    [onChange, promptKey],
  );
  return (
    <SettingsSection title={meta.title} testID={meta.sectionTestID} flush={flush}>
      <SettingsTextAreaCard
        testID={meta.inputTestID}
        accessibilityLabel={meta.title}
        value={value}
        onChangeText={handleChange}
        placeholder={meta.placeholder}
      />
    </SettingsSection>
  );
}

interface ScriptRowProps {
  script: ProjectScriptDraft;
  isFirst: boolean;
  onEdit: (script: ProjectScriptDraft) => void;
  onRemove: (script: ProjectScriptDraft) => void;
}

function ScriptRow({ script, isFirst, onEdit, onRemove }: ScriptRowProps) {
  const handleEdit = useCallback(() => onEdit(script), [onEdit, script]);
  const handleRemove = useCallback(() => onRemove(script), [onRemove, script]);
  const rowStyle = isFirst ? styles.scriptRow : styles.scriptRowWithBorder;

  return (
    <View style={rowStyle} testID={`script-row-${script.id}`}>
      <Pressable style={styles.scriptRowMain} onPress={handleEdit}>
        <Text style={settingsStyles.rowTitle} numberOfLines={1}>
          {script.name || "未命名脚本"}
        </Text>
        <Text style={settingsStyles.rowHint} numberOfLines={1}>
          {scriptHint(script)}
        </Text>
      </Pressable>
      <DropdownMenu>
        <DropdownMenuTrigger
          accessibilityLabel="打开脚本菜单"
          testID={`script-row-menu-${script.id}`}
          style={styles.scriptKebab}
        >
          <MoreVertical size={ICON_SIZE} color={styles.chevronColor.color} />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" minWidth={160}>
          <DropdownMenuItem testID={`script-action-${script.id}-edit`} onSelect={handleEdit}>
            编辑
          </DropdownMenuItem>
          <DropdownMenuItem
            testID={`script-action-${script.id}-remove`}
            destructive
            onSelect={handleRemove}
          >
            移除
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </View>
  );
}

function scriptHint(script: ProjectScriptDraft): string {
  const pieces: string[] = [];
  if (script.type) pieces.push(script.type);
  if (script.portText) pieces.push(`port ${script.portText}`);
  if (script.commandText) pieces.push(script.commandText.split("\n")[0] ?? "");
  return pieces.join(" · ");
}

interface ScriptValidation {
  hasErrors: boolean;
  nameError: string | null;
  commandError: string | null;
}

function validateScript(script: ProjectScriptDraft): ScriptValidation {
  const nameError = script.name.trim().length === 0 ? "Name is required" : null;
  const commandError = script.commandText.trim().length === 0 ? "Command is required" : null;
  return {
    hasErrors: Boolean(nameError || commandError),
    nameError,
    commandError,
  };
}

interface ScriptEditModalProps {
  script: ProjectScriptDraft;
  onChange: (next: ProjectScriptDraft) => void;
  onCancel: () => void;
  onSave: () => void;
}

interface ScriptFieldsTouched {
  name: boolean;
  command: boolean;
}

const ALL_TOUCHED: ScriptFieldsTouched = { name: true, command: true };
const NONE_TOUCHED: ScriptFieldsTouched = { name: false, command: false };

function ScriptEditModal({ script, onChange, onCancel, onSave }: ScriptEditModalProps) {
  const [touched, setTouched] = useState<ScriptFieldsTouched>(NONE_TOUCHED);

  useEffect(() => {
    setTouched(NONE_TOUCHED);
  }, [script.id]);

  const markTouched = useCallback((field: keyof ScriptFieldsTouched) => {
    setTouched((prev) => (prev[field] ? prev : { ...prev, [field]: true }));
  }, []);

  const handleNameChange = useCallback(
    (text: string) => onChange({ ...script, name: text }),
    [onChange, script],
  );
  const handleCommandChange = useCallback(
    (text: string) => onChange({ ...script, commandText: text }),
    [onChange, script],
  );
  const handleServiceToggle = useCallback(
    (next: boolean) => onChange({ ...script, type: next ? SCRIPT_SERVICE_TYPE : "" }),
    [onChange, script],
  );

  const handleNameBlur = useCallback(() => markTouched("name"), [markTouched]);
  const handleCommandBlur = useCallback(() => markTouched("command"), [markTouched]);

  const validation = validateScript(script);

  const handleSavePress = useCallback(() => {
    if (validation.hasErrors) {
      setTouched(ALL_TOUCHED);
      return;
    }
    onSave();
  }, [validation.hasErrors, onSave]);

  const showNameError = touched.name && validation.nameError;
  const showCommandError = touched.command && validation.commandError;
  const isService = script.type === SCRIPT_SERVICE_TYPE;
  const sheetHeader = useMemo<SheetHeader>(
    () => ({ title: script.name ? `Edit ${script.name}` : "New script" }),
    [script.name],
  );

  return (
    <AdaptiveModalSheet
      visible
      header={sheetHeader}
      onClose={onCancel}
      testID="script-edit-modal"
      desktopMaxWidth={560}
    >
      <View style={styles.modalSection}>
        <Text style={styles.modalLabel}>名称</Text>
        <TextInput
          testID="script-edit-name"
          accessibilityLabel="脚本名称"
          value={script.name}
          onChangeText={handleNameChange}
          onBlur={handleNameBlur}
          placeholder="dev"
          placeholderTextColor={styles.placeholderColor.color}
          style={styles.modalInput}
        />
        {showNameError ? (
          <Text testID="script-edit-name-error" style={styles.fieldError}>
            {validation.nameError}
          </Text>
        ) : null}
      </View>
      <View style={styles.modalSection}>
        <Text style={styles.modalLabel}>命令</Text>
        <TextInput
          testID="script-edit-command"
          accessibilityLabel="脚本命令"
          multiline
          value={script.commandText}
          onChangeText={handleCommandChange}
          onBlur={handleCommandBlur}
          placeholder="npm run dev"
          placeholderTextColor={styles.placeholderColor.color}
          style={styles.modalMultilineInput}
        />
        {showCommandError ? (
          <Text testID="script-edit-command-error" style={styles.fieldError}>
            {validation.commandError}
          </Text>
        ) : null}
      </View>
      <View style={styles.modalSection}>
        <View style={styles.serviceToggleRow}>
          <View style={styles.serviceToggleText}>
            <Text style={styles.serviceToggleLabel}>作为服务运行</Text>
            <Text style={styles.modalHint}>
              芙露德莉斯会托管该进程，并通过 $PASEO_PORT 分配端口
            </Text>
          </View>
          <Switch
            value={isService}
            onValueChange={handleServiceToggle}
            accessibilityLabel="作为服务运行"
            testID="script-edit-service-toggle"
          />
        </View>
      </View>
      <View style={styles.modalFooter}>
        <Button onPress={onCancel} variant="ghost" size="md" testID="script-edit-cancel">
          取消
        </Button>
        <Button onPress={handleSavePress} variant="default" size="md" testID="script-edit-save">
          保存
        </Button>
      </View>
    </AdaptiveModalSheet>
  );
}

const styles = StyleSheet.create((theme) => ({
  noTargetContainer: {
    padding: theme.spacing[4],
    alignItems: "flex-start",
    gap: theme.spacing[3],
  },
  noTargetText: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
  },
  body: {
    padding: theme.spacing[4],
    gap: theme.spacing[2],
  },
  backButton: {
    alignSelf: "flex-start",
    paddingHorizontal: 0,
  },
  headerBlock: {
    marginTop: theme.spacing[2],
    marginBottom: theme.spacing[4],
    gap: theme.spacing[2],
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[3],
  },
  projectTitle: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.lg,
    fontWeight: theme.fontWeight.medium,
    flexShrink: 1,
  },
  nameEditorRow: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
    minWidth: 0,
  },
  nameEditorIconButton: {
    padding: theme.spacing[1],
  },
  nameEditorInput: {
    flex: 1,
    color: theme.colors.foreground,
    fontSize: theme.fontSize.lg,
    fontWeight: theme.fontWeight.medium,
    paddingVertical: theme.spacing[1],
    paddingHorizontal: theme.spacing[2],
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface2,
    minWidth: 0,
  },
  nameEditorResetButton: {
    paddingVertical: theme.spacing[1],
    paddingHorizontal: theme.spacing[2],
  },
  nameEditorResetText: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
  },
  titleIcon: {
    width: 28,
    height: 28,
    borderRadius: theme.borderRadius.md,
  },
  titleIconFallback: {
    width: 28,
    height: 28,
    borderRadius: theme.borderRadius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  titleIconFallbackText: {
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.medium,
  },
  iconColor: {
    color: theme.colors.foregroundMuted,
  },
  hostIndicator: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
    paddingHorizontal: theme.spacing[2],
    paddingVertical: theme.spacing[1],
    borderRadius: theme.borderRadius.lg,
    alignSelf: "flex-start",
    minWidth: 0,
  },
  hostStatusDot: {
    width: 8,
    height: 8,
    borderRadius: theme.borderRadius.full,
  },
  hostName: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
    flexShrink: 1,
    minWidth: 0,
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: theme.spacing[6],
  },
  errorBlock: {
    marginTop: theme.spacing[2],
  },
  emptyScripts: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
  },
  scriptRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: theme.spacing[4],
    paddingHorizontal: theme.spacing[4],
  },
  scriptRowWithBorder: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: theme.spacing[4],
    paddingHorizontal: theme.spacing[4],
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  scriptRowMain: {
    flex: 1,
    minWidth: 0,
    gap: theme.spacing[1],
  },
  scriptKebab: {
    padding: theme.spacing[1],
  },
  calloutWrap: {
    marginTop: theme.spacing[3],
  },
  footer: {
    marginTop: theme.spacing[4],
    flexDirection: "row",
    justifyContent: "flex-end",
  },
  modalSection: {
    gap: theme.spacing[2],
  },
  modalLabel: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
  },
  modalInput: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
    paddingVertical: theme.spacing[2],
    paddingHorizontal: theme.spacing[3],
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface2,
  },
  modalMultilineInput: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
    paddingVertical: theme.spacing[2],
    paddingHorizontal: theme.spacing[3],
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface2,
    minHeight: 100,
    textAlignVertical: "top",
  },
  modalFooter: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: theme.spacing[2],
    marginTop: theme.spacing[2],
  },
  fieldError: {
    color: theme.colors.palette.red[300],
    fontSize: theme.fontSize.xs,
  },
  serviceToggleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[3],
  },
  serviceToggleText: {
    flex: 1,
    minWidth: 0,
    gap: theme.spacing[1],
  },
  serviceToggleLabel: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.medium,
  },
  modalHint: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
  },
  placeholderColor: {
    color: theme.colors.foregroundMuted,
  },
  chevronColor: {
    color: theme.colors.foregroundMuted,
  },
  spinnerColor: {
    color: theme.colors.foregroundMuted,
  },
}));
