import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Keyboard, StyleSheet as RNStyleSheet, View } from "react-native";
import ReanimatedAnimated from "react-native-reanimated";
import { StyleSheet } from "react-native-unistyles";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useKeyboardShiftStyle } from "@/hooks/use-keyboard-shift-style";
import invariant from "tiny-invariant";
import { Composer } from "@/composer";
import { DraftAgentModeControl } from "@/composer/agent-controls/mode-control";
import {
  SoftHomeEmpty,
  softHomeComposerInputAreaStyle,
  softHomeComposerInputWrapperStyle,
} from "@/composer/draft/soft-home-empty";
import {
  resolveAgentPresetApplication,
  type AgentPresetUnappliedField,
} from "@/agent-presets/apply-preset";
import { useAgentPresetsQuery } from "@/agent-presets/use-agent-presets-query";
import { ConversationAspectColumn } from "@/components/conversation-aspect-column";
import { FileDropZone } from "@/components/file-drop-zone";
import { AgentStreamView } from "@/agent-stream/view";
import { composerWorkspaceAttachment } from "@/composer/attachments/workspace";
import type { ImageAttachment } from "@/composer/types";
import { useAgentInputDraft } from "@/composer/draft/input-draft";
import type { CreateAgentInitialValues } from "@/hooks/use-agent-form-state";
import { useDraftAgentCreateFlow, type DraftCreateAttempt } from "@/composer/draft/create-flow";
import { useHostRuntimeClient, useHostRuntimeIsConnected } from "@/runtime/host-runtime";
import { buildWorkspaceDraftAgentConfig } from "@/screens/workspace/workspace-draft-agent-config";
import { buildDraftStoreKey } from "@/stores/draft-keys";
import { usePanelStore } from "@/stores/panel-store";
import { useCreateFlowStore } from "@/stores/create-flow-store";
import type { Agent } from "@/stores/session-store";
import { useWorkspace, useWorkspaceExecutionAuthority } from "@/stores/session-store-hooks";
import { useWorkspaceDraftSubmissionStore } from "@/stores/workspace-draft-submission-store";
import { encodeImages } from "@/utils/encode-images";
import type { WorkspaceFileOpenRequest } from "@/workspace/file-open";
import { shouldAutoFocusWorkspaceDraftComposer } from "@/screens/workspace/workspace-draft-pane-focus";
import {
  shouldWaitForDraftModelReadiness,
  validateDraftSubmission,
} from "@/composer/draft/workspace-tab-core";
import type { AgentCapabilityFlags, AgentProvider } from "@chisacode/protocol/agent-types";
import type { AgentPreset } from "@chisacode/protocol/agent-presets";
import type { AgentSnapshotPayload } from "@chisacode/protocol/messages";
import type { DaemonClient } from "@chisacode/client/internal/daemon-client";
import type { WorkspaceComposerAttachment } from "@/attachments/types";
import {
  useWorkspaceAttachments,
  useWorkspaceAttachmentScopeKey,
} from "@/attachments/workspace-attachments-store";
import type { UserMessageImageAttachment } from "@/types/stream";
import { useIsCompactFormFactor } from "@/constants/layout";
import type { WorkspaceDraftTabSetup } from "@/stores/workspace-tabs-store";

const EMPTY_PENDING_PERMISSIONS = new Map();
const EMPTY_ONLINE_SERVER_IDS: string[] = [];
const DRAFT_CAPABILITIES: AgentCapabilityFlags = {
  supportsStreaming: true,
  supportsSessionPersistence: false,
  supportsDynamicModes: false,
  supportsMcpServers: false,
  supportsReasoningStream: false,
  supportsToolInvocations: false,
};

interface AutoSubmitConfig {
  provider: string;
  runtimeProvider: string | null;
  modeId: string | null;
  model: string | null;
  thinkingOptionId: string | null;
  featureValues: Record<string, unknown>;
}

function resolveAutoSubmitConfig(
  pending: {
    provider: string;
    runtimeProvider?: string | null;
    modeId?: string | null;
    model?: string | null;
    thinkingOptionId?: string | null;
    featureValues?: Record<string, unknown>;
  } | null,
): AutoSubmitConfig | null {
  if (!pending) return null;
  return {
    provider: pending.provider,
    runtimeProvider: pending.runtimeProvider ?? null,
    modeId: pending.modeId ?? null,
    model: pending.model ?? null,
    thinkingOptionId: pending.thinkingOptionId ?? null,
    featureValues: pending.featureValues ?? {},
  };
}

