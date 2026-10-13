import React, {
  forwardRef,
  memo,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
  type ReactNode,
} from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet as RNStyleSheet,
  Platform,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { useTranslation } from "react-i18next";
import {
  WORKBENCH_ASSISTANT_MESSAGE_MAX_WIDTH,
  WORKBENCH_FRAME_HAIRLINE_OFFSET,
  useIsCompactFormFactor,
} from "@/constants/layout";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import { ChevronDown } from "lucide-react-native";
import { usePanelStore } from "@/stores/panel-store";
import {
  AssistantMessage,
  SpeakMessage,
  UserMessage,
  ActivityLog,
  ToolCall,
  TodoListCard,
  CompactionMarker,
  MessageOuterSpacingProvider,
  type InlinePathTarget,
} from "@/components/message";
import { ThoughtMessage } from "@/components/thought-message";
import type { StreamItem } from "@/types/stream";
import type { PendingPermission } from "@/types/shared";
import type { AgentScreenAgent } from "@/hooks/use-agent-screen-state-machine";
import { useSessionStore } from "@/stores/session-store";
import { useFileExplorerActions } from "@/hooks/use-file-explorer-actions";
import { useLoadOlderAgentHistory } from "@/hooks/use-load-older-agent-history";
import type { ToastApi } from "@/components/toast-host";
import type { DaemonClient } from "@chisacode/client/internal/daemon-client";
import { GenerativeUiRenderer } from "@/generative-ui/generative-ui-renderer";
import { ToolCallSheetProvider } from "@/components/tool-call-sheet";
import { type AgentStreamRenderModel, buildAgentStreamRenderModel } from "./model";
import { resolveStreamRenderStrategy } from "./strategy-resolver";
import {
  type StreamSegmentRenderers,
  type StreamViewportHandle,
  type TurnAnchorRequest,
} from "./strategy";
import { CompletedTurnFooterRow, TurnFooter, type TurnContentStrategy } from "./turn-footer";
import { layoutStream, type StreamLayoutItem } from "./layout";
import { useStableStreamLayout } from "./stable-layout";
import { TurnChangesTree } from "@/components/turn-changes-tree";
import {
  type BottomAnchorLocalRequest,
  type BottomAnchorRouteRequest,
} from "./bottom-anchor-controller";
import { deriveWorkLogCollapse } from "./turn-fold";
import {
  AssistantFileLinkResolverProvider,
  normalizeInlinePathTarget,
} from "@/assistant-file-links";
import {
  createWorkspaceFileTabTarget,
  normalizeWorkspaceFileLocation,
  type OpenFileDisposition,
  type WorkspaceFileOpenRequest,
} from "@/workspace/file-open";
import { resolveWorkspaceIdByExecutionDirectory } from "@/utils/workspace-execution";
import { navigateToPreparedWorkspaceTab } from "@/utils/workspace-navigation";
import { useStableEvent } from "@/hooks/use-stable-event";
import { isWeb } from "@/constants/platform";
import { useAppSettings } from "@/hooks/use-settings";
import { resolveThemeWorkbenchSurfaceRoles } from "@/styles/workbench-surface-roles";

function renderLiveAuxiliaryNode(input: {
  pendingPermissions: ReactNode;
  turnFooter: ReactNode;
}): ReactNode {
  if (!input.pendingPermissions && !input.turnFooter) {
    return null;
  }
  return (
    <>
      {input.turnFooter}
      {input.pendingPermissions ? (
        <View style={stylesheet.contentWrapper}>
          <View style={stylesheet.listHeaderContent}>{input.pendingPermissions}</View>
        </View>
      ) : null}
    </>
  );
}

/**
 * M12: in-stream permission cards were removed. Approvals attach via the
 * composer banner (`buildPendingApprovalBanners`) so they never dual-render.
 */
function renderPendingPermissionsNode(_input: {
  pendingPermissions: PendingPermission[];
  client: DaemonClient | null;
  toast?: ToastApi | null;
}): ReactNode {
  return null;
}

function renderStreamItemWithTurnFooter(input: {
  content: ReactNode;
  layoutItem: StreamLayoutItem;
  strategy: TurnContentStrategy;
}): ReactNode {
  if (!input.content) {
    return null;
  }

  const footerHost = input.layoutItem.completedFooter;
  const footer = footerHost ? (
    <CompletedTurnFooterRow
      strategy={input.strategy}
      items={footerHost.items}
      startIndex={footerHost.startIndex}
    />
  ) : null;
  const content = (
    <StreamItemWrapper gapBelow={input.layoutItem.gapBelow}>{input.content}</StreamItemWrapper>
  );

  if (input.layoutItem.frameOrder === "footer-then-content") {
    return (
      <>
        {footer}
        {content}
      </>
    );
  }

  return (
    <>
      {content}
      {footer}
    </>
  );
}

