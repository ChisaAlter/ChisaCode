import { View, Pressable, Text, type GestureResponderEvent } from "react-native";
import {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
  memo,
  type MutableRefObject,
  type ReactElement,
  type ReactNode,
} from "react";
import { StyleSheet, useUnistyles, withUnistyles } from "react-native-unistyles";
import { useIsCompactFormFactor } from "@/constants/layout";
import { useShallow } from "zustand/shallow";
import { Github, ListTodo, Paperclip, Target } from "lucide-react-native";
import Animated from "react-native-reanimated";
import { useTranslation } from "react-i18next";
import { FOOTER_HEIGHT, MAX_CONTENT_WIDTH } from "@/constants/layout";
import {
  AgentControls,
  DraftAgentControls,
  type DraftAgentControlsProps,
} from "@/composer/agent-controls";
import { useImageAttachmentPicker } from "@/hooks/use-image-attachment-picker";
import { useSessionStore } from "@/stores/session-store";
import { MessageInput, type MessageInputRef, type AttachmentMenuItem } from "./input/input";
import type { ImageAttachment, MessagePayload } from "./types";
import { ICON_SIZE, type Theme } from "@/styles/theme";
import type { DraftCommandConfig } from "@/hooks/use-agent-commands-query";
import { encodeImages } from "@/utils/encode-images";
import { focusWithRetries } from "@/utils/web-focus";
import {
  cancelComposerAgent,
  dispatchComposerAgentMessage,
  editQueuedComposerMessage,
  openComposerAttachment,
  pickAndPersistImages,
  queueComposerMessage,
  removeComposerAttachmentAtIndex,
  sendQueuedComposerMessageNow,
  type AgentStreamWriter,
  type QueueWriter,
  type QueuedComposerMessage,
} from "@/composer/actions";
import { useVoiceOptional } from "@/contexts/voice-context";
import { useToast } from "@/contexts/toast-context";
import { AutocompletePopover } from "@/components/ui/autocomplete-popover";
import { ErrorBoundary, SectionErrorFallback } from "@/components/error-boundary";
import { useAgentAutocomplete } from "@/hooks/use-agent-autocomplete";
import {
  useHostRuntimeAgentDirectoryStatus,
  useHostRuntimeClient,
  useHostRuntimeIsConnected,
} from "@/runtime/host-runtime";
import {
  deleteAttachments,
  persistAttachmentFromBlob,
  persistAttachmentFromFileUri,
} from "@/attachments/service";
import { resolveAgentControlsMode } from "@/composer/agent-controls/mode";
import { useKeyboardShiftStyle } from "@/hooks/use-keyboard-shift-style";
import { useKeyboardActionHandler } from "@/hooks/use-keyboard-action-handler";
import type { KeyboardActionDefinition } from "@/keyboard/keyboard-action-dispatcher";
import type { MessageInputKeyboardActionKind } from "@/keyboard/actions";
import { submitAgentInput } from "@/composer/submit";
import { useAppSettings } from "@/hooks/use-settings";
import { isWeb, isNative } from "@/constants/platform";
import type { AgentFeature } from "@chisacode/protocol/agent-types";
import type {
  AttachmentMetadata,
  ComposerAttachment,
  UserComposerAttachment,
  WorkspaceComposerAttachment,
} from "@/attachments/types";
import { composerWorkspaceAttachment } from "@/composer/attachments/workspace";
import { AttachmentLightbox } from "@/components/attachment-lightbox";
import { openExternalUrl } from "@/utils/open-external-url";
import { useIsDictationReady } from "@/hooks/use-is-dictation-ready";
import { resolveClientSlashCommand, type ClientSlashCommand } from "@/client-slash-commands";
import { buildToggleFeatureMenuItems } from "@/composer/agent-controls/utils";
import { renderAttachmentTray, renderQueueTrack } from "@/composer/attachment-queue-renderers";
import { useComposerGithubPicker } from "./github/picker";
import { useComposerRuntimeControls } from "./runtime-controls";
import { buildAgentStateSelector } from "@/composer/agent-state-selector";

type QueuedMessage = QueuedComposerMessage;

type AttachmentListUpdater =
  | UserComposerAttachment[]
  | ((prev: UserComposerAttachment[]) => UserComposerAttachment[]);

function resolveIsComposerLocked(
  submitBehavior: "clear" | "preserve-and-lock",
  isSubmitLoading: boolean,
): boolean {
  return submitBehavior === "preserve-and-lock" && isSubmitLoading;
}

function resolveKeyboardPriority(isMessageInputFocused: boolean): number {
  return isMessageInputFocused ? 200 : 100;
}

function resolveIsDesktopWebBreakpoint(isMobile: boolean): boolean {
  return isWeb && !isMobile;
}

function resolveMessagePlaceholder(input: {
  isDesktopWebBreakpoint: boolean;
  desktop: string;
  mobile: string;
}): string {
  return input.isDesktopWebBreakpoint ? input.desktop : input.mobile;
}

interface RenderLeftContentArgs {
  agentControls: DraftAgentControlsProps | undefined;
  agentId: string;
  serverId: string;
  focusInput: () => void;
}

function renderLeftContent(args: RenderLeftContentArgs): ReactElement {
  const { agentControls, agentId, serverId, focusInput } = args;
  if (resolveAgentControlsMode(agentControls) === "draft" && agentControls) {
    return <DraftAgentControls {...agentControls} />;
  }
  return <AgentControls agentId={agentId} serverId={serverId} onDropdownClose={focusInput} />;
}