function resolveDraftModeIdOverride(input: {
  autoSubmitConfig: AutoSubmitConfig | null;
  modeOptionsCount: number;
  selectedMode: string;
}): { modeId: string } | Record<string, never> {
  const { autoSubmitConfig, modeOptionsCount, selectedMode } = input;
  if (autoSubmitConfig?.modeId) {
    return { modeId: autoSubmitConfig.modeId };
  }
  if (modeOptionsCount > 0 && selectedMode !== "") {
    return { modeId: selectedMode };
  }
  return {};
}

function resolveDraftModeId(input: {
  autoSubmitConfig: AutoSubmitConfig | null;
  modeOptionsCount: number;
  selectedMode: string;
}): string | null {
  const { autoSubmitConfig, modeOptionsCount, selectedMode } = input;
  if (autoSubmitConfig?.modeId !== undefined) {
    return autoSubmitConfig.modeId;
  }
  if (modeOptionsCount > 0 && selectedMode !== "") {
    return selectedMode;
  }
  return null;
}

function buildSubmitDraftAgentConfig(input: {
  provider: string;
  runtimeProvider: string;
  workspaceDirectory: string;
  autoSubmitConfig: AutoSubmitConfig | null;
  composerState: {
    selectedMode: string;
    modeOptions: unknown[];
    effectiveModelId: string | null;
    effectiveThinkingOptionId: string | null;
    featureValues: Record<string, unknown> | undefined;
  };
  systemPrompt?: string;
}) {
  const { provider, runtimeProvider, workspaceDirectory, autoSubmitConfig, composerState } = input;
  const modeIdOverride = resolveDraftModeIdOverride({
    autoSubmitConfig,
    modeOptionsCount: composerState.modeOptions.length,
    selectedMode: composerState.selectedMode,
  });
  return buildWorkspaceDraftAgentConfig({
    provider,
    runtimeProvider,
    cwd: workspaceDirectory,
    ...modeIdOverride,
    model: autoSubmitConfig?.model ?? (composerState.effectiveModelId || undefined),
    thinkingOptionId:
      autoSubmitConfig?.thinkingOptionId ?? (composerState.effectiveThinkingOptionId || undefined),
    featureValues: autoSubmitConfig?.featureValues ?? composerState.featureValues,
    systemPrompt: input.systemPrompt,
  });
}

async function submitDraftCreateRequest(input: {
  attempt: { clientMessageId: string };
  text: string;
  images?: UserMessageImageAttachment[];
  attachments?: unknown;
  client: DaemonClient | null;
  workspaceDirectory: string | null;
  workspaceExecutionAuthority: { workspaceId: string } | null;
  autoSubmitConfig: AutoSubmitConfig | null;
  systemPrompt?: string;
  composerState: {
    selectedProvider: string | null;
    selectedRuntimeProvider: string | null;
    selectedMode: string;
    modeOptions: unknown[];
    effectiveModelId: string | null;
    effectiveThinkingOptionId: string | null;
    featureValues: Record<string, unknown> | undefined;
  };
}): Promise<{ agentId: string | null; result: AgentSnapshotPayload }> {
  const {
    attempt,
    text,
    images,
    attachments,
    client,
    workspaceDirectory,
    workspaceExecutionAuthority,
    autoSubmitConfig,
    systemPrompt,
    composerState,
  } = input;

  invariant(workspaceDirectory, "Workspace directory is required");
  invariant(workspaceExecutionAuthority, "Workspace authority is required");
  if (!client) {
    throw new Error("Host is not connected");
  }

  const provider = autoSubmitConfig?.provider ?? composerState.selectedProvider;
  if (!provider) {
    throw new Error("Select a model");
  }
  const runtimeProvider =
    autoSubmitConfig?.runtimeProvider ?? composerState.selectedRuntimeProvider ?? provider;
  const config = buildSubmitDraftAgentConfig({
    provider,
    runtimeProvider,
    workspaceDirectory,
    autoSubmitConfig,
    composerState,
    systemPrompt,
  });

  const imagesData = await encodeImages(images);
  const attachmentsArray = Array.isArray(attachments) ? attachments : undefined;
  const result = await client.createAgent({
    config,
    workspaceId: workspaceExecutionAuthority.workspaceId,
    ...(text ? { initialPrompt: text } : {}),
    clientMessageId: attempt.clientMessageId,
    ...(imagesData && imagesData.length > 0 ? { images: imagesData } : {}),
    ...(attachmentsArray && attachmentsArray.length > 0 ? { attachments: attachmentsArray } : {}),
  });

  return {
    agentId: result.id,
    result,
  };
}