function renderListEmptyComponent(input: {
  renderModel: AgentStreamRenderModel;
  emptyStateStyle: StyleProp<ViewStyle>;
  emptyText: string;
  isAuthoritativeHistoryReady: boolean;
}): ReactNode {
  if (
    !input.isAuthoritativeHistoryReady ||
    input.renderModel.boundary.hasVirtualizedHistory ||
    input.renderModel.boundary.hasMountedHistory ||
    input.renderModel.boundary.hasLiveHead ||
    input.renderModel.auxiliary.pendingPermissions ||
    input.renderModel.auxiliary.turnFooter
  ) {
    return null;
  }

  return (
    <View style={input.emptyStateStyle}>
      <Text style={stylesheet.emptyStateText}>{input.emptyText}</Text>
    </View>
  );
}

function renderHistoryStreamItem(input: {
  item: StreamItem;
  layoutItemById: Map<string, StreamLayoutItem>;
  renderStreamItem: (layoutItem: StreamLayoutItem) => ReactNode;
}): ReactNode {
  const layoutItem = input.layoutItemById.get(input.item.id);
  if (!layoutItem) {
    return null;
  }
  return input.renderStreamItem(layoutItem);
}

function renderLiveHeadStreamItem(input: {
  item: StreamItem;
  layoutItemById: Map<string, StreamLayoutItem>;
  renderStreamItem: (layoutItem: StreamLayoutItem) => ReactNode;
}): ReactNode {
  const layoutItem = input.layoutItemById.get(input.item.id);
  if (!layoutItem) {
    return null;
  }
  return input.renderStreamItem(layoutItem);
}

export interface AgentStreamViewHandle {
  scrollToBottom(reason?: BottomAnchorLocalRequest["reason"]): void;
  prepareForViewportChange(): void;
  requestTurnAnchor(request: TurnAnchorRequest): void;
}

export interface AgentStreamViewProps {
  agentId: string;
  serverId?: string;
  agent: AgentScreenAgent;
  streamItems: StreamItem[];
  pendingPermissions: Map<string, PendingPermission>;
  routeBottomAnchorRequest?: BottomAnchorRouteRequest | null;
  isAuthoritativeHistoryReady?: boolean;
  toast?: ToastApi | null;
  onOpenWorkspaceFile?: (request: WorkspaceFileOpenRequest) => void;
  turnAnchorRequest?: TurnAnchorRequest | null;
  isTurnAnchorEnabled?: boolean;
  /** Reports the follow-output/bottom state so the composer can scroll-collapse. */
  onNearBottomStateChange?: (isNearBottom: boolean) => void;
}

const EMPTY_STREAM_HEAD: StreamItem[] = [];