function renderComposerFooter(footer: ReactNode, footerRight: ReactNode): ReactElement | null {
  if (!footer && !footerRight) return null;
  return (
    <View style={styles.footer}>
      <View style={styles.footerContent}>
        <View style={styles.footerLeft}>{footer}</View>
        <View style={styles.footerRight}>{footerRight}</View>
      </View>
    </View>
  );
}

function focusMessageInputWithPlatformStrategy(messageInputRef: {
  current: MessageInputRef | null;
}): void {
  if (isNative) {
    messageInputRef.current?.focus();
    return;
  }
  focusWithRetries({
    focus: () => messageInputRef.current?.focus(),
    isFocused: () => {
      const el = messageInputRef.current?.getNativeElement?.() ?? null;
      const active = typeof document !== "undefined" ? document.activeElement : null;
      return Boolean(el) && active === el;
    },
  });
}

interface DispatchComposerKeyboardActionArgs {
  action: KeyboardActionDefinition;
  isPaneFocused: boolean;
  messageInputRef: { current: MessageInputRef | null };
  isAgentRunning: boolean;
  isCancellingAgent: boolean;
  isConnected: boolean;
  handleCancelAgent: () => void;
  focusMessageInputForKeyboardAction: () => void;
  onCycleAgentMode: () => void;
}

function dispatchComposerKeyboardAction(args: DispatchComposerKeyboardActionArgs): boolean {
  const {
    action,
    isPaneFocused,
    messageInputRef,
    isAgentRunning,
    isCancellingAgent,
    isConnected,
    handleCancelAgent,
    focusMessageInputForKeyboardAction,
  } = args;
  if (!isPaneFocused) return false;

  if (action.id === "agent.interrupt") {
    if (messageInputRef.current?.runKeyboardAction("dictation-cancel")) return true;
    if (!isAgentRunning || isCancellingAgent || !isConnected) return false;
    handleCancelAgent();
    return true;
  }

  if (action.id === "message-input.focus") {
    focusMessageInputForKeyboardAction();
    return true;
  }

  if (action.id === "message-input.mode-cycle") {
    args.onCycleAgentMode();
    return true;
  }

  const passthroughAction = resolveMessageInputPassthroughAction(action.id);
  if (!passthroughAction) return false;
  const result = messageInputRef.current?.runKeyboardAction(passthroughAction);
  if (passthroughAction === "send" || passthroughAction === "dictation-confirm") {
    return result ?? false;
  }
  return true;
}

function resolveMessageInputPassthroughAction(
  actionId: string,
): MessageInputKeyboardActionKind | null {
  switch (actionId) {
    case "message-input.send":
      return "send";
    case "message-input.dictation-confirm":
      return "dictation-confirm";
    case "message-input.dictation-toggle":
      return "dictation-toggle";
    case "message-input.dictation-cancel":
      return "dictation-cancel";
    case "message-input.voice-toggle":
      return "voice-toggle";
    case "message-input.voice-mute-toggle":
      return "voice-mute-toggle";
    case "message-input.mode-cycle":
      return "mode-cycle";
    default:
      return null;
  }
}

function FeatureMenuSwitch({
  value,
  featureId,
  label,
  disabled,
  onToggleFeature,
}: {
  value: boolean;
  featureId: string;
  label: string;
  disabled: boolean;
  onToggleFeature: (featureId: string, value: boolean) => void;
}) {
  const { theme } = useUnistyles();
  const handlePress = useCallback(
    (event: GestureResponderEvent) => {
      event.stopPropagation();
      if (disabled) return;
      onToggleFeature(featureId, !value);
    },
    [disabled, featureId, onToggleFeature, value],
  );
  const trackStyle = useMemo(
    () => [
      styles.featureMenuSwitchTrack,
      {
        backgroundColor: value ? theme.colors.accent : theme.colors.surface3,
        opacity: disabled ? theme.opacity[50] : 1,
      },
    ],
    [disabled, theme.colors.accent, theme.colors.surface3, theme.opacity, value],
  );
  const thumbStyle = useMemo(
    () => [styles.featureMenuSwitchThumb, value ? styles.featureMenuSwitchThumbOn : null],
    [value],
  );
  const accessibilityState = useMemo(() => ({ checked: value, disabled }), [disabled, value]);

  return (
    <Pressable
      onPress={handlePress}
      disabled={disabled}
      hitSlop={8}
      accessibilityRole="switch"
      accessibilityState={accessibilityState}
      accessibilityLabel={label}
      testID={`composer-feature-switch-${featureId}`}
    >
      <View style={trackStyle}>
        <View style={thumbStyle} />
      </View>
    </Pressable>
  );
}

