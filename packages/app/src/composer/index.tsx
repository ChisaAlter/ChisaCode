import { View, Text } from "react-native";
import {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
  memo,
  type ReactElement,
  type ReactNode,
} from "react";
import { StyleSheet } from "react-native-unistyles";
import { useIsCompactFormFactor } from "@/constants/layout";
import { useShallow } from "zustand/shallow";
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
import { MessageInput, type MessageInputRef } from "./input/input";
import type { ImageAttachment, MessagePayload } from "./types";
import type { Theme } from "@/styles/theme";
import type { DraftCommandConfig } from "@/hooks/use-agent-commands-query";
import { encodeImages } from "@/utils/encode-images";
import { focusWithRetries } from "@/utils/web-focus";
import {
  cancelComposerAgent,
  dispatchComposerAgentMessage,
  openComposerAttachment,
  pickAndPersistImages,
  removeComposerAttachmentAtIndex,
  type AgentStreamWriter,
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
import { submitAgentInput } from "@/composer/submit";
import { useAppSettings } from "@/hooks/use-settings";
import { isWeb, isNative } from "@/constants/platform";
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
import { renderAttachmentTray, renderQueueTrack } from "@/composer/attachment-queue-renderers";
import { useComposerAttachmentMenu } from "./attachment-menu";
import { useComposerGithubPicker } from "./github/picker";
import { useComposerKeyboardController } from "./keyboard-controller";
import { useComposerQueueController } from "./queue-controller";
import { useComposerRuntimeControls } from "./runtime-controls";
import { buildAgentStateSelector } from "@/composer/agent-state-selector";

type AttachmentListUpdater =
  | UserComposerAttachment[]
  | ((prev: UserComposerAttachment[]) => UserComposerAttachment[]);

function resolveIsComposerLocked(
  submitBehavior: "clear" | "preserve-and-lock",
  isSubmitLoading: boolean,
): boolean {
  return submitBehavior === "preserve-and-lock" && isSubmitLoading;
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

  const canSubmitQueuedMessage = useCallback(
    () => Boolean(sendAgentMessageRef.current || onSubmitMessageRef.current),
    [],
  );
  const {
    queuedMessages,
    queueMessage,
    handleEditQueuedMessage,
    handleSendQueuedNow,
    handleQueue,
  } = useComposerQueueController({
    serverId,
    agentId,
    attachments,
    buildOutgoingAttachments,
    setUserInput,
    setSelectedAttachments,
    resetSuppression,
    clearSentAttachments,
    runClientSlashCommand,
    canSubmitQueuedMessage,
    submitMessage,
    setSendError,
  });
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

  const attachmentMenuItems = useComposerAttachmentMenu({
    agentControls,
    agentFeatures: agentState.features,
    agentProvider: agentState.provider,
    agentId,
    client,
    focusInput,
    setUserInput,
    toastErrorRef,
    isComposerLocked,
    onPickImage: handlePickImage,
    openGithubPicker,
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

  const { handleFocusChange } = useComposerKeyboardController({
    serverId,
    agentId,
    client,
    isPaneFocused,
    messageInputRef,
    isAgentRunning,
    isCancellingAgent,
    isConnected,
    handleCancelAgent,
    onAttentionInputFocus,
  });
  const { style: keyboardAnimatedStyle } = useKeyboardShiftStyle({
    mode: "translate",
    enabled: !externalKeyboardShift,
  });

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
  sendErrorText: {
    color: theme.colors.palette.red[500],
    fontSize: theme.fontSize.sm,
  },
})) as unknown as Record<string, object>;