const AgentStreamViewComponent = forwardRef<AgentStreamViewHandle, AgentStreamViewProps>(
  function AgentStreamView(
    {
      agentId,
      serverId,
      agent,
      streamItems,
      pendingPermissions,
      routeBottomAnchorRequest = null,
      isAuthoritativeHistoryReady = true,
      toast,
      onOpenWorkspaceFile,
      turnAnchorRequest = null,
      isTurnAnchorEnabled = false,
      onNearBottomStateChange,
    },
    ref,
  ) {
    const { t } = useTranslation();
    const { settings: appSettings } = useAppSettings();
    const viewportRef = useRef<StreamViewportHandle | null>(null);
    const isMobile = useIsCompactFormFactor();
    const streamRenderStrategy = useMemo(
      () =>
        resolveStreamRenderStrategy({
          platform: Platform.OS,
          isMobileBreakpoint: isMobile,
        }),
      [isMobile],
    );
    const [isNearBottom, setIsNearBottom] = useState(true);
    const [expandedInlineToolCallIds, setExpandedInlineToolCallIds] = useState<Set<string>>(
      new Set(),
    );
    const [expandedWorkLogGroupIds, setExpandedWorkLogGroupIds] = useState<Set<string>>(new Set());
    const openFileExplorerForCheckout = usePanelStore((state) => state.openFileExplorerForCheckout);
    const setExplorerTabForCheckout = usePanelStore((state) => state.setExplorerTabForCheckout);

    // Get serverId (fallback to agent's serverId if not provided)
    const resolvedServerId = serverId ?? agent.serverId ?? "";

    const client = useSessionStore((state) => state.sessions[resolvedServerId]?.client ?? null);
    const streamHead = useSessionStore((state) =>
      state.sessions[resolvedServerId]?.agentStreamHead?.get(agentId),
    );

    const workspaceRoot = agent.cwd?.trim() || "";
    const workspaceId = resolveWorkspaceIdByExecutionDirectory({
      workspaces: useSessionStore.getState().sessions[resolvedServerId]?.workspaces?.values(),
      workspaceDirectory: workspaceRoot,
    });
    const { requestDirectoryListing } = useFileExplorerActions({
      serverId: resolvedServerId,
      workspaceId: workspaceId ?? undefined,
      workspaceRoot,
    });
    const { isLoadingOlder, hasOlder, loadOlder } = useLoadOlderAgentHistory({
      serverId: resolvedServerId,
      agentId,
      toast,
    });
    // Keep entry/exit animations off on Android due to RN dispatchDraw crashes
    // tracked in react-native-reanimated#8422.
    const shouldDisableEntryExitAnimations = Platform.OS === "android";
    const scrollIndicatorFadeIn = shouldDisableEntryExitAnimations
      ? undefined
      : FadeIn.duration(200);
    const scrollIndicatorFadeOut = shouldDisableEntryExitAnimations
      ? undefined
      : FadeOut.duration(200);

    const onNearBottomStateChangeStable = useStableEvent((value: boolean) => {
      onNearBottomStateChange?.(value);
    });
    const setIsNearBottomAndReport = useCallback(
      (value: boolean) => {
        setIsNearBottom(value);
        onNearBottomStateChangeStable(value);
      },
      [onNearBottomStateChangeStable],
    );

    useEffect(() => {
      setIsNearBottomAndReport(true);
      setExpandedInlineToolCallIds(new Set());
    }, [agentId, setIsNearBottomAndReport]);

    const handleInlinePathPress = useStableEvent(
      (target: InlinePathTarget, disposition: OpenFileDisposition) => {
        if (!target.path) {
          return;
        }

        const normalized = normalizeInlinePathTarget(target.path, agent.cwd);
        if (!normalized) {
          return;
        }

        if (normalized.file) {
          const location = normalizeWorkspaceFileLocation({
            path: normalized.file,
            lineStart: target.lineStart,
            lineEnd: target.lineEnd,
          });
          if (!location) {
            return;
          }

          if (onOpenWorkspaceFile) {
            onOpenWorkspaceFile({
              location,
              disposition,
            });
            return;
          }

          if (workspaceId) {
            navigateToPreparedWorkspaceTab({
              serverId: resolvedServerId,
              workspaceId,
              target: createWorkspaceFileTabTarget(location),
            });
          }
          return;
        }

        void requestDirectoryListing(normalized.directory, {
          recordHistory: false,
          setCurrentPath: false,
        });

        const checkout = {
          serverId: resolvedServerId,
          cwd: agent.cwd,
          isGit: agent.projectPlacement?.checkout?.isGit ?? true,
        };
        setExplorerTabForCheckout({ ...checkout, tab: "files" });
        openFileExplorerForCheckout({
          isCompact: isMobile,
          checkout,
        });
      },
    );

    const handleToolCallOpenFile = useStableEvent((filePath: string) => {
      handleInlinePathPress({ raw: filePath, path: filePath }, "main");
    });

    const baseRenderModel = useMemo(() => {
      return buildAgentStreamRenderModel({
        agentStatus: agent.status,
        tail: streamItems,
        head: streamHead ?? EMPTY_STREAM_HEAD,
        platform: isWeb ? "web" : "native",
        isMobileBreakpoint: isMobile,
      });
    }, [agent.status, isMobile, streamHead, streamItems]);
    const streamLayout = useMemo(
      () =>
        layoutStream({
          strategy: streamRenderStrategy,
          agentStatus: agent.status,
          history: baseRenderModel.history,
          liveHead: baseRenderModel.segments.liveHead,
          timingByAssistantId: baseRenderModel.turnTiming.byAssistantId,
        }),
      [
        agent.status,
        baseRenderModel.history,
        baseRenderModel.segments.liveHead,
        baseRenderModel.turnTiming.byAssistantId,
        streamRenderStrategy,
      ],
    );
    // Restores row-reference identity across streaming frames so memoized
    // rows and the derived maps below skip re-render when content is unchanged.
    const stableStreamLayout = useStableStreamLayout(streamLayout);
    useImperativeHandle(
      ref,
      () => ({
        scrollToBottom(reason = "jump-to-bottom") {
          viewportRef.current?.scrollToBottom(reason);
        },
        prepareForViewportChange() {
          viewportRef.current?.prepareForViewportChange();
        },
        requestTurnAnchor(request) {
          viewportRef.current?.requestTurnAnchor(request);
        },
      }),
      [],
    );

    const scrollToBottom = useCallback(() => {
      viewportRef.current?.scrollToBottom("jump-to-bottom");
    }, []);

    const setInlineDetailsExpanded = useCallback(
      (itemId: string, expanded: boolean) => {
        if (!streamRenderStrategy.shouldDisableParentScrollOnInlineDetailsExpansion()) {
          return;
        }
        setExpandedInlineToolCallIds((previous) => {
          const next = new Set(previous);
          if (expanded) {
            next.add(itemId);
          } else {
            next.delete(itemId);
          }
          return next;
        });
      },
      [streamRenderStrategy],
    );

    const renderUserMessageItem = useCallback(
      (layoutItem: StreamLayoutItem, item: Extract<StreamItem, { kind: "user_message" }>) => {
        return (
          <UserMessage
            serverId={resolvedServerId}
            agentId={agentId}
            messageId={item.id}
            message={item.text}
            images={item.images}
            attachments={item.attachments}
            timestamp={item.timestamp.getTime()}
            capabilities={agent.capabilities}
            client={client}
            isFirstInGroup={layoutItem.isFirstInUserGroup}
            isLastInGroup={layoutItem.isLastInUserGroup}
          />
        );
      },
      [agent.capabilities, agentId, client, resolvedServerId],
    );

    const openTurnChangeFile = useCallback(
      (path: string) => {
        if (workspaceId) {
          navigateToPreparedWorkspaceTab({
            serverId: resolvedServerId,
            workspaceId,
            target: createWorkspaceFileTabTarget({ path }),
          });
          return;
        }
        handleInlinePathPress({ raw: path, path }, "main");
      },
      [handleInlinePathPress, resolvedServerId, workspaceId],
    );

    const renderAssistantMessageItem = useCallback(
      (layoutItem: StreamLayoutItem, item: Extract<StreamItem, { kind: "assistant_message" }>) => {
        const turnChanges = layoutItem.turnChanges;
        return (
          <View style={stylesheet.workbenchAssistantTurn}>
            {/* No T3-style AI badge + duration turn header above assistant prose.
                Duration remains available via the completed-turn footer only. */}
            <AssistantFileLinkResolverProvider
              client={client}
              serverId={resolvedServerId}
              workspaceRoot={workspaceRoot}
              onOpenWorkspaceFile={handleInlinePathPress}
              toast={toast}
            >
              <AssistantMessage
                message={item.text}
                timestamp={item.timestamp.getTime()}
                workspaceRoot={workspaceRoot}
                serverId={resolvedServerId}
                agentId={agentId}
                client={client}
                spacing={layoutItem.assistantSpacing}
                isStreaming={agent.status === "running"}
              />
              {turnChanges && agent.status !== "running" ? (
                <TurnChangesTree files={turnChanges.changedFiles} onOpenFile={openTurnChangeFile} />
              ) : null}
            </AssistantFileLinkResolverProvider>
          </View>
        );
      },
      [
        agent.status,
        client,
        handleInlinePathPress,
        openTurnChangeFile,
        resolvedServerId,
        toast,
        workspaceRoot,
        agentId,
      ],
    );

    const renderThoughtItem = useCallback(
      (layoutItem: StreamLayoutItem, item: Extract<StreamItem, { kind: "thought" }>) => {
        if (!appSettings.showReasoning) {
          return null;
        }
        return (
          <ThoughtMessage
            text={item.text}
            status={item.status}
            defaultCollapsed={item.isCollapsedSummary === true}
            isLastInSequence={layoutItem.isLastInToolSequence}
          />
        );
      },
      [appSettings.showReasoning],
    );

    const renderToolCallItem = useCallback(
      (
        layoutItem: StreamLayoutItem,
        item: Extract<StreamItem, { kind: "tool_call" }>,
        badgeStyle?: StyleProp<ViewStyle>,
        badgePresentation?: "default" | "workbench",
      ) => {
        const { payload } = item;

        if (payload.source === "agent") {
          const data = payload.data;

          if (
            data.name === "speak" &&
            data.detail.type === "unknown" &&
            typeof data.detail.input === "string" &&
            data.detail.input.trim()
          ) {
            return (
              <SpeakMessage message={data.detail.input} timestamp={item.timestamp.getTime()} />
            );
          }

          return (
            <ToolCallSlot
              itemId={item.id}
              onInlineDetailsExpandedChangeByItemId={setInlineDetailsExpanded}
              toolName={data.name}
              error={data.error}
              status={data.status}
              detail={data.detail}
              cwd={agent.cwd}
              metadata={data.metadata}
              isLastInSequence={layoutItem.isLastInToolSequence}
              badgeStyle={badgeStyle}
              badgePresentation={badgePresentation}
              onOpenFilePath={handleToolCallOpenFile}
            />
          );
        }

        const data = payload.data;
        return (
          <ToolCallSlot
            itemId={item.id}
            onInlineDetailsExpandedChangeByItemId={setInlineDetailsExpanded}
            toolName={data.toolName}
            args={data.arguments}
            result={data.result}
            status={data.status}
            isLastInSequence={layoutItem.isLastInToolSequence}
            badgeStyle={badgeStyle}
            badgePresentation={badgePresentation}
            onOpenFilePath={handleToolCallOpenFile}
          />
        );
      },
      [agent.cwd, setInlineDetailsExpanded, handleToolCallOpenFile],
    );

    const renderToolSequenceGroup = useCallback(
      (layoutItem: StreamLayoutItem) => {
        const group = layoutItem.toolSequenceGroup;
        if (!group) {
          return null;
        }
        const toolCalls = group.filter(
          (
            candidate,
          ): candidate is StreamLayoutItem & {
            item: Extract<StreamItem, { kind: "tool_call" }>;
          } => candidate.item.kind === "tool_call",
        );
        const supportingItems = group.filter((candidate) => candidate.item.kind !== "tool_call");

        // While the agent is running, keep every badge visible so live tool
        // activity reads as work-in-progress; once idle, collapse the run to
        // its last badge with a "+N" affordance (reference implementation
        // MAX_VISIBLE_WORK_LOG_ENTRIES behavior).
        const groupId = layoutItem.item.id;
        const workLogCollapse =
          agent.status === "running"
            ? null
            : deriveWorkLogCollapse({
                toolEntries: toolCalls.map((candidate) => candidate.item),
                expanded: expandedWorkLogGroupIds.has(groupId),
              });
        const visibleIds =
          workLogCollapse === null
            ? null
            : new Set(workLogCollapse.visibleEntries.map((entry) => entry.id));
        const visibleToolCalls =
          visibleIds === null
            ? toolCalls
            : toolCalls.filter((candidate) => visibleIds.has(candidate.item.id));
        const hiddenCount = workLogCollapse?.hiddenCount ?? 0;

        return (
          <View style={stylesheet.workbenchToolSequenceGroup}>
            {visibleToolCalls.length > 0 ? (
              <View style={stylesheet.workbenchToolBadgeRow}>
                {visibleToolCalls.map((candidate) => (
                  <View key={candidate.item.id} style={stylesheet.workbenchToolBadgeSlot}>
                    {renderToolCallItem(
                      candidate,
                      candidate.item,
                      stylesheet.workbenchToolBadge,
                      "workbench",
                    )}
                  </View>
                ))}
                {hiddenCount > 0 ? (
                  <WorkLogMoreButton
                    groupId={groupId}
                    hiddenCount={hiddenCount}
                    expanded={expandedWorkLogGroupIds.has(groupId)}
                    onToggleWorkLogGroup={setExpandedWorkLogGroupIds}
                    slotStyle={stylesheet.workbenchToolBadgeSlot}
                    moreBadgeStyle={stylesheet.workbenchToolMoreBadge}
                    moreBadgeTextStyle={stylesheet.workbenchToolMoreBadgeText}
                  />
                ) : null}
              </View>
            ) : null}
            {supportingItems.map((candidate) => {
              const item = candidate.item;
              if (item.kind === "thought") {
                return <View key={item.id}>{renderThoughtItem(candidate, item)}</View>;
              }
              if (item.kind === "todo_list") {
                return <TodoListCard key={item.id} items={item.items} presentation="workbench" />;
              }
              return null;
            })}
          </View>
        );
      },
      [agent.status, expandedWorkLogGroupIds, renderThoughtItem, renderToolCallItem],
    );

    const renderStreamItemContent = useCallback(
      (layoutItem: StreamLayoutItem) => {
        const item = layoutItem.item;
        switch (item.kind) {
          case "user_message":
            return renderUserMessageItem(layoutItem, item);

          case "assistant_message":
            return renderAssistantMessageItem(layoutItem, item);

          case "thought":
            return renderThoughtItem(layoutItem, item);

          case "tool_call":
            return renderToolCallItem(layoutItem, item);

          case "activity_log":
            return (
              <ActivityLog
                type={item.activityType}
                message={item.message}
                timestamp={item.timestamp.getTime()}
                metadata={item.metadata}
              />
            );

          case "todo_list":
            return <TodoListCard items={item.items} />;

          case "compaction":
            return (
              <CompactionMarker
                status={item.status}
                error={item.error}
                trigger={item.trigger}
                preTokens={item.preTokens}
              />
            );

          case "generative_ui":
            return (
              <GenerativeUiRenderer item={item} serverId={resolvedServerId} agentId={agentId} />
            );

          default:
            return null;
        }
      },
      [
        renderUserMessageItem,
        renderAssistantMessageItem,
        renderThoughtItem,
        renderToolCallItem,
        agentId,
        resolvedServerId,
      ],
    );

    const bottomTurnFooterHost = stableStreamLayout.auxiliaryTurnFooter;

    const renderStreamItem = useCallback(
      (layoutItem: StreamLayoutItem) => {
        if (layoutItem.isToolSequenceGroupContinuation) {
          return null;
        }
        if (layoutItem.toolSequenceGroup) {
          return (
            <StreamItemWrapper gapBelow={layoutItem.toolSequenceGroupGapBelow}>
              {renderToolSequenceGroup(layoutItem)}
            </StreamItemWrapper>
          );
        }
        const content = renderStreamItemContent(layoutItem);
        return renderStreamItemWithTurnFooter({
          content,
          layoutItem,
          strategy: streamRenderStrategy,
        });
      },
      [renderStreamItemContent, renderToolSequenceGroup, streamRenderStrategy],
    );

    const pendingPermissionItems = useMemo(
      () => Array.from(pendingPermissions.values()).filter((perm) => perm.agentId === agentId),
      [pendingPermissions, agentId],
    );

    const showRunningTurnFooter = agent.status === "running";
    // M12: approvals render in the composer banner, never in the stream.
    const pendingPermissionsNode = useMemo(
      () =>
        renderPendingPermissionsNode({
          pendingPermissions: pendingPermissionItems,
          client,
          toast,
        }),
      // Intentionally stable null; keep deps so a future re-enable stays honest.
      [client, pendingPermissionItems, toast],
    );
    const turnFooterNode = useMemo(
      () =>
        showRunningTurnFooter || bottomTurnFooterHost ? (
          <TurnFooter
            isRunning={showRunningTurnFooter}
            inFlightTurnStartedAt={baseRenderModel.turnTiming.runningStartedAt}
            host={bottomTurnFooterHost}
            strategy={streamRenderStrategy}
          />
        ) : null,
      [
        showRunningTurnFooter,
        baseRenderModel.turnTiming.runningStartedAt,
        bottomTurnFooterHost,
        streamRenderStrategy,
      ],
    );
    const renderModel = useMemo<AgentStreamRenderModel>(() => {
      return {
        ...baseRenderModel,
        boundary: baseRenderModel.boundary,
        auxiliary: {
          pendingPermissions: pendingPermissionsNode,
          turnFooter: turnFooterNode,
        },
      };
    }, [baseRenderModel, pendingPermissionsNode, turnFooterNode]);

    const emptyStateStyle = useMemo(() => [stylesheet.emptyState, stylesheet.contentWrapper], []);
    const listEmptyComponent = useMemo(
      () =>
        renderListEmptyComponent({
          renderModel,
          emptyStateStyle,
          emptyText: t("session.startChat"),
          isAuthoritativeHistoryReady,
        }),
      [emptyStateStyle, isAuthoritativeHistoryReady, renderModel, t],
    );

    const { boundary, auxiliary } = renderModel;

    const layoutHistoryItemById = useMemo(() => {
      const itemById = new Map<string, StreamLayoutItem>();
      for (const item of stableStreamLayout.history) {
        itemById.set(item.item.id, item);
      }
      return itemById;
    }, [stableStreamLayout.history]);

    const layoutLiveHeadItemById = useMemo(() => {
      const itemById = new Map<string, StreamLayoutItem>();
      for (const item of stableStreamLayout.liveHead) {
        itemById.set(item.item.id, item);
      }
      return itemById;
    }, [stableStreamLayout.liveHead]);

    const renderHistoryRow = useCallback(
      (item: StreamItem) =>
        renderHistoryStreamItem({
          item,
          layoutItemById: layoutHistoryItemById,
          renderStreamItem,
        }),
      [layoutHistoryItemById, renderStreamItem],
    );

    const renderHistoryVirtualizedRow = useCallback<
      StreamSegmentRenderers["renderHistoryVirtualizedRow"]
    >((item) => renderHistoryRow(item), [renderHistoryRow]);
    const renderHistoryMountedRow = useCallback<StreamSegmentRenderers["renderHistoryMountedRow"]>(
      (item) => renderHistoryRow(item),
      [renderHistoryRow],
    );
    const renderLiveHeadRow = useCallback<StreamSegmentRenderers["renderLiveHeadRow"]>(
      (item) =>
        renderLiveHeadStreamItem({
          item,
          layoutItemById: layoutLiveHeadItemById,
          renderStreamItem,
        }),
      [layoutLiveHeadItemById, renderStreamItem],
    );
    const renderLiveAuxiliary = useCallback<StreamSegmentRenderers["renderLiveAuxiliary"]>(() => {
      return renderLiveAuxiliaryNode({
        pendingPermissions: auxiliary.pendingPermissions,
        turnFooter: auxiliary.turnFooter,
      });
    }, [auxiliary.pendingPermissions, auxiliary.turnFooter]);

    const renderers = useMemo<StreamSegmentRenderers>(
      () => ({
        renderHistoryVirtualizedRow,
        renderHistoryMountedRow,
        renderLiveHeadRow,
        renderLiveAuxiliary,
      }),
      [
        renderHistoryVirtualizedRow,
        renderHistoryMountedRow,
        renderLiveHeadRow,
        renderLiveAuxiliary,
      ],
    );

    const streamScrollEnabled =
      !streamRenderStrategy.shouldDisableParentScrollOnInlineDetailsExpansion() ||
      expandedInlineToolCallIds.size === 0;

    return (
      <ToolCallSheetProvider>
        <View style={stylesheet.container}>
          <MessageOuterSpacingProvider disableOuterSpacing>
            {streamRenderStrategy.render({
              agentId,
              segments: renderModel.segments,
              boundary,
              renderers,
              listEmptyComponent,
              viewportRef,
              routeBottomAnchorRequest,
              isAuthoritativeHistoryReady,
              onNearBottomChange: setIsNearBottomAndReport,
              onNearHistoryStart: loadOlder,
              isLoadingOlderHistory: isLoadingOlder,
              hasOlderHistory: hasOlder,
              scrollEnabled: streamScrollEnabled,
              listStyle: stylesheet.list,
              baseListContentContainerStyle: stylesheet.listContentContainer,
              forwardListContentContainerStyle: stylesheet.forwardListContentContainer,
              turnAnchorRequest,
              isTurnAnchorEnabled,
            })}
          </MessageOuterSpacingProvider>
          {!isNearBottom && (
            <Animated.View
              style={staticStyles.scrollToBottomContainer}
              entering={scrollIndicatorFadeIn}
              exiting={scrollIndicatorFadeOut}
            >
              <View style={stylesheet.scrollToBottomInner}>
                <Pressable
                  style={stylesheet.scrollToBottomButton}
                  onPress={scrollToBottom}
                  accessibilityRole="button"
                  accessibilityLabel={t("stream.scrollToBottom")}
                  testID="scroll-to-bottom-button"
                >
                  <ChevronDown size={24} color={stylesheet.scrollToBottomIcon.color} />
                </Pressable>
              </View>
            </Animated.View>
          )}
        </View>
      </ToolCallSheetProvider>
    );
  },
);