function useComposerFeatureMenu(input: {
  agentControls: DraftAgentControlsProps | undefined;
  agentFeatures: AgentFeature[];
  agentProvider: string | null;
  agentId: string;
  client: ReturnType<typeof useHostRuntimeClient>;
  focusInput: () => void;
  setUserInput: (text: string) => void;
  toastErrorRef: MutableRefObject<(message: string) => void>;
}) {
  const {
    agentControls,
    agentFeatures,
    agentProvider,
    agentId,
    client,
    focusInput,
    setUserInput,
    toastErrorRef,
  } = input;
  const activeProvider = agentControls?.selectedProvider ?? agentProvider;
  const featureMenuDescriptors = useMemo(
    () => buildToggleFeatureMenuItems(agentControls?.features ?? agentFeatures),
    [agentControls?.features, agentFeatures],
  );
  const handleSetFeatureFromMenu = useCallback(
    (featureId: string, nextValue: boolean) => {
      if (agentControls?.onSetFeature) {
        agentControls.onSetFeature(featureId, nextValue);
        return;
      }
      if (!client) {
        return;
      }
      void client.setAgentFeature(agentId, featureId, nextValue).catch((error) => {
        console.warn("[Composer] setAgentFeature failed", error);
        toastErrorRef.current(error instanceof Error ? error.message : String(error));
      });
    },
    [agentControls, agentId, client, toastErrorRef],
  );

  const handleOpenGoalCommand = useCallback(() => {
    setUserInput("/goal ");
    focusInput();
  }, [focusInput, setUserInput]);

  return {
    activeProvider,
    featureMenuDescriptors,
    handleOpenGoalCommand,
    handleSetFeatureFromMenu,
  };
}

interface ComposerProps {
  agentId: string;
  serverId: string;
  isPaneFocused: boolean;
  onSubmitMessage?: (payload: MessagePayload) => Promise<void>;
  onClientSlashCommand?: (command: ClientSlashCommand) => Promise<void>;
  /** When true, the submit button is enabled even without text or images (e.g. external attachment selected). */
  hasExternalContent?: boolean;
  /** When true, the composer can submit even with no text or attachments. */
  allowEmptySubmit?: boolean;
  /** Optional accessibility label for the primary submit button. */
  submitButtonAccessibilityLabel?: string;
  submitIcon?: "arrow" | "return";
  /** Externally controlled loading state. When true, disables the submit button. */
  isSubmitLoading?: boolean;
  submitBehavior?: "clear" | "preserve-and-lock";
  /** When true, blurs the input immediately when submitting. */
  blurOnSubmit?: boolean;
  value: string;
  onChangeText: (text: string) => void;
  attachments: UserComposerAttachment[];
  workspaceAttachments?: readonly WorkspaceComposerAttachment[];
  onOpenWorkspaceAttachment?: (attachment: WorkspaceComposerAttachment) => void;
  onChangeAttachments: (updater: AttachmentListUpdater) => void;
  cwd: string;
  clearDraft: (lifecycle: "sent" | "abandoned") => void;
  /** When true, auto-focuses the text input on web. */
  autoFocus?: boolean;
  /** Callback to expose the addImages function to parent components */
  onAddImages?: (addImages: (images: ImageAttachment[]) => void) => void;
  /** Callback to expose a focus function to parent components (desktop only). */
  onFocusInput?: (focus: () => void) => void;
  /** Optional draft context for listing commands before an agent exists. */
  commandDraftConfig?: DraftCommandConfig;
  /** Called when a message is about to be sent (any path: keyboard, dictation, queued). */
  onMessageSent?: () => void;
  onComposerHeightChange?: (height: number) => void;
  onAttentionInputFocus?: () => void;
  onAttentionPromptSend?: () => void;
  /** Controlled agent controls rendered in input area (draft flows). */
  agentControls?: DraftAgentControlsProps;
  /** Extra styles merged onto the message input wrapper (e.g. elevated background). */
  inputWrapperStyle?: import("react-native").ViewStyle;
  /** Rendered below the input, inside the keyboard-shifted container. */
  footer?: ReactNode;
  /** When true, a parent wrapper owns the keyboard shift, so the composer skips its own. */
  externalKeyboardShift?: boolean;
}

const EMPTY_ARRAY: readonly QueuedMessage[] = [];
const StableMessageInput = memo(MessageInput);