function buildDraftAgentSnapshot(input: {
  attempt: { timestamp: Date };
  serverId: string;
  tabId: string;
  workspaceDirectory: string | null;
  autoSubmitConfig: AutoSubmitConfig | null;
  composerState: {
    effectiveModelId: string | null;
    effectiveThinkingOptionId: string | null;
    modeOptions: unknown[];
    selectedMode: string;
    selectedProvider: string | null;
    selectedRuntimeProvider: string | null;
    agentControls: { features?: Agent["features"] };
  };
}): Agent {
  const { attempt, serverId, tabId, workspaceDirectory, autoSubmitConfig, composerState } = input;
  invariant(workspaceDirectory, "Workspace directory is required");
  const now = attempt.timestamp;
  const model = autoSubmitConfig?.model ?? (composerState.effectiveModelId || null);
  const thinkingOptionId =
    autoSubmitConfig?.thinkingOptionId ?? (composerState.effectiveThinkingOptionId || null);
  const modeId = resolveDraftModeId({
    autoSubmitConfig,
    modeOptionsCount: composerState.modeOptions.length,
    selectedMode: composerState.selectedMode,
  });
  const provider = autoSubmitConfig?.provider ?? composerState.selectedProvider;
  if (!provider) {
    throw new Error("Select a model");
  }
  const runtimeProvider =
    autoSubmitConfig?.runtimeProvider ?? composerState.selectedRuntimeProvider ?? provider;
  return {
    serverId,
    id: tabId,
    provider,
    status: "running",
    createdAt: now,
    updatedAt: now,
    lastUserMessageAt: now,
    lastActivityAt: now,
    capabilities: DRAFT_CAPABILITIES,
    currentModeId: modeId,
    availableModes: [],
    pendingPermissions: [],
    persistence: null,
    runtimeInfo: { provider: runtimeProvider, sessionId: null, model, modeId },
    title: "智能体",
    cwd: workspaceDirectory,
    model,
    features: composerState.agentControls.features,
    thinkingOptionId,
    parentAgentId: null,
    labels: {},
  };
}

function buildDraftInitialValues(input: {
  workingDir: string | null;
  initialSetup: WorkspaceDraftTabSetup | null;
}): CreateAgentInitialValues | undefined {
  if (!input.workingDir) {
    return undefined;
  }
  if (!input.initialSetup) {
    return { workingDir: input.workingDir };
  }
  return {
    workingDir: input.workingDir,
    provider: input.initialSetup.provider,
    runtimeProvider: input.initialSetup.runtimeProvider,
    modeId: input.initialSetup.modeId,
    model: input.initialSetup.model,
    thinkingOptionId: input.initialSetup.thinkingOptionId,
  };
}

function resolveDraftWorkingDirectory(input: {
  workspaceDirectory: string | null;
  initialSetup: WorkspaceDraftTabSetup | null;
}): string | null {
  if (input.initialSetup) {
    return input.initialSetup.cwd;
  }
  return input.workspaceDirectory;
}

function resolveOnlineServerIds(input: { isConnected: boolean; serverId: string }): string[] {
  if (!input.isConnected) {
    return EMPTY_ONLINE_SERVER_IDS;
  }
  return [input.serverId];
}

interface WorkspaceDraftAgentTabProps {
  serverId: string;
  workspaceId: string;
  tabId: string;
  draftId: string;
  initialSetup?: WorkspaceDraftTabSetup;
  isPaneFocused: boolean;
  onCreated: (snapshot: AgentSnapshotPayload) => void;
  onOpenWorkspaceFile: (request: WorkspaceFileOpenRequest) => void;
  onOpenImportSheet?: () => void;
}