export const AgentStreamView = memo(AgentStreamViewComponent);
AgentStreamView.displayName = "AgentStreamView";

interface ToolCallSlotProps extends Omit<
  ComponentProps<typeof ToolCall>,
  "onInlineDetailsExpandedChange"
> {
  itemId: string;
  onInlineDetailsExpandedChangeByItemId: (itemId: string, expanded: boolean) => void;
}

function ToolCallSlot({
  itemId,
  onInlineDetailsExpandedChangeByItemId,
  ...rest
}: ToolCallSlotProps) {
  const handleExpandedChange = useCallback(
    (expanded: boolean) => onInlineDetailsExpandedChangeByItemId(itemId, expanded),
    [onInlineDetailsExpandedChangeByItemId, itemId],
  );
  return <ToolCall {...rest} onInlineDetailsExpandedChange={handleExpandedChange} />;
}

interface WorkLogMoreButtonProps {
  groupId: string;
  hiddenCount: number;
  expanded: boolean;
  onToggleWorkLogGroup: React.Dispatch<React.SetStateAction<Set<string>>>;
  slotStyle: StyleProp<ViewStyle>;
  moreBadgeStyle: StyleProp<ViewStyle>;
  moreBadgeTextStyle: StyleProp<TextStyle>;
}

function WorkLogMoreButton({
  groupId,
  hiddenCount,
  expanded,
  onToggleWorkLogGroup,
  slotStyle,
  moreBadgeStyle,
  moreBadgeTextStyle,
}: WorkLogMoreButtonProps) {
  const handlePress = useCallback(() => {
    onToggleWorkLogGroup((previous) => {
      const next = new Set(previous);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }
      return next;
    });
  }, [groupId, onToggleWorkLogGroup]);
  // Expanded keeps the affordance (T3 work-toggle) and switches the label to
  // "Show fewer"; collapsed keeps the compact "+N" badge.
  const accessibilityLabel = expanded
    ? "Show fewer tool calls"
    : `Show ${hiddenCount} more tool calls`;
  const label = expanded ? "Show fewer" : `+${hiddenCount}`;
  return (
    <Pressable
      onPress={handlePress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={slotStyle}
    >
      <View style={moreBadgeStyle}>
        <Text style={moreBadgeTextStyle}>{label}</Text>
      </View>
    </Pressable>
  );
}