export function Composer({
  agentId,
  serverId,
  isPaneFocused,
  onSubmitMessage,
  onClientSlashCommand,
  hasExternalContent = false,
  allowEmptySubmit = false,
  submitButtonAccessibilityLabel,
  submitIcon = "arrow",
  isSubmitLoading = false,
  submitBehavior = "clear",
  blurOnSubmit = false,
  value,
  onChangeText,
  attachments,
  workspaceAttachments = [],
  onOpenWorkspaceAttachment,
  onChangeAttachments,
  cwd,
  clearDraft,
  autoFocus = false,
  onAddImages,
  onFocusInput,
  commandDraftConfig,
  onMessageSent,
  onComposerHeightChange,
  onAttentionInputFocus,
  onAttentionPromptSend,
  agentControls,
  inputWrapperStyle,
  footer,
  externalKeyboardShift,
}: ComposerProps) {
  const { t } = useTranslation();
  const client = useHostRuntimeClient(serverId);
  const isConnected = useHostRuntimeIsConnected(serverId);
  const agentDirectoryStatus = useHostRuntimeAgentDirectoryStatus(serverId);
  const toast = useToast();
  const toastErrorRef = useRef(toast.error);
  toastErrorRef.current = toast.error;
  const voice = useVoiceOptional();
  const isDictationReady = useIsDictationReady({
    serverId,
    isConnected,
    agentDirectoryStatus,
  });

  const { settings: appSettings } = useAppSettings();

  const agentState = useSessionStore(useShallow(buildAgentStateSelector(serverId, agentId)));

  const queuedMessagesRaw = useSessionStore((state) =>
    state.sessions[serverId]?.queuedMessages?.get(agentId),
  );
  const queuedMessages = queuedMessagesRaw ?? EMPTY_ARRAY;

  const setQueuedMessages = useSessionStore((state) => state.setQueuedMessages);
  const setAgentStreamTail = useSessionStore((state) => state.setAgentStreamTail);
  const setAgentStreamHead = useSessionStore((state) => state.setAgentStreamHead);

  const isMobile = useIsCompactFormFactor();
  const isDesktopWebBreakpoint = resolveIsDesktopWebBreakpoint(isMobile);
  const messagePlaceholder = resolveMessagePlaceholder({
    isDesktopWebBreakpoint,
    desktop: t("composer.desktopPlaceholder"),
    mobile: t("composer.mobilePlaceholder"),
  });
  const userInput = value;
  const setUserInput = onChangeText;
  const {
    selectedAttachments,
    buildOutgoingAttachments,
    removeAttachment,
    openAttachment,
    clearSentAttachments,
    completeSubmit,
    resetSuppression,
  } = composerWorkspaceAttachment.useBinding({
    normalAttachments: attachments,
    workspaceAttachments,
    onOpenWorkspaceAttachment,
  });
  const setSelectedAttachments = onChangeAttachments;
  const [cursorIndex, setCursorIndex] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isCancellingAgent, setIsCancellingAgent] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [isMessageInputFocused, setIsMessageInputFocused] = useState(false);
  const [lightboxMetadata, setLightboxMetadata] = useState<AttachmentMetadata | null>(null);
  const attachButtonRef = useRef<View | null>(null);
  const messageInputRef = useRef<MessageInputRef>(null);
  const isComposerLocked = resolveIsComposerLocked(submitBehavior, isSubmitLoading);
  const { githubPicker, markGithubAttachmentRemoved, openGithubPicker } = useComposerGithubPicker({
    client,
    serverId,
    cwd,
    text: userInput,
    attachments,
    selectedAttachments,
    setAttachments: setSelectedAttachments,
    isConnected,
    anchorRef: attachButtonRef,
  });
  const keyboardHandlerIdRef = useRef(
    `message-input:${serverId}:${agentId}:${Math.random().toString(36).slice(2)}`,
  );

  const runClientSlashCommand = useCallback(
    (command: ClientSlashCommand): boolean => {
      if (command.execution !== "immediate" || !onClientSlashCommand) {
        return false;
      }

      if (blurOnSubmit) {
        messageInputRef.current?.blur();
      }
      clearDraft("sent");
      setUserInput("");
      setSelectedAttachments([]);
      resetSuppression();
      setSendError(null);
      setIsProcessing(true);
      void onClientSlashCommand(command)
        .catch((error) => {
          console.error("[Composer] Failed to run client slash command:", error);
          setSendError(error instanceof Error ? error.message : String(error));
        })
        .finally(() => {
          setIsProcessing(false);
        });
      return true;
    },
    [
      blurOnSubmit,
      clearDraft,
      onClientSlashCommand,
      resetSuppression,
      setSelectedAttachments,
      setUserInput,
    ],
  );

  const autocomplete = useAgentAutocomplete({
    userInput,
    cursorIndex,
    setUserInput,
    serverId,
    agentId,
    draftConfig: commandDraftConfig,
    canExecuteClientSlashCommand: buildOutgoingAttachments(attachments).length === 0,
    onClientSlashCommand: runClientSlashCommand,
    onAutocompleteApplied: () => {
      messageInputRef.current?.focus();
    },
  });
  const autocompleteOnKeyPressRef = useRef(autocomplete.onKeyPress);
  autocompleteOnKeyPressRef.current = autocomplete.onKeyPress;

  // Clear send error when user edits the input
  useEffect(() => {
    if (sendError && userInput) {
      setSendError(null);
    }
  }, [userInput, sendError]);

  useEffect(() => {
    setCursorIndex((current) => Math.min(current, userInput.length));
  }, [userInput.length]);

  const { pickImages } = useImageAttachmentPicker();
  const agentIdRef = useRef(agentId);
  const sendAgentMessageRef = useRef<
    ((agentId: string, text: string, attachments: ComposerAttachment[]) => Promise<void>) | null
  >(null);
  const onSubmitMessageRef = useRef(onSubmitMessage);

  // Expose addImages function to parent for drag-and-drop support
  const addImages = useCallback(
    (images: ImageAttachment[]) => {
      setSelectedAttachments((prev) => [
        ...prev,
        ...images.map((metadata) => ({ kind: "image" as const, metadata })),
      ]);
    },
    [setSelectedAttachments],
  );

  useEffect(() => {
    onAddImages?.(addImages);
  }, [addImages, onAddImages]);

  const focusInput = useCallback(() => {
    if (isNative) return;
    focusWithRetries({
      focus: () => messageInputRef.current?.focus(),
      isFocused: () => {
        const el = messageInputRef.current?.getNativeElement?.() ?? null;
        return el != null && document.activeElement === el;
      },
    });
  }, []);

  useEffect(() => {
    onFocusInput?.(focusInput);
  }, [focusInput, onFocusInput]);

  const submitMessage = useCallback(
    async (text: string, submitAttachments: ComposerAttachment[]) => {
      onMessageSent?.();
      if (onSubmitMessageRef.current) {
        await onSubmitMessageRef.current({ text, attachments: submitAttachments, cwd });
        return;
      }
      if (!sendAgentMessageRef.current) {
        throw new Error("Host is not connected");
      }
      await sendAgentMessageRef.current(agentIdRef.current, text, submitAttachments);
    },
    [cwd, onMessageSent],
  );

  useEffect(() => {
    agentIdRef.current = agentId;
  }, [agentId]);

  useEffect(() => {
    sendAgentMessageRef.current = async (
      targetAgentId: string,
      text: string,
      sendAttachments: ComposerAttachment[],
    ) => {
      if (!client) {
        throw new Error("Host is not connected");
      }
      const stream: AgentStreamWriter = {
        getTail: (id) => useSessionStore.getState().sessions[serverId]?.agentStreamTail?.get(id),
        getHead: (id) => useSessionStore.getState().sessions[serverId]?.agentStreamHead?.get(id),
        setHead: (updater) => setAgentStreamHead(serverId, updater),
        setTail: (updater) => setAgentStreamTail(serverId, updater),
      };
      await dispatchComposerAgentMessage({
        client,
        agentId: targetAgentId,
        text,
        attachments: sendAttachments,
        encodeImages,
        stream,
      });
      onAttentionPromptSend?.();
    };
  }, [client, onAttentionPromptSend, serverId, setAgentStreamTail, setAgentStreamHead]);

  useEffect(() => {
    onSubmitMessageRef.current = onSubmitMessage;
  }, [onSubmitMessage]);

  const isAgentRunning = agentState.status === "running";
  const hasAgent = agentState.status !== null;

  const queueWriter = useMemo<QueueWriter>(
    () => ({
      read: (id) => useSessionStore.getState().sessions[serverId]?.queuedMessages?.get(id) ?? [],
      write: (updater) => setQueuedMessages(serverId, updater),
    }),
    [serverId, setQueuedMessages],
  );

  const queueMessage = useCallback(
    (queuedMessage: string, queuedAttachments: ComposerAttachment[]) => {
      const result = queueComposerMessage({
        agentId,
        text: queuedMessage,
        attachments: queuedAttachments,
        queue: queueWriter,
      });
      if (!result.queued) return;

      setUserInput("");
      setSelectedAttachments([]);
      resetSuppression();
      clearSentAttachments(queuedAttachments);
    },
    [
      agentId,
      clearSentAttachments,
      queueWriter,
      resetSuppression,
      setSelectedAttachments,
      setUserInput,
    ],
  );

  const sendMessageWithContent = useCallback(
    async (
      outgoingMessage: string,
      outgoingAttachments: ComposerAttachment[],
      forceSend?: boolean,
    ) => {
      const result = await submitAgentInput({
        message: outgoingMessage,
        attachments: outgoingAttachments,
        hasExternalContent,
        allowEmptySubmit,
        forceSend,
        submitBehavior,
        isAgentRunning,
        // Parent-managed submits are still valid submit paths even when the
        // transport is disconnected, because the parent decides the failure mode.
        canSubmit: Boolean(sendAgentMessageRef.current || onSubmitMessageRef.current),
        queueMessage: ({ message: queuedText, attachments: queuedAttachments }) => {
          queueMessage(queuedText, queuedAttachments);
        },
        submitMessage: async ({ message: submitText, attachments: submitAttachments }) => {
          await submitMessage(submitText, submitAttachments);
        },
        clearDraft,
        setUserInput,
        setAttachments: (nextAttachments) => {
          setSelectedAttachments(composerWorkspaceAttachment.userAttachmentsOnly(nextAttachments));
        },
        setSendError,
        setIsProcessing,
        onSubmitError: (error) => {
          console.error("[AgentInput] Failed to send message:", error);
        },
      });
      completeSubmit({
        result,
        outgoingAttachments,
      });
    },
    [
      allowEmptySubmit,
      clearDraft,
      completeSubmit,
      hasExternalContent,
      isAgentRunning,
      queueMessage,
      setSelectedAttachments,
      setUserInput,
      submitBehavior,
      submitMessage,
    ],
  );

  const handleSubmit = useCallback(
    (payload: MessagePayload) => {
      const outgoingAttachments = buildOutgoingAttachments(attachments);
      const clientSlashCommand = resolveClientSlashCommand({
        text: payload.text,
        hasAttachments: outgoingAttachments.length > 0,
      });
      if (clientSlashCommand && runClientSlashCommand(clientSlashCommand)) {
        return;
      }

      if (blurOnSubmit) {
        messageInputRef.current?.blur();
      }
      void sendMessageWithContent(payload.text, outgoingAttachments, payload.forceSend);
    },
    [
      attachments,
      blurOnSubmit,
      buildOutgoingAttachments,
      runClientSlashCommand,
      sendMessageWithContent,
    ],
  );

  const handlePickImage = useCallback(async () => {
    const newImages = await pickAndPersistImages({
      pickImages,
      persister: {
        persistFromBlob: ({ blob, mimeType, fileName }) =>
          persistAttachmentFromBlob({ blob, mimeType, fileName }),
        persistFromFileUri: ({ uri, mimeType, fileName }) =>
          persistAttachmentFromFileUri({ uri, mimeType, fileName }),
      },
    });
    if (newImages.length === 0) return;
    addImages(newImages);
  }, [addImages, pickImages]);

  const {
    activeProvider,
    featureMenuDescriptors,
    handleOpenGoalCommand,
    handleSetFeatureFromMenu,
  } = useComposerFeatureMenu({
    agentControls,
    agentFeatures: agentState.features,
    agentProvider: agentState.provider,
    agentId,
    client,
    focusInput,
    setUserInput,
    toastErrorRef,
  });

  const handleRemoveAttachment = useCallback(
    (index: number) => {
      markGithubAttachmentRemoved(selectedAttachments[index]);
      const didRemoveWorkspaceAttachment = removeAttachment({
        selectedAttachments,
        index,
      });
      if (didRemoveWorkspaceAttachment) {
        return;
      }
      setSelectedAttachments((prev) =>
        removeComposerAttachmentAtIndex({ attachments: prev, index, deleteAttachments }),
      );
    },
    [markGithubAttachmentRemoved, removeAttachment, selectedAttachments, setSelectedAttachments],
  );

  const handleOpenAttachment = useCallback(
    (attachment: ComposerAttachment) => {
      openComposerAttachment({
        attachment,
        setLightboxMetadata,
        openWorkspaceAttachment: openAttachment,
        openExternalUrl: (url) => {
          void openExternalUrl(url);
        },
      });
    },
    [openAttachment],
  );

  useEffect(() => {
    if (!isAgentRunning || !isConnected) {
      setIsCancellingAgent(false);
    }
  }, [isAgentRunning, isConnected]);

  const handleCancelAgent = useCallback(() => {
    const didCancel = cancelComposerAgent({
      client,
      agentId: agentIdRef.current,
      isAgentRunning,
      isCancellingAgent,
      isConnected,
    });
    if (!didCancel) return;
    setIsCancellingAgent(true);
    messageInputRef.current?.focus();
  }, [client, isAgentRunning, isCancellingAgent, isConnected]);

  const focusMessageInputForKeyboardAction = useCallback(() => {
    focusMessageInputWithPlatformStrategy(messageInputRef);
  }, []);

  const onCycleAgentMode = useCallback(() => {
    const agent = useSessionStore.getState().sessions[serverId]?.agents?.get(agentId);
    if (!agent) return;
    const modes = agent.availableModes;
    if (modes.length <= 1) return;
    const currentIndex = modes.findIndex((m) => m.id === agent.currentModeId);
    const nextIndex = currentIndex < 0 ? 0 : (currentIndex + 1) % modes.length;
    const next = modes[nextIndex];
    if (!next || !client) return;
    void client.setAgentMode(agentId, next.id).catch((error: Error) => {
      console.warn("[Composer] cycleAgentMode failed", error);
    });
  }, [agentId, client, serverId]);

  const handleKeyboardAction = useCallback(
    (action: KeyboardActionDefinition): boolean =>
      dispatchComposerKeyboardAction({
        action,
        isPaneFocused,
        messageInputRef,
        isAgentRunning,
        isCancellingAgent,
        isConnected,
        handleCancelAgent,
        focusMessageInputForKeyboardAction,
        onCycleAgentMode,
      }),
    [
      focusMessageInputForKeyboardAction,
      handleCancelAgent,
      isAgentRunning,
      isCancellingAgent,
      isConnected,
      isPaneFocused,
      onCycleAgentMode,
    ],
  );

  useKeyboardActionHandler({
    handlerId: keyboardHandlerIdRef.current,
    actions: [
      "agent.interrupt",
      "message-input.focus",
      "message-input.send",
      "message-input.dictation-toggle",
      "message-input.dictation-cancel",
      "message-input.dictation-confirm",
      "message-input.voice-toggle",
      "message-input.voice-mute-toggle",
      "message-input.mode-cycle",
    ],
    enabled: isPaneFocused,
    priority: resolveKeyboardPriority(isMessageInputFocused),
    isActive: () => isPaneFocused,
    handle: handleKeyboardAction,
  });

  const { style: keyboardAnimatedStyle } = useKeyboardShiftStyle({
    mode: "translate",
    enabled: !externalKeyboardShift,
  });

  const handleEditQueuedMessage = useCallback(
    (id: string) => {
      const result = editQueuedComposerMessage({
        agentId,
        messageId: id,
        queue: queueWriter,
      });
      if (!result) return;
      setUserInput(result.text);
      setSelectedAttachments(result.attachments);
    },
    [agentId, queueWriter, setSelectedAttachments, setUserInput],
  );

  const handleSendQueuedNow = useCallback(
    async (id: string) => {
      if (!sendAgentMessageRef.current && !onSubmitMessageRef.current) return;
      // Reuse the regular send path; server-side send atomically interrupts any active run.
      const result = await sendQueuedComposerMessageNow({
        agentId,
        messageId: id,
        queue: queueWriter,
        submitMessage: ({ text, attachments: queuedAttachments }) =>
          submitMessage(text, queuedAttachments),
      });
      if (result.status === "failed") {
        setSendError(result.errorMessage);
      }
    },
    [agentId, queueWriter, submitMessage],
  );

  const handleQueue = useCallback(
    (payload: MessagePayload) => {
      const outgoingAttachments = buildOutgoingAttachments(attachments);
      const clientSlashCommand = resolveClientSlashCommand({
        text: payload.text,
        hasAttachments: outgoingAttachments.length > 0,
      });
      if (clientSlashCommand && runClientSlashCommand(clientSlashCommand)) {
        return;
      }
      queueMessage(payload.text, outgoingAttachments);
    },
    [attachments, buildOutgoingAttachments, queueMessage, runClientSlashCommand],
  );

  const hasSendableContent = userInput.trim().length > 0 || selectedAttachments.length > 0;

  // Handle keyboard navigation for command autocomplete.
  const handleCommandKeyPress = useCallback(
    (event: { key: string; preventDefault: () => void }) =>
      autocompleteOnKeyPressRef.current(event),
    [],
  );

  const { beforeVoiceContent, footerRight, rightContent } = useComposerRuntimeControls({
    voice,
    serverId,
    agentId,
    isConnected,
    hasAgent,
    isAgentRunning,
    hasSendableContent,
    isProcessing,
    isCompact: isMobile,
    isCancellingAgent,
    handleCancelAgent,
    toastErrorRef,
    contextWindowMaxTokens: agentState.contextWindowMaxTokens,
    contextWindowUsedTokens: agentState.contextWindowUsedTokens,
    totalCostUsd: agentState.totalCostUsd,
  });
  const attachmentMenuItems = useMemo<AttachmentMenuItem[]>(() => {
    const items: AttachmentMenuItem[] = [
      {
        id: "image",
        label: t("composer.addPhotosAndFiles"),
        icon: <ThemedPaperclip size={ICON_SIZE.md} uniProps={iconForegroundMutedMapping} />,
        onSelect: () => {
          void handlePickImage();
        },
      },
      {
        id: "github",
        label: t("composer.addIssueOrPr"),
        icon: <ThemedGithub size={ICON_SIZE.md} uniProps={iconForegroundMutedMapping} />,
        onSelect: openGithubPicker,
      },
    ];

    for (const feature of featureMenuDescriptors) {
      items.push({
        id: `feature-${feature.id}`,
        label: feature.label,
        icon: <ThemedListTodo size={ICON_SIZE.md} uniProps={iconForegroundMutedMapping} />,
        trailing: (
          <FeatureMenuSwitch
            value={feature.selected}
            featureId={feature.id}
            label={feature.label}
            disabled={isComposerLocked}
            onToggleFeature={handleSetFeatureFromMenu}
          />
        ),
        disabled: isComposerLocked,
        closeOnSelect: false,
        onSelect: () => handleSetFeatureFromMenu(feature.id, !feature.selected),
      });
    }

    if (activeProvider === "codex") {
      items.push({
        id: "goal",
        label: t("composer.pursueGoal"),
        icon: <ThemedTarget size={ICON_SIZE.md} uniProps={iconForegroundMutedMapping} />,
        onSelect: handleOpenGoalCommand,
      });
    }

    return items;
  }, [
    activeProvider,
    featureMenuDescriptors,
    handleOpenGoalCommand,
    handlePickImage,
    handleSetFeatureFromMenu,
    isComposerLocked,
    openGithubPicker,
    t,
  ]);

  const leftContent = useMemo(
    () => renderLeftContent({ agentControls, agentId, serverId, focusInput }),
    [agentId, focusInput, serverId, agentControls],
  );

  const handleAttachButtonRef = useCallback((node: View | null) => {
    attachButtonRef.current = node;
  }, []);

  const handleSelectionChange = useCallback((selection: { start: number; end: number }) => {
    setCursorIndex(selection.start);
  }, []);

  const handleFocusChange = useCallback(
    (focused: boolean) => {
      setIsMessageInputFocused(focused);
      if (focused) {
        onAttentionInputFocus?.();
      }
    },
    [onAttentionInputFocus],
  );

  const handleLightboxClose = useCallback(() => {
    setLightboxMetadata(null);
  }, []);

  const composerContainerStyle = useMemo(
    () => [styles.container, keyboardAnimatedStyle],
    [keyboardAnimatedStyle],
  );
  const inputAreaContainerStyle = useMemo(
    () => [styles.inputAreaContainer, isComposerLocked && styles.inputAreaLocked],
    [isComposerLocked],
  );

  const attachmentTray = useMemo(
    () =>
      renderAttachmentTray({
        selectedAttachments,
        isComposerLocked,
        handleOpenAttachment,
        handleRemoveAttachment,
      }),
    [handleOpenAttachment, handleRemoveAttachment, isComposerLocked, selectedAttachments],
  );

  const queueList = useMemo(
    () => renderQueueTrack({ queuedMessages, handleEditQueuedMessage, handleSendQueuedNow }),
    [handleEditQueuedMessage, handleSendQueuedNow, queuedMessages],
  );

  const messageInputContainerRef = useRef<View>(null);

  const isSubmitBusy = isProcessing || isSubmitLoading;
  const messageInputAutoFocus = autoFocus && isDesktopWebBreakpoint;
  const submitLoadingPressHandler = isAgentRunning ? handleCancelAgent : undefined;
  const sendErrorNode = useMemo(
    () => (sendError ? <Text style={styles.sendErrorText}>{sendError}</Text> : null),
    [sendError],
  );
  const autocompleteVisible = autocomplete.isVisible && isPaneFocused;

  const composerFallback = useCallback(
    (error: unknown, resetError: () => void) => (
      <SectionErrorFallback
        error={error}
        onReset={resetError}
        sectionLabel={t("errors.sectionComposer")}
        compact
      />
    ),
    [t],
  );

  return (
    <ErrorBoundary fallback={composerFallback}>
      <Animated.View style={composerContainerStyle}>
        <AttachmentLightbox metadata={lightboxMetadata} onClose={handleLightboxClose} />
        {/* Input area */}
        <View style={inputAreaContainerStyle}>
          <View style={styles.inputAreaContent}>
            {queueList}
            {sendErrorNode}

            <View ref={messageInputContainerRef} style={styles.messageInputContainer}>
              <AutocompletePopover
                visible={autocompleteVisible}
                anchorRef={messageInputContainerRef}
                options={autocomplete.options}
                selectedIndex={autocomplete.selectedIndex}
                onSelect={autocomplete.onSelectOption}
                isLoading={autocomplete.isLoading}
                errorMessage={autocomplete.errorMessage}
                loadingText={autocomplete.loadingText}
                emptyText={autocomplete.emptyText}
              />

              {/* MessageInput handles everything: text, dictation, attachments, all buttons */}
              <StableMessageInput
                ref={messageInputRef}
                value={userInput}
                onChangeText={setUserInput}
                onSubmit={handleSubmit}
                hasExternalContent={hasExternalContent}
                allowEmptySubmit={allowEmptySubmit}
                submitButtonAccessibilityLabel={submitButtonAccessibilityLabel}
                submitIcon={submitIcon}
                isSubmitDisabled={isSubmitBusy}
                isSubmitLoading={isSubmitBusy}
                attachments={selectedAttachments}
                cwd={cwd}
                attachmentMenuItems={attachmentMenuItems}
                onAttachButtonRef={handleAttachButtonRef}
                onAddImages={addImages}
                client={client}
                isReadyForDictation={isDictationReady}
                placeholder={messagePlaceholder}
                autoFocus={messageInputAutoFocus}
                autoFocusKey={`${serverId}:${agentId}`}
                disabled={isSubmitLoading}
                isPaneFocused={isPaneFocused}
                leftContent={leftContent}
                beforeVoiceContent={beforeVoiceContent}
                rightContent={rightContent}
                voiceServerId={serverId}
                voiceAgentId={agentId}
                isAgentRunning={isAgentRunning}
                defaultSendBehavior={appSettings.sendBehavior}
                onQueue={handleQueue}
                onSubmitLoadingPress={submitLoadingPressHandler}
                onKeyPress={handleCommandKeyPress}
                onSelectionChange={handleSelectionChange}
                onFocusChange={handleFocusChange}
                onHeightChange={onComposerHeightChange}
                inputWrapperStyle={inputWrapperStyle}
                attachmentSlot={attachmentTray}
              />
              {githubPicker}
            </View>
          </View>
        </View>
        {renderComposerFooter(footer, footerRight)}
      </Animated.View>
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create((theme: Theme) => ({
  container: {
    flexDirection: "column",
    position: "relative",
  },
  borderSeparator: {
    height: theme.borderWidth[1],
    backgroundColor: theme.colors.border,
  },
  inputAreaContainer: {
    position: "relative",
    minHeight: FOOTER_HEIGHT,
    alignItems: "flex-start",
    width: "100%",
    overflow: "visible",
    paddingLeft: 14,
    paddingRight: 14,
    paddingBottom: 14,
  },
  inputAreaLocked: {
    opacity: 0.6,
  },
  inputAreaContent: {
    width: "100%",
    maxWidth: MAX_CONTENT_WIDTH,
    gap: theme.spacing[3],
  },
  footer: {
    width: "100%",
    paddingLeft: 14,
    paddingRight: 14,
    // Negative margin collapses the gap between input area and footer toolbar.
    // Mobile (xs): spacing[4] (16px) minus 3px leaves a 3px visual gap — the
    // smallest value below spacing[1] (4px) that still provides breathing room.
    // Desktop (md): uses -spacing[3] (-12px) for a tighter collapse.
    marginTop: {
      xs: -(theme.spacing[4] - 3),
      md: -theme.spacing[3],
    },
    alignItems: "flex-start",
  },
  footerContent: {
    width: "100%",
    maxWidth: MAX_CONTENT_WIDTH,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    // On mobile, the negative margins below cancel each glyph's internal padding
    // to reach the composer border; this inset adds a small visual gap from it.
    paddingLeft: {
      xs: 5,
      md: 10,
    },
    paddingRight: {
      xs: 5,
      md: 10,
    },
  },
  footerLeft: {
    flexShrink: 1,
    flexDirection: "row",
    alignItems: "center",
    // On mobile, cancel the leading glyph's internal padding (chip paddingHorizontal)
    // so its icon aligns to the composer border before the footer inset is applied.
    marginLeft: {
      xs: -theme.spacing[2],
      md: 0,
    },
  },
  footerRight: {
    flexShrink: 0,
    flexDirection: "row",
    alignItems: "center",
    // On mobile, cancel the trailing glyph's internal inset (28px box around a 16px
    // ring) so its right edge aligns to the composer border before the footer inset.
    marginRight: {
      xs: -6,
      md: 0,
    },
  },
  messageInputContainer: {
    position: "relative",
    width: "100%",
    gap: theme.spacing[3],
  },
  featureMenuSwitchTrack: {
    width: 34,
    height: 20,
    borderRadius: 10,
    padding: 2,
    justifyContent: "center",
  },
  featureMenuSwitchThumb: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: theme.colors.palette.white,
    shadowColor: "rgba(0, 0, 0, 0.25)",
    shadowOffset: { width: 0, height: 1 },
    shadowRadius: 2,
    shadowOpacity: 1,
    elevation: 2,
  },
  featureMenuSwitchThumbOn: {
    transform: [{ translateX: 14 }],
  },
  sendErrorText: {
    color: theme.colors.palette.red[500],
    fontSize: theme.fontSize.sm,
  },
})) as unknown as Record<string, object>;

const ThemedPaperclip = withUnistyles(Paperclip);
const ThemedGithub = withUnistyles(Github);
const ThemedListTodo = withUnistyles(ListTodo);
const ThemedTarget = withUnistyles(Target);

const iconForegroundMutedMapping = (theme: Theme) => ({ color: theme.colors.foregroundMuted });