function resolveImportPillPress(
  onOpenImportSheet: (() => void) | undefined,
  isSubmitting: boolean,
): (() => void) | null {
  if (isSubmitting) {
    return null;
  }
  return onOpenImportSheet ?? null;
}

export function WorkspaceDraftAgentTab({
  serverId,
  workspaceId,
  tabId,
  draftId,
  initialSetup = undefined,
  isPaneFocused,
  onCreated,
  onOpenWorkspaceFile,
  onOpenImportSheet,
}: WorkspaceDraftAgentTabProps) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const client = useHostRuntimeClient(serverId);
  const isConnected = useHostRuntimeIsConnected(serverId);
  const workspaceAuthority = useWorkspaceExecutionAuthority(serverId, workspaceId);
  const workspaceExecutionAuthority = workspaceAuthority?.ok ? workspaceAuthority.authority : null;
  const workspaceDirectory = workspaceExecutionAuthority?.workspaceDirectory ?? null;
  const workspaceDescriptor = useWorkspace(serverId, workspaceId);
  const softHomeBranchContext = useMemo(() => {
    const currentBranch = workspaceDescriptor?.gitRuntime?.currentBranch ?? null;
    const isGit =
      workspaceDescriptor?.projectKind === "git" || Boolean(workspaceDescriptor?.gitRuntime);
    if (!isGit || !currentBranch || currentBranch === "HEAD") {
      return null;
    }
    return {
      currentBranchName: currentBranch,
      serverId,
      workspaceId,
      isGitCheckout: true as const,
    };
  }, [serverId, workspaceDescriptor, workspaceId]);
  const draftSetup = initialSetup ?? null;
  const draftWorkingDirectory = resolveDraftWorkingDirectory({
    workspaceDirectory,
    initialSetup: draftSetup,
  });
  const draftInitialValues = buildDraftInitialValues({
    workingDir: draftWorkingDirectory,
    initialSetup: draftSetup,
  });
  const onlineServerIds = resolveOnlineServerIds({ isConnected, serverId });
  const addImagesRef = useRef<((images: ImageAttachment[]) => void) | null>(null);
  const draftStoreKey = useMemo(
    () =>
      buildDraftStoreKey({
        serverId,
        agentId: tabId,
        draftId,
      }),
    [draftId, serverId, tabId],
  );
  const draftInput = useAgentInputDraft({
    draftKey: draftStoreKey,
    composer: {
      initialServerId: serverId,
      initialValues: draftInitialValues,
      initialFeatureValues: draftSetup?.featureValues,
      isVisible: true,
      onlineServerIds,
      lockedWorkingDir: draftWorkingDirectory ?? undefined,
    },
  });
  const presetQuery = useAgentPresetsQuery(serverId);
  const [selectedPresetId, setSelectedPresetId] = useState<string | null>(null);
  const [presetSystemPrompt, setPresetSystemPrompt] = useState<string | undefined>();
  const [presetUnappliedFields, setPresetUnappliedFields] = useState<AgentPresetUnappliedField[]>(
    [],
  );
  const composerState = draftInput.composerState;
  if (!composerState) {
    throw new Error("Workspace draft composer state is required");
  }
  const clearDraftInput = draftInput.clear;
  const setDraftText = draftInput.setText;
  const setDraftAttachments = draftInput.setAttachments;
  const handleSelectPreset = useCallback(
    (preset: AgentPreset | null) => {
      if (!preset) {
        setSelectedPresetId(null);
        setPresetSystemPrompt(undefined);
        setPresetUnappliedFields([]);
        return;
      }

      const targetProvider =
        preset.provider === "default" ? composerState.selectedProvider : preset.provider;
      const targetEntry = targetProvider
        ? composerState.allProviderEntries?.find((entry) => entry.provider === targetProvider)
        : undefined;
      const targetModels = targetProvider
        ? composerState.allProviderModels.get(targetProvider)
        : undefined;
      const application = resolveAgentPresetApplication({
        draft: {
          provider: composerState.selectedProvider,
          modeId: composerState.selectedMode,
          model: composerState.selectedModel,
          systemPrompt: presetSystemPrompt,
          samplePrompt: draftInput.text,
        },
        preset,
        availability: {
          providerIds: new Set(
            composerState.providerDefinitions.map((definition) => definition.id),
          ),
          ...(targetEntry
            ? { modeIds: new Set((targetEntry.modes ?? []).map((mode) => mode.id)) }
            : {}),
          ...(targetModels ? { modelIds: new Set(targetModels.map((model) => model.id)) } : {}),
        },
      });
      const nextProvider = application.draft.provider as AgentProvider | null | undefined;
      const nextModel = application.draft.model;

      if (nextProvider && nextProvider !== composerState.selectedProvider) {
        if (nextModel) {
          composerState.setProviderAndModelFromUser(nextProvider, nextModel);
        } else {
          composerState.setProviderFromUser(nextProvider);
        }
      } else if (nextModel && nextModel !== composerState.selectedModel) {
        composerState.setModelFromUser(nextModel);
      }
      if (application.draft.modeId && application.draft.modeId !== composerState.selectedMode) {
        composerState.setModeFromUser(application.draft.modeId);
      }
      if (application.draft.samplePrompt !== draftInput.text) {
        setDraftText(application.draft.samplePrompt ?? "");
      }

      setSelectedPresetId(preset.id);
      setPresetSystemPrompt(application.draft.systemPrompt);
      setPresetUnappliedFields(application.unappliedFields);
    },
    [composerState, draftInput.text, presetSystemPrompt, setDraftText],
  );
  const presetWarningText = useMemo(() => {
    if (presetUnappliedFields.length === 0) {
      return null;
    }
    const fields = presetUnappliedFields.map((field) => t(`workspace.presets.fields.${field}`));
    return t("workspace.presets.unapplied", { fields: fields.join(", ") });
  }, [presetUnappliedFields, t]);
  const pendingAutoSubmit = useWorkspaceDraftSubmissionStore((state) => {
    const pending = state.pendingByDraftId[draftId] ?? null;
    return pending?.serverId === serverId && pending.workspaceId === workspaceId ? pending : null;
  });
  const pendingCreateAttempt = useCreateFlowStore((state) => {
    const pending = state.pendingByDraftId[draftId] ?? null;
    return pending?.serverId === serverId && pending.lifecycle === "active" ? pending : null;
  });
  const consumePendingAutoSubmit = useWorkspaceDraftSubmissionStore(
    (state) => state.consumePending,
  );
  const autoSubmitConfig = resolveAutoSubmitConfig(pendingAutoSubmit);
  const initialCreateAttempt = useMemo<DraftCreateAttempt | null>(() => {
    if (!pendingAutoSubmit || !pendingCreateAttempt) {
      return null;
    }
    if (pendingAutoSubmit.clientMessageId !== pendingCreateAttempt.clientMessageId) {
      return null;
    }
    return {
      clientMessageId: pendingCreateAttempt.clientMessageId,
      text: pendingCreateAttempt.text,
      timestamp: new Date(pendingCreateAttempt.timestamp),
      ...(pendingCreateAttempt.images && pendingCreateAttempt.images.length > 0
        ? { images: pendingCreateAttempt.images }
        : {}),
      ...(pendingCreateAttempt.attachments && pendingCreateAttempt.attachments.length > 0
        ? { attachments: pendingCreateAttempt.attachments }
        : {}),
    };
  }, [pendingAutoSubmit, pendingCreateAttempt]);
  const allowsEmptyAutoSubmit = pendingAutoSubmit?.allowEmptyText === true;
  const isCompact = useIsCompactFormFactor();
  const workspaceAttachmentScopeKey = useWorkspaceAttachmentScopeKey({
    serverId,
    cwd: composerState.workingDir,
    workspaceId,
  });
  const workspaceAttachments = useWorkspaceAttachments(workspaceAttachmentScopeKey);
  const openFileExplorerForCheckout = usePanelStore((state) => state.openFileExplorerForCheckout);
  const setExplorerTabForCheckout = usePanelStore((state) => state.setExplorerTabForCheckout);
  const handleOpenWorkspaceAttachment = useCallback(
    (attachment: WorkspaceComposerAttachment) => {
      if (attachment.kind !== "review") {
        return;
      }
      const checkout = {
        serverId,
        cwd: attachment.attachment.cwd,
        isGit: true,
      };
      openFileExplorerForCheckout({
        checkout,
        isCompact,
      });
      setExplorerTabForCheckout({
        ...checkout,
        tab: "changes",
      });
    },
    [isCompact, openFileExplorerForCheckout, serverId, setExplorerTabForCheckout],
  );

  const {
    formErrorMessage,
    isSubmitting,
    optimisticStreamItems,
    draftAgent,
    handleCreateFromInput,
    continueCreateFromAttempt,
  } = useDraftAgentCreateFlow<Agent, AgentSnapshotPayload>({
    draftId,
    getPendingServerId: () => serverId,
    initialAttempt: initialCreateAttempt,
    allowEmptyText: allowsEmptyAutoSubmit,
    validateBeforeSubmit: ({ text }) =>
      validateDraftSubmission({
        text,
        allowsEmptyAutoSubmit,
        composerState,
        autoSubmitConfig,
        workspaceDirectory: draftWorkingDirectory,
        hasClient: Boolean(client),
        copy: {
          initialPromptRequired: t("providerSelection.initialPromptRequired"),
          noProviders: t("providerSelection.noProviders"),
          modelRequired: t("providerSelection.modelRequired"),
          modelLoading: t("providerSelection.modelLoading"),
          providerNoModels: t("providerSelection.providerNoModels"),
          workspaceDirectoryMissing: t("providerSelection.workspaceDirectoryMissing"),
          hostDisconnected: t("providerSelection.hostDisconnected"),
        },
      }),
    onBeforeSubmit: () => {
      void composerState.persistFormPreferences();
      if (isWeb) {
        (document.activeElement as HTMLElement | null)?.blur?.();
      }
      Keyboard.dismiss();
    },
    buildDraftAgent: (attempt) =>
      buildDraftAgentSnapshot({
        attempt,
        serverId,
        tabId,
        workspaceDirectory: draftWorkingDirectory,
        autoSubmitConfig,
        composerState,
      }),
    createRequest: async ({ attempt, text, images, attachments }) =>
      submitDraftCreateRequest({
        attempt,
        text,
        images,
        attachments,
        client,
        workspaceDirectory: draftWorkingDirectory,
        workspaceExecutionAuthority,
        autoSubmitConfig,
        systemPrompt: presetSystemPrompt,
        composerState,
      }),
    onCreateSuccess: ({ result }) => {
      clearDraftInput("sent");
      onCreated(result);
    },
  });

  const isReadyForPendingAutoSubmit = Boolean(
    pendingAutoSubmit &&
    draftInput.isHydrated &&
    draftWorkingDirectory &&
    client &&
    !shouldWaitForDraftModelReadiness({
      autoSubmitConfig,
      isModelLoading: composerState.isModelLoading,
    }),
  );
  const autoSubmitKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (!isReadyForPendingAutoSubmit) {
      return;
    }
    const submitKey = `${serverId}:${workspaceId}:${draftId}`;
    if (autoSubmitKeyRef.current === submitKey) {
      return;
    }
    const submission = consumePendingAutoSubmit({ serverId, workspaceId, draftId });
    if (!submission) {
      return;
    }
    autoSubmitKeyRef.current = submitKey;
    setDraftText("");
    setDraftAttachments([]);
    const preparedAttempt =
      initialCreateAttempt?.clientMessageId === submission.clientMessageId
        ? initialCreateAttempt
        : null;
    const createPromise = preparedAttempt
      ? continueCreateFromAttempt({
          attempt: preparedAttempt,
          cwd: submission.cwd,
        })
      : handleCreateFromInput({
          text: submission.text,
          attachments: submission.attachments,
          cwd: submission.cwd,
        });
    void createPromise.catch(() => {
      setDraftText(submission.text);
      setDraftAttachments(composerWorkspaceAttachment.userAttachmentsOnly(submission.attachments));
      autoSubmitKeyRef.current = null;
    });
  }, [
    continueCreateFromAttempt,
    consumePendingAutoSubmit,
    draftId,
    handleCreateFromInput,
    initialCreateAttempt,
    isReadyForPendingAutoSubmit,
    serverId,
    setDraftAttachments,
    setDraftText,
    workspaceId,
  ]);

  const handleFilesDropped = useCallback((files: ImageAttachment[]) => {
    addImagesRef.current?.(files);
  }, []);

  const handleAddImagesCallback = useCallback((addImages: (images: ImageAttachment[]) => void) => {
    addImagesRef.current = addImages;
  }, []);

  const focusInputRef = useRef<(() => void) | null>(null);

  const handleFocusInputCallback = useCallback((focus: () => void) => {
    focusInputRef.current = focus;
  }, []);

  const handleProviderSelectWithFocus = useCallback(
    (provider: Parameters<typeof composerState.setProviderFromUser>[0]) => {
      composerState.setProviderFromUser(provider);
      focusInputRef.current?.();
    },
    [composerState],
  );

  const handleModeSelectWithFocus = useCallback(
    (modeId: string) => {
      composerState.setModeFromUser(modeId);
      focusInputRef.current?.();
    },
    [composerState],
  );

  const handleModelSelectWithFocus = useCallback(
    (modelId: string, runtimeProvider?: string | null) => {
      composerState.setModelFromUser(modelId, runtimeProvider);
      focusInputRef.current?.();
    },
    [composerState],
  );

  const handleProviderAndModelSelectWithFocus = useCallback(
    (
      provider: Parameters<typeof composerState.setProviderAndModelFromUser>[0],
      modelId: string,
      runtimeProvider?: string | null,
    ) => {
      composerState.setProviderAndModelFromUser(provider, modelId, runtimeProvider);
      focusInputRef.current?.();
    },
    [composerState],
  );

  const handleThinkingOptionSelectWithFocus = useCallback(
    (optionId: string) => {
      composerState.setThinkingOptionFromUser(optionId);
      focusInputRef.current?.();
    },
    [composerState],
  );

  const handleSetFeatureWithFocus = useCallback(
    (featureId: string, value: unknown) => {
      composerState.agentControls.onSetFeature?.(featureId, value);
      focusInputRef.current?.();
    },
    [composerState],
  );

  const { style: composerKeyboardStyle } = useKeyboardShiftStyle({
    mode: "translate",
  });

  const inputAreaWrapperStyle = useMemo(
    () => [staticStyles.inputAreaWrapper, { paddingBottom: insets.bottom }, composerKeyboardStyle],
    [insets.bottom, composerKeyboardStyle],
  );

  const handleDropdownCloseFocus = useCallback(() => {
    focusInputRef.current?.();
  }, []);
  const importPillPress = resolveImportPillPress(onOpenImportSheet, isSubmitting);
  const composerAgentControls = useMemo(
    () => ({
      ...composerState.agentControls,
      onSelectProvider: handleProviderSelectWithFocus,
      onSelectMode: handleModeSelectWithFocus,
      onSelectModel: handleModelSelectWithFocus,
      onSelectProviderAndModel: handleProviderAndModelSelectWithFocus,
      onSelectThinkingOption: handleThinkingOptionSelectWithFocus,
      onSetFeature: handleSetFeatureWithFocus,
      onDropdownClose: handleDropdownCloseFocus,
      disabled: isSubmitting,
    }),
    [
      composerState.agentControls,
      handleProviderSelectWithFocus,
      handleModeSelectWithFocus,
      handleModelSelectWithFocus,
      handleProviderAndModelSelectWithFocus,
      handleThinkingOptionSelectWithFocus,
      handleSetFeatureWithFocus,
      handleDropdownCloseFocus,
      isSubmitting,
    ],
  );
  const composerFooter = useMemo(
    () =>
      isCompact ? (
        <DraftAgentModeControl placement="footer" {...composerAgentControls} />
      ) : undefined,
    [isCompact, composerAgentControls],
  );

  const isSoftHomeEmpty = !(isSubmitting && draftAgent);
  const handleFocusSoftHomeComposer = useCallback(() => {
    focusInputRef.current?.();
  }, []);

  if (isSoftHomeEmpty) {
    // Soft Home: full-width centered hero + floating pen-bar (default empty center).
    // 以默认 draft 空中栏为准，不是 new-workspace 旁路。
    return (
      <FileDropZone onFilesDropped={handleFilesDropped}>
        <SoftHomeEmpty
          presets={presetQuery.presets}
          selectedPresetId={selectedPresetId}
          isLoadingPresets={presetQuery.isLoading}
          isErrorPresets={presetQuery.isError}
          disabled={isSubmitting}
          warningText={presetWarningText}
          onSelectPreset={handleSelectPreset}
          draftText={draftInput.text}
          onChangeDraftText={setDraftText}
          onFocusComposer={handleFocusSoftHomeComposer}
          formErrorMessage={formErrorMessage}
          composerKeyboardStyle={composerKeyboardStyle}
          onImportPress={importPillPress}
          workspacePath={draftWorkingDirectory}
          branchContext={softHomeBranchContext}
        >
          <Composer
            agentId={tabId}
            serverId={serverId}
            externalKeyboardShift
            isPaneFocused={isPaneFocused}
            onSubmitMessage={handleCreateFromInput}
            isSubmitLoading={isSubmitting}
            blurOnSubmit={true}
            value={draftInput.text}
            onChangeText={draftInput.setText}
            attachments={draftInput.attachments}
            workspaceAttachments={workspaceAttachments}
            onOpenWorkspaceAttachment={handleOpenWorkspaceAttachment}
            onChangeAttachments={draftInput.setAttachments}
            cwd={composerState.workingDir}
            clearDraft={draftInput.clear}
            autoFocus={shouldAutoFocusWorkspaceDraftComposer({ isPaneFocused, isSubmitting })}
            onAddImages={handleAddImagesCallback}
            onFocusInput={handleFocusInputCallback}
            commandDraftConfig={composerState.commandDraftConfig}
            agentControls={composerAgentControls}
            footer={composerFooter}
            placeholder={t("workspace.softHomeComposerPlaceholder")}
            inputWrapperStyle={styles.softHomeComposerInputWrapper}
            inputAreaStyle={softHomeComposerInputAreaStyle}
          />
        </SoftHomeEmpty>
      </FileDropZone>
    );
  }

  return (
    <FileDropZone onFilesDropped={handleFilesDropped}>
      <View style={styles.container}>
        <ConversationAspectColumn>
          <View style={styles.contentContainer}>
            <View style={styles.streamContainer}>
              <AgentStreamView
                agentId={tabId}
                serverId={serverId}
                agent={draftAgent}
                streamItems={optimisticStreamItems}
                pendingPermissions={EMPTY_PENDING_PERMISSIONS}
                onOpenWorkspaceFile={onOpenWorkspaceFile}
              />
            </View>
          </View>
          <ReanimatedAnimated.View style={inputAreaWrapperStyle}>
            <View style={styles.inputAreaWrapper}>
              <Composer
                agentId={tabId}
                serverId={serverId}
                externalKeyboardShift
                isPaneFocused={isPaneFocused}
                onSubmitMessage={handleCreateFromInput}
                isSubmitLoading={isSubmitting}
                blurOnSubmit={true}
                value={draftInput.text}
                onChangeText={draftInput.setText}
                attachments={draftInput.attachments}
                workspaceAttachments={workspaceAttachments}
                onOpenWorkspaceAttachment={handleOpenWorkspaceAttachment}
                onChangeAttachments={draftInput.setAttachments}
                cwd={composerState.workingDir}
                clearDraft={draftInput.clear}
                autoFocus={shouldAutoFocusWorkspaceDraftComposer({ isPaneFocused, isSubmitting })}
                onAddImages={handleAddImagesCallback}
                onFocusInput={handleFocusInputCallback}
                commandDraftConfig={composerState.commandDraftConfig}
                agentControls={composerAgentControls}
                footer={composerFooter}
                inputWrapperStyle={styles.composerInputWrapper}
              />
            </View>
          </ReanimatedAnimated.View>
        </ConversationAspectColumn>
      </View>
    </FileDropZone>
  );
}

const styles = StyleSheet.create((theme) => ({
  container: {
    flex: 1,
    width: "100%",
    minWidth: 0,
    overflow: "hidden",
    backgroundColor: theme.colors.surfaceWorkspace,
  },
  contentContainer: {
    flex: 1,
    width: "100%",
    minWidth: 0,
  },
  streamContainer: {
    flex: 1,
  },
  softHomeComposerInputWrapper: {
    borderWidth: theme.borderWidth[1],
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface0,
    ...softHomeComposerInputWrapperStyle,
  },
  inputAreaWrapper: {
    width: "100%",
    backgroundColor: theme.colors.surfaceWorkspace,
  },
  composerInputWrapper: {
    borderWidth: theme.borderWidth[1],
    borderColor: theme.colors.border,
    borderRadius: 18,
    backgroundColor: theme.colors.surface0,
  },
}));

const staticStyles = RNStyleSheet.create({
  inputAreaWrapper: {
    width: "100%",
  },
});