const stylesheet = StyleSheet.create((theme) => ({
  container: {
    flex: 1,
    backgroundColor: resolveThemeWorkbenchSurfaceRoles(theme).content,
  },
  contentWrapper: {
    width: "100%",
    alignSelf: "stretch",
    paddingHorizontal: 0,
  },
  // Soft .m-stream: 12 14 8 horizontal; desktop pad owned by web strategy.
  listContentContainer: {
    paddingVertical: 0,
    flexGrow: 1,
    paddingHorizontal: {
      xs: 14,
      md: 0,
    },
  },
  // Soft .stream vertical rhythm: 14 top / 10 bottom (web strategy owns desktop pad).
  forwardListContentContainer: {
    paddingTop: 14,
    paddingBottom: 10,
    ...(isWeb
      ? {
          marginTop: -WORKBENCH_FRAME_HAIRLINE_OFFSET,
        }
      : {}),
  },
  list: {
    flex: 1,
  },
  // Soft .stream-inner / .role-a: match ConversationAspectColumn / pen-bar.
  workbenchAssistantTurn: {
    width: "100%",
    maxWidth: WORKBENCH_ASSISTANT_MESSAGE_MAX_WIDTH,
  },
  workbenchToolSequenceGroup: {
    width: "100%",
    maxWidth: WORKBENCH_ASSISTANT_MESSAGE_MAX_WIDTH,
    gap: 8,
  },
  workbenchToolBadgeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 5,
  },
  workbenchToolBadgeSlot: {
    flexShrink: 1,
    minWidth: 0,
    maxWidth: 220,
  },
  workbenchToolBadge: {
    width: "auto",
    maxWidth: 220,
    alignSelf: "flex-start",
  },
  workbenchToolMoreBadge: {
    height: 28,
    minWidth: 36,
    paddingHorizontal: 10,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface0,
  },
  workbenchToolMoreBadgeText: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "500",
    color: theme.colors.mutedForeground,
    fontVariant: ["tabular-nums"],
  },
  streamItemWrapper: {
    width: "100%",
    alignSelf: "stretch",
    paddingHorizontal: {
      xs: theme.spacing[2],
      md: 0,
    },
  },
  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: theme.spacing[12],
  },
  permissionsContainer: {
    gap: theme.spacing[2],
  },
  listHeaderContent: {
    gap: theme.spacing[3],
  },
  syncingIndicator: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
    paddingVertical: theme.spacing[1],
    paddingLeft: theme.spacing[2],
  },
  syncingIndicatorText: {
    color: theme.colors.foregroundMuted,
    fontSize: 12.5,
    lineHeight: 16,
  },
  invertedWrapper: {
    transform: [{ scaleY: -1 }],
    width: "100%",
  },
  emptyStateText: {
    color: theme.colors.foregroundMuted,
    fontSize: 12.5,
    lineHeight: 16,
    textAlign: "center",
  },
  scrollToBottomInner: {
    width: "100%",
    alignSelf: "center",
    alignItems: "center",
  },
  scrollToBottomButton: {
    width: 40,
    height: 40,
    borderRadius: theme.borderRadius.full,
    backgroundColor: theme.colors.surface0,
    borderWidth: 1,
    borderColor: theme.colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  scrollToBottomIcon: {
    color: theme.colors.foreground,
  },
}));

const staticStyles = RNStyleSheet.create({
  scrollToBottomContainer: {
    position: "absolute",
    bottom: 16,
    left: 0,
    right: 0,
    alignItems: "center",
    pointerEvents: "box-none",
  },
});

interface StreamItemWrapperProps {
  gapBelow: number;
  children: ReactNode;
}

function StreamItemWrapper({ gapBelow, children }: StreamItemWrapperProps) {
  const wrapperStyle = useMemo(
    () => [stylesheet.streamItemWrapper, { marginBottom: gapBelow }],
    [gapBelow],
  );
  return <View style={wrapperStyle}>{children}</View>;
}
