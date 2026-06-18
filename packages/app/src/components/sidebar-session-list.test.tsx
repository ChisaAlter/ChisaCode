/**
 * @vitest-environment jsdom
 */
import React from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AggregatedAgent } from "@/hooks/use-aggregated-agents";
import { SidebarSessionList } from "@/components/sidebar-session-list";
import { navigateToAgent } from "@/utils/navigate-to-agent";

const {
  theme,
  routerPushMock,
  archiveAgentMock,
  updateAgentMock,
  deleteAgentMock,
  setAgentsMock,
  getQueryDataMock,
  setQueryDataMock,
  removeQueriesMock,
  invalidateQueriesMock,
  setStringAsyncMock,
  toastCopiedMock,
  toastErrorMock,
  confirmDialogMock,
  isCompactFormFactorMock,
} = vi.hoisted(() => ({
  theme: {
    spacing: { 1: 4, 2: 8, 3: 12, 4: 16, 8: 32 },
    borderRadius: { md: 6, lg: 8, full: 9999 },
    fontSize: { xs: 11, sm: 13 },
    fontWeight: { normal: "400", medium: "500" },
    iconSize: { sm: 14 },
    colors: {
      foreground: "#fff",
      foregroundMuted: "#aaa",
      accent: "#22c55e",
      border: "#555",
      surface0: "#222",
      surface1: "#333",
      surface2: "#444",
      surface3: "#444",
      surfaceSidebarHover: "#333",
      palette: {
        amber: { 500: "#f59e0b" },
        red: { 300: "#fca5a5" },
      },
    },
    shadow: {
      sm: {
        shadowColor: "rgba(0, 0, 0, 0.25)",
        shadowOffset: { width: 0, height: 2 },
        shadowRadius: 4,
        elevation: 2,
      },
      md: {
        shadowColor: "rgba(0, 0, 0, 0.20)",
        shadowOffset: { width: 0, height: 4 },
        shadowRadius: 8,
        elevation: 8,
      },
    },
  },
  routerPushMock: vi.fn(),
  archiveAgentMock: vi.fn(),
  updateAgentMock: vi.fn(),
  deleteAgentMock: vi.fn(),
  setAgentsMock: vi.fn(),
  getQueryDataMock: vi.fn(),
  setQueryDataMock: vi.fn(),
  removeQueriesMock: vi.fn(),
  invalidateQueriesMock: vi.fn(),
  setStringAsyncMock: vi.fn(),
  toastCopiedMock: vi.fn(),
  toastErrorMock: vi.fn(),
  confirmDialogMock: vi.fn(),
  isCompactFormFactorMock: vi.fn(() => false),
}));

vi.hoisted(() => {
  (globalThis as unknown as { __DEV__: boolean }).__DEV__ = false;
});

vi.mock("react-native-unistyles", () => ({
  StyleSheet: {
    create: (factory: unknown) => (typeof factory === "function" ? factory(theme) : factory),
    absoluteFillObject: {},
  },
  useUnistyles: () => ({ theme }),
}));

vi.mock("@/constants/platform", () => ({
  isWeb: true,
}));

vi.mock("@/constants/layout", () => ({
  useIsCompactFormFactor: () => isCompactFormFactorMock(),
}));

vi.mock("expo-router", () => ({
  router: {
    push: routerPushMock,
  },
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, values?: Record<string, unknown>) => {
      const labels: Record<string, string> = {
        "sidebar.unknownWorkspace": "Unknown workspace",
        "sidebar.noHost": "No host connected",
        "sidebar.noSessions": "No sessions yet",
        "sidebar.addProject": "Add project",
        "sidebar.pinnedSessions": "Pinned",
        "sidebar.loadMoreSessions": "Load more sessions",
        "sidebar.sessionActions": "Session actions",
        "sidebar.copyPath": "Copy path",
        "sidebar.pinSession": "Pin",
        "sidebar.pinSessionLabel": `Pin ${values?.title ?? "session"}`,
        "sidebar.unpinSession": "Unpin",
        "sidebar.unpinSessionLabel": `Unpin ${values?.title ?? "session"}`,
        "sidebar.pinSessionFailed": "Failed to pin session",
        "sidebar.archive": "Archive",
        "sidebar.archiveSessionLabel": `Archive ${values?.title ?? "session"}`,
        "sidebar.archiving": "Archiving...",
        "sidebar.newSessionInWorkspace": `New session in ${values?.workspace ?? "workspace"}`,
        "sidebar.deleteSession": "Delete",
        "sidebar.deletingSession": "Deleting...",
        "sidebar.deleteSessionTitle": "Delete session?",
        "sidebar.deleteSessionMessage": `Delete ${values?.name ?? ""}?`,
        "sidebar.deleteSessionFailed": "Failed to delete session",
        "session.newSession": "New session",
        "session.archived": "Archived",
        "session.status.closed": "Closed",
        "session.status.running": "Running",
        "session.pendingCount": `${values?.count ?? 0} pending`,
        "session.needsAttention": "Needs attention",
        "common.loading": "Loading...",
        "common.copiedToClipboard": "Copied to clipboard.",
        "workspace.tabMenu.copyAgentId": "Copy agent id",
        "workspace.screen.copyFailed": "Copy failed",
        "workspace.screen.rename": "Rename",
        "workspace.screen.renameAgent": "Rename agent",
        "workspace.screen.hostDisconnected": "Host is not connected",
      };
      return labels[key] ?? key;
    },
  }),
}));

vi.mock("expo-clipboard", () => ({
  setStringAsync: setStringAsyncMock,
}));

vi.mock("@/components/provider-icons", () => ({
  getProviderIcon: (provider: string) => {
    const ProviderIcon = () => <span data-testid={`provider-icon-${provider}`} />;
    return ProviderIcon;
  },
}));

vi.mock("@/components/ui/button", () => ({
  Button: ({
    children,
    onPress,
    testID,
  }: {
    children: React.ReactNode;
    onPress?: () => void;
    testID?: string;
  }) => (
    <button type="button" data-testid={testID} onClick={onPress}>
      {children}
    </button>
  ),
}));

vi.mock("@/components/ui/dropdown-menu", () => ({
  DropdownMenu: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuTrigger: ({ children, testID }: { children: React.ReactNode; testID?: string }) => (
    <button type="button" data-testid={testID}>
      {children}
    </button>
  ),
  DropdownMenuContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuItem: ({
    children,
    onSelect,
    disabled,
    testID,
  }: {
    children: React.ReactNode;
    onSelect?: () => void;
    disabled?: boolean;
    testID?: string;
  }) => (
    <button type="button" data-testid={testID} disabled={disabled} onClick={onSelect}>
      {children}
    </button>
  ),
}));

vi.mock("@/components/ui/context-menu", () => ({
  ContextMenu: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  ContextMenuTrigger: ({
    children,
    testID,
    onPress,
    style,
    accessibilityLabel,
    accessibilityState,
  }: {
    children: React.ReactNode;
    testID?: string;
    onPress?: (event: { stopPropagation: () => void }) => void;
    style?: unknown;
    accessibilityLabel?: string;
    accessibilityState?: { selected?: boolean };
  }) => {
    const handleClick = React.useCallback(() => {
      onPress?.({ stopPropagation: vi.fn() });
    }, [onPress]);
    const resolvedStyle =
      typeof style === "function" ? style({ hovered: true, pressed: false }) : style;
    return (
      <button
        type="button"
        aria-label={accessibilityLabel}
        aria-selected={accessibilityState?.selected ? "true" : undefined}
        data-testid={testID}
        data-style={JSON.stringify(resolvedStyle)}
        onClick={handleClick}
      >
        {children}
      </button>
    );
  },
  ContextMenuContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  ContextMenuItem: ({
    children,
    onSelect,
    disabled,
    testID,
  }: {
    children: React.ReactNode;
    onSelect?: () => void;
    disabled?: boolean;
    testID?: string;
  }) => (
    <button type="button" data-testid={testID} disabled={disabled} onClick={onSelect}>
      {children}
    </button>
  ),
}));

vi.mock("@/contexts/toast-context", () => ({
  useToast: () => ({
    copied: toastCopiedMock,
    error: toastErrorMock,
  }),
}));

vi.mock("@/utils/confirm-dialog", () => ({
  confirmDialog: confirmDialogMock,
}));

vi.mock("@/components/rename-modal", () => ({
  AdaptiveRenameModal: ({
    visible,
    onSubmit,
    testID,
  }: {
    visible: boolean;
    onSubmit: (value: string) => Promise<void> | void;
    testID?: string;
  }) => {
    const handleClick = React.useCallback(() => {
      void onSubmit("Renamed session");
    }, [onSubmit]);
    return visible ? (
      <button type="button" data-testid={testID} onClick={handleClick}>
        Rename modal
      </button>
    ) : null;
  },
}));

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({
    getQueryData: getQueryDataMock,
    setQueryData: setQueryDataMock,
    removeQueries: removeQueriesMock,
    invalidateQueries: invalidateQueriesMock,
  }),
}));

vi.mock("@/hooks/use-archive-agent", () => ({
  useArchiveAgent: () => ({
    archiveAgent: archiveAgentMock,
    isArchivingAgent: () => false,
  }),
}));

vi.mock("@/hooks/agent-history-query-key", () => ({
  agentHistoryQueryKey: (serverId: string) => ["agentHistory", serverId],
}));

vi.mock("@/stores/session-store", () => {
  const state = {
    sessions: {
      "server-1": {
        client: {
          updateAgent: updateAgentMock,
          deleteAgent: deleteAgentMock,
        },
      },
    },
    setAgents: setAgentsMock,
  };
  function useSessionStore(selector: (state: unknown) => unknown) {
    return selector(state);
  }
  useSessionStore.getState = () => state;
  return { useSessionStore };
});

vi.mock("@/stores/session-store-hooks", () => ({
  useResolveWorkspaceIdByCwd: (_serverId: string | null, cwd: string | null | undefined) => {
    if (cwd === "/repo/project") return "workspace-project";
    if (cwd === "/repo/other") return "workspace-other";
    return null;
  },
}));

vi.mock("@/stores/draft-keys", () => ({
  generateDraftId: () => "draft-fixed",
}));

vi.mock("@/utils/navigate-to-agent", () => ({
  navigateToAgent: vi.fn(),
}));

vi.mock("@/utils/agent-history-navigation", () => ({
  rememberArchivedAgentDetail: vi.fn(),
}));

vi.mock("lucide-react-native", () => ({
  Archive: () => <span data-testid="archive-icon" />,
  Bot: () => <span data-testid="bot-icon" />,
  Copy: () => <span data-testid="copy-icon" />,
  Folder: () => <span data-testid="folder-icon" />,
  MoreHorizontal: () => <span data-testid="more-icon" />,
  Pencil: () => <span data-testid="pencil-icon" />,
  Pin: () => <span data-testid="pin-icon" />,
  Plus: () => <span data-testid="plus-icon" />,
  Trash2: () => <span data-testid="trash-icon" />,
}));

function agent(input: Partial<AggregatedAgent> & { id: string; cwd: string }): AggregatedAgent {
  const updatedAt = input.lastActivityAt ?? new Date("2026-06-01T10:00:00.000Z");
  return {
    id: input.id,
    serverId: input.serverId ?? "server-1",
    serverLabel: input.serverLabel ?? "Local",
    title: input.title ?? "Review video pipeline",
    status: input.status ?? "closed",
    lastActivityAt: updatedAt,
    cwd: input.cwd,
    provider: input.provider ?? "codex",
    pendingPermissionCount: input.pendingPermissionCount ?? 0,
    requiresAttention: input.requiresAttention ?? false,
    attentionReason: input.attentionReason ?? null,
    attentionTimestamp: input.attentionTimestamp ?? null,
    archivedAt: input.archivedAt ?? null,
    createdAt: input.createdAt ?? updatedAt,
    labels: input.labels ?? {},
  };
}

function renderSidebarSessionList(props: React.ComponentProps<typeof SidebarSessionList>) {
  return render(<SidebarSessionList {...props} />);
}

describe("SidebarSessionList", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    routerPushMock.mockReset();
    archiveAgentMock.mockReset();
    archiveAgentMock.mockResolvedValue(undefined);
    updateAgentMock.mockReset();
    updateAgentMock.mockResolvedValue(undefined);
    deleteAgentMock.mockReset();
    deleteAgentMock.mockResolvedValue(undefined);
    setAgentsMock.mockReset();
    getQueryDataMock.mockReset();
    setQueryDataMock.mockReset();
    removeQueriesMock.mockReset();
    invalidateQueriesMock.mockReset();
    setStringAsyncMock.mockReset();
    setStringAsyncMock.mockResolvedValue(undefined);
    toastCopiedMock.mockReset();
    toastErrorMock.mockReset();
    confirmDialogMock.mockReset();
    confirmDialogMock.mockResolvedValue(true);
    isCompactFormFactorMock.mockReset();
    isCompactFormFactorMock.mockReturnValue(false);
  });

  it("groups sessions by cwd basename and renders provider icons", () => {
    const agents = [agent({ id: "agent-1", cwd: "C:\\ai\\yuanhangxing", provider: "codex" })];

    renderSidebarSessionList({ serverId: "server-1", agents });

    expect(screen.getByText("yuanhangxing")).not.toBeNull();
    expect(screen.getByText("Review video pipeline")).not.toBeNull();
    expect(screen.getByTestId("folder-icon")).not.toBeNull();
    expect(screen.getByTestId("provider-icon-codex")).not.toBeNull();
  });

  it("opens the singleton new-conversation page from a workspace group plus button", () => {
    const agents = [agent({ id: "agent-1", cwd: "/repo/project", title: "Project session" })];

    renderSidebarSessionList({ serverId: "server-1", agents });

    fireEvent.click(screen.getByTestId("sidebar-session-group-new-server-1-/repo/project"));

    expect(routerPushMock).toHaveBeenCalledWith(
      "/h/server-1/new?dir=%2Frepo%2Fproject&draft=draft-fixed",
    );
  });

  it("renders session rows with title only and no status metadata", () => {
    const agents = [
      agent({
        id: "agent-1",
        cwd: "/repo/project",
        title: "Summarized first prompt title",
        status: "running",
        pendingPermissionCount: 2,
        requiresAttention: true,
      }),
    ];

    renderSidebarSessionList({ serverId: "server-1", agents });

    const row = screen.getByTestId("sidebar-session-server-1-agent-1");
    expect(within(row).getByText("Summarized first prompt title")).not.toBeNull();
    expect(within(row).queryByText("Running")).toBeNull();
    expect(within(row).queryByText("2 pending")).toBeNull();
    expect(within(row).queryByText("Needs attention")).toBeNull();
  });

  it("centers compact session title text against the provider icon", () => {
    isCompactFormFactorMock.mockReturnValue(true);
    const agents = [
      agent({
        id: "agent-1",
        cwd: "/repo/project",
        title: "问候响应",
      }),
    ];

    renderSidebarSessionList({ serverId: "server-1", agents });

    const title = screen.getByText("问候响应");
    expect(title.style.lineHeight).toBe("20px");
    expect(title.style.paddingTop).toBe("4px");
    expect(title.style.transform).toBe("translateY(2px)");
  });

  it("hides archived sessions from the sidebar", () => {
    const agents = [
      agent({
        id: "archived-agent",
        cwd: "/repo/project",
        title: "Archived session",
        archivedAt: new Date("2026-06-01T11:00:00.000Z"),
      }),
      agent({ id: "active-agent", cwd: "/repo/project", title: "Active session" }),
    ];

    renderSidebarSessionList({ serverId: "server-1", agents });

    expect(screen.queryByText("Archived session")).toBeNull();
    expect(screen.getByText("Active session")).not.toBeNull();
  });

  it("navigates to visible sessions", () => {
    const agents = [agent({ id: "agent-active", cwd: "/repo/project" })];

    renderSidebarSessionList({ serverId: "server-1", agents });

    fireEvent.click(screen.getByTestId("sidebar-session-server-1-agent-active"));

    expect(navigateToAgent).toHaveBeenCalledWith({
      serverId: "server-1",
      agentId: "agent-active",
      pin: false,
    });
  });

  it("renders empty state", () => {
    const emptyAgents: AggregatedAgent[] = [];
    renderSidebarSessionList({ serverId: "server-1", agents: emptyAgents });

    expect(screen.getByText("No sessions yet")).not.toBeNull();
  });

  it("does not render draft sessions in the sidebar before they are sent", () => {
    renderSidebarSessionList({
      serverId: "server-1",
      agents: [],
      drafts: [
        {
          serverId: "server-1",
          workspaceId: "workspace-project",
          draftId: "draft-1",
          cwd: "/repo/project",
          createdAt: new Date("2026-06-01T12:00:00.000Z"),
        },
      ],
    });

    expect(screen.getByText("No sessions yet")).not.toBeNull();
    expect(screen.queryByText("project")).toBeNull();
    expect(
      screen.queryByTestId("sidebar-session-draft-server-1-workspace-project-draft-1"),
    ).toBeNull();
    expect(routerPushMock).not.toHaveBeenCalled();
  });

  it("keeps agent rows stable when draft rows are added and removed", () => {
    const agents = [
      agent({
        id: "agent-1",
        cwd: "/repo/project",
        title: "Persistent agent session",
        lastActivityAt: new Date("2026-06-01T11:00:00.000Z"),
      }),
    ];
    const draft = {
      serverId: "server-1",
      workspaceId: "workspace-project",
      draftId: "draft-1",
      cwd: "/repo/project",
      createdAt: new Date("2026-06-01T12:00:00.000Z"),
    };

    const { rerender } = renderSidebarSessionList({
      serverId: "server-1",
      agents,
      drafts: [],
    });

    const rowBeforeDraft = screen.getByTestId("sidebar-session-server-1-agent-1");
    expect(within(rowBeforeDraft).getByText("Persistent agent session")).not.toBeNull();

    rerender(
      React.createElement(SidebarSessionList, {
        serverId: "server-1",
        agents,
        drafts: [draft],
      }),
    );

    expect(screen.getByTestId("sidebar-session-server-1-agent-1")).not.toBeNull();
    expect(
      screen.queryByTestId("sidebar-session-draft-server-1-workspace-project-draft-1"),
    ).toBeNull();

    rerender(
      React.createElement(SidebarSessionList, {
        serverId: "server-1",
        agents,
        drafts: [],
      }),
    );

    const rowAfterDraft = screen.getByTestId("sidebar-session-server-1-agent-1");
    expect(within(rowAfterDraft).getByText("Persistent agent session")).not.toBeNull();
    expect(
      screen.queryByTestId("sidebar-session-draft-server-1-workspace-project-draft-1"),
    ).toBeNull();
  });

  it("does not reorder existing agent rows when a draft is added to an older group", () => {
    const agents = [
      agent({
        id: "newer-agent",
        cwd: "/repo/newer",
        title: "Newer agent",
        lastActivityAt: new Date("2026-06-01T12:00:00.000Z"),
      }),
      agent({
        id: "older-agent",
        cwd: "/repo/project",
        title: "Older agent",
        lastActivityAt: new Date("2026-06-01T11:00:00.000Z"),
      }),
    ];
    const drafts = [
      {
        serverId: "server-1",
        workspaceId: "workspace-project",
        draftId: "draft-1",
        cwd: "/repo/project",
        createdAt: new Date("2026-06-01T13:00:00.000Z"),
      },
    ];

    const { rerender } = renderSidebarSessionList({
      serverId: "server-1",
      agents,
      drafts: [],
    });

    const newerBeforeDraft = screen.getByTestId("sidebar-session-server-1-newer-agent");
    const olderBeforeDraft = screen.getByTestId("sidebar-session-server-1-older-agent");
    expect(
      newerBeforeDraft.compareDocumentPosition(olderBeforeDraft) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).not.toBe(0);

    rerender(
      React.createElement(SidebarSessionList, {
        serverId: "server-1",
        agents,
        drafts,
      }),
    );

    const newerAfterDraft = screen.getByTestId("sidebar-session-server-1-newer-agent");
    const olderAfterDraft = screen.getByTestId("sidebar-session-server-1-older-agent");
    expect(
      newerAfterDraft.compareDocumentPosition(olderAfterDraft) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).not.toBe(0);
  });

  it("ignores draft-only rows instead of rendering incomplete session actions", () => {
    renderSidebarSessionList({
      serverId: "server-1",
      agents: [],
      drafts: [
        {
          serverId: "server-1",
          workspaceId: "workspace-project",
          draftId: "draft-1",
          cwd: "/repo/project",
          createdAt: new Date("2026-06-01T12:00:00.000Z"),
        },
      ],
    });

    expect(screen.getByText("No sessions yet")).not.toBeNull();
    expect(
      screen.queryByTestId("sidebar-session-draft-server-1-workspace-project-draft-1"),
    ).toBeNull();
    expect(screen.queryByTestId("sidebar-session-quick-pin-server-1-draft-1")).toBeNull();
    expect(screen.queryByTestId("sidebar-session-quick-archive-server-1-draft-1")).toBeNull();
    expect(screen.queryByTestId("sidebar-session-rename-server-1-draft-1")).toBeNull();
    expect(screen.queryByTestId("sidebar-session-delete-server-1-draft-1")).toBeNull();
  });

  it("renders pin and archive actions for every real desktop session row", () => {
    const agents = [
      agent({ id: "agent-1", cwd: "/repo/project", title: "First session" }),
      agent({ id: "agent-2", cwd: "/repo/other", title: "Second session" }),
    ];

    renderSidebarSessionList({ serverId: "server-1", agents });

    for (const visibleAgent of agents) {
      expect(
        screen.getByTestId(`sidebar-session-quick-pin-server-1-${visibleAgent.id}`),
      ).not.toBeNull();
      expect(
        screen.getByTestId(`sidebar-session-quick-archive-server-1-${visibleAgent.id}`),
      ).not.toBeNull();
    }
  });

  it("labels desktop quick actions with their session title", () => {
    const agents = [agent({ id: "agent-1", cwd: "/repo/project", title: "First session" })];

    renderSidebarSessionList({ serverId: "server-1", agents });

    expect(screen.getByLabelText("Pin First session")).not.toBeNull();
    expect(screen.getByLabelText("Archive First session")).not.toBeNull();
  });

  it("exposes selected state for the active desktop session row", () => {
    const agents = [agent({ id: "agent-1", cwd: "/repo/project", title: "First session" })];

    renderSidebarSessionList({
      serverId: "server-1",
      agents,
      selectedAgentId: "server-1:agent-1",
    });

    expect(
      screen.getByTestId("sidebar-session-server-1-agent-1").getAttribute("aria-selected"),
    ).toBe("true");
  });

  it("labels workspace new-session buttons with the workspace name", () => {
    const agents = [agent({ id: "agent-1", cwd: "/repo/project", title: "First session" })];

    renderSidebarSessionList({ serverId: "server-1", agents });

    expect(screen.getByLabelText("New session in project")).not.toBeNull();
  });

  it("keeps desktop row action targets large enough to click reliably", () => {
    const agents = [agent({ id: "agent-1", cwd: "/repo/project", title: "First session" })];

    renderSidebarSessionList({ serverId: "server-1", agents });

    const pinButton = screen.getByTestId("sidebar-session-quick-pin-server-1-agent-1");
    const archiveButton = screen.getByTestId("sidebar-session-quick-archive-server-1-agent-1");
    const newSessionButton = screen.getByTestId("sidebar-session-group-new-server-1-/repo/project");

    expect(Number.parseInt(pinButton.style.width, 10)).toBeGreaterThanOrEqual(28);
    expect(Number.parseInt(pinButton.style.height, 10)).toBeGreaterThanOrEqual(28);
    expect(Number.parseInt(archiveButton.style.width, 10)).toBeGreaterThanOrEqual(28);
    expect(Number.parseInt(archiveButton.style.height, 10)).toBeGreaterThanOrEqual(28);
    expect(Number.parseInt(newSessionButton.style.width, 10)).toBeGreaterThanOrEqual(28);
    expect(Number.parseInt(newSessionButton.style.height, 10)).toBeGreaterThanOrEqual(28);
  });

  it("does not nest desktop quick action buttons inside the session row button", () => {
    const agents = [agent({ id: "agent-1", cwd: "/repo/project", title: "First session" })];

    renderSidebarSessionList({ serverId: "server-1", agents });

    const row = screen.getByTestId("sidebar-session-server-1-agent-1");
    const pinButton = screen.getByTestId("sidebar-session-quick-pin-server-1-agent-1");
    const archiveButton = screen.getByTestId("sidebar-session-quick-archive-server-1-agent-1");

    expect(row.contains(pinButton)).toBe(false);
    expect(row.contains(archiveButton)).toBe(false);
  });

  it("renders load more action", () => {
    const handleLoadMore = vi.fn();
    const agents = [agent({ id: "agent-1", cwd: "/repo/project" })];
    renderSidebarSessionList({
      serverId: "server-1",
      agents,
      hasMore: true,
      onLoadMore: handleLoadMore,
    });

    fireEvent.click(screen.getByText("Load more sessions"));
    expect(handleLoadMore).toHaveBeenCalledTimes(1);
  });

  it("archives sessions from the row action", () => {
    const agents = [agent({ id: "agent-1", cwd: "/repo/project" })];
    renderSidebarSessionList({ serverId: "server-1", agents });

    fireEvent.click(screen.getByTestId("sidebar-session-quick-archive-server-1-agent-1"));

    expect(archiveAgentMock).toHaveBeenCalledWith({
      serverId: "server-1",
      agentId: "agent-1",
    });
  });

  it("pins sessions from the row action", async () => {
    const agents = [agent({ id: "agent-1", cwd: "/repo/project" })];
    getQueryDataMock.mockImplementation((queryKey: readonly unknown[]) => {
      if (JSON.stringify(queryKey) !== JSON.stringify(["agentHistory", "server-1"])) {
        return undefined;
      }
      return { pages: [{ agents: [agents[0]], pageInfo: { hasMore: false } }] };
    });
    renderSidebarSessionList({ serverId: "server-1", agents });

    fireEvent.click(screen.getByTestId("sidebar-session-quick-pin-server-1-agent-1"));

    expect(setQueryDataMock).toHaveBeenCalledWith(
      ["agentHistory", "server-1"],
      expect.any(Function),
    );
    const historyPatchCall = setQueryDataMock.mock.calls.find(
      ([queryKey]) => JSON.stringify(queryKey) === JSON.stringify(["agentHistory", "server-1"]),
    );
    const historyPatch = historyPatchCall?.[1] as
      | ((current: { pages: Array<{ agents: AggregatedAgent[] }> }) => unknown)
      | undefined;
    expect(historyPatch?.({ pages: [{ agents }] })).toEqual({
      pages: [
        {
          agents: [
            {
              ...agents[0],
              labels: { "chisacode.sidebarPinned": "true" },
            },
          ],
        },
      ],
    });
    await vi.waitFor(() => {
      expect(updateAgentMock).toHaveBeenCalledWith("agent-1", {
        labels: { "chisacode.sidebarPinned": "true" },
      });
    });
    expect(setAgentsMock).toHaveBeenCalled();
  });

  it("unpins sessions from the pinned section row action", async () => {
    const agents = [
      agent({
        id: "agent-1",
        cwd: "/repo/project",
        labels: { "chisacode.sidebarPinned": "true" },
      }),
    ];
    renderSidebarSessionList({ serverId: "server-1", agents });

    fireEvent.click(screen.getByTestId("sidebar-session-quick-pin-server-1-agent-1"));

    await vi.waitFor(() => {
      expect(updateAgentMock).toHaveBeenCalledWith("agent-1", {
        labels: { "chisacode.sidebarPinned": "false" },
      });
    });
    expect(setAgentsMock).toHaveBeenCalled();
  });

  it("optimistically pins only the clicked session", async () => {
    const agents = [
      agent({ id: "agent-1", cwd: "/repo/project", title: "First session" }),
      agent({ id: "agent-2", cwd: "/repo/project", title: "Second session" }),
    ];
    renderSidebarSessionList({ serverId: "server-1", agents });

    fireEvent.click(screen.getByTestId("sidebar-session-quick-pin-server-1-agent-2"));

    await vi.waitFor(() => {
      expect(updateAgentMock).toHaveBeenCalledWith("agent-2", {
        labels: { "chisacode.sidebarPinned": "true" },
      });
    });

    const [, updater] = setAgentsMock.mock.calls[0] as [
      string,
      (previous: Map<string, AggregatedAgent>) => Map<string, AggregatedAgent>,
    ];
    const next = updater(
      new Map([
        [agents[0].id, agents[0]],
        [agents[1].id, agents[1]],
      ]),
    );

    expect(next.get("agent-1")?.labels["chisacode.sidebarPinned"]).toBeUndefined();
    expect(next.get("agent-2")?.labels["chisacode.sidebarPinned"]).toBe("true");
  });

  it("rolls back only the clicked session when pinning fails", async () => {
    updateAgentMock.mockRejectedValueOnce(new Error("nope"));
    const agents = [
      agent({ id: "agent-1", cwd: "/repo/project", title: "First session" }),
      agent({ id: "agent-2", cwd: "/repo/project", title: "Second session" }),
    ];
    renderSidebarSessionList({ serverId: "server-1", agents });

    fireEvent.click(screen.getByTestId("sidebar-session-quick-pin-server-1-agent-2"));

    await vi.waitFor(() => {
      expect(toastErrorMock).toHaveBeenCalledWith("nope");
    });

    const [, rollbackUpdater] = setAgentsMock.mock.calls[1] as [
      string,
      (previous: Map<string, AggregatedAgent>) => Map<string, AggregatedAgent>,
    ];
    const next = rollbackUpdater(
      new Map([
        [agents[0].id, agents[0]],
        [
          agents[1].id,
          {
            ...agents[1],
            labels: { "chisacode.sidebarPinned": "true" },
          },
        ],
      ]),
    );

    expect(next.get("agent-1")?.labels["chisacode.sidebarPinned"]).toBeUndefined();
    expect(next.get("agent-2")?.labels["chisacode.sidebarPinned"]).toBe("false");
  });

  it("keeps the selected row background above hover styling", () => {
    const agents = [agent({ id: "agent-1", cwd: "/repo/project" })];
    renderSidebarSessionList({
      serverId: "server-1",
      agents,
      selectedAgentId: "server-1:agent-1",
    });

    const rowStyle = JSON.parse(
      screen.getByTestId("sidebar-session-server-1-agent-1").getAttribute("data-style") ?? "[]",
    ) as Array<{ backgroundColor?: string } | false>;
    const backgrounds = rowStyle
      .filter((entry): entry is { backgroundColor?: string } => Boolean(entry))
      .map((entry) => entry.backgroundColor)
      .filter(Boolean);

    expect(backgrounds.at(-1)).toBe(theme.colors.surface2);
  });

  it("uses stronger elevation to mark the selected session row", () => {
    const agents = [agent({ id: "agent-1", cwd: "/repo/project" })];
    renderSidebarSessionList({
      serverId: "server-1",
      agents,
      selectedAgentId: "server-1:agent-1",
    });

    const rowStyle = JSON.parse(
      screen.getByTestId("sidebar-session-server-1-agent-1").getAttribute("data-style") ?? "[]",
    ) as Array<{ shadowColor?: string; elevation?: number } | false>;

    expect(rowStyle).toContainEqual(
      expect.objectContaining({
        shadowColor: "rgba(0, 0, 0, 0.20)",
        elevation: 8,
      }),
    );
  });

  it("hides desktop quick actions until the session row is hovered", () => {
    const agents = [agent({ id: "agent-1", cwd: "/repo/project" })];
    renderSidebarSessionList({ serverId: "server-1", agents });

    const quickActions = screen.getByTestId("sidebar-session-quick-actions-server-1-agent-1");

    expect(quickActions.style.opacity).toBe("0");
  });

  it("reveals desktop quick actions when the pointer enters the session row", () => {
    const agents = [agent({ id: "agent-1", cwd: "/repo/project" })];
    renderSidebarSessionList({ serverId: "server-1", agents });

    const container = screen.getByTestId("sidebar-session-container-server-1-agent-1");
    const quickActions = screen.getByTestId("sidebar-session-quick-actions-server-1-agent-1");

    expect(quickActions.style.opacity).toBe("0");

    fireEvent.pointerEnter(container);

    expect(quickActions.style.opacity).toBe("");

    fireEvent.pointerLeave(container);

    expect(quickActions.style.opacity).toBe("0");
  });

  it("sorts pinned sessions before recent unpinned sessions", () => {
    const agents = [
      agent({
        id: "recent-agent",
        cwd: "/repo/project",
        title: "Recent session",
        lastActivityAt: new Date("2026-06-01T12:00:00.000Z"),
      }),
      agent({
        id: "pinned-agent",
        cwd: "/repo/project",
        title: "Pinned session",
        lastActivityAt: new Date("2026-06-01T09:00:00.000Z"),
        labels: { "chisacode.sidebarPinned": "true" },
      }),
    ];
    renderSidebarSessionList({ serverId: "server-1", agents });

    const pinned = screen.getByText("Pinned session");
    const recent = screen.getByText("Recent session");

    expect(pinned.compareDocumentPosition(recent) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);
  });

  it("renders pinned sessions in a separate top section across projects", () => {
    const agents = [
      agent({
        id: "recent-agent",
        cwd: "/repo/project-a",
        title: "Recent session",
        lastActivityAt: new Date("2026-06-01T12:00:00.000Z"),
      }),
      agent({
        id: "pinned-agent",
        cwd: "/repo/project-b",
        title: "Pinned session",
        lastActivityAt: new Date("2026-06-01T09:00:00.000Z"),
        labels: { "chisacode.sidebarPinned": "true" },
      }),
    ];
    renderSidebarSessionList({ serverId: "server-1", agents });

    const pinnedSection = screen.getByTestId("sidebar-session-group-__pinned__");
    const projectSection = screen.getByTestId("sidebar-session-group-/repo/project-a");
    const pinnedGroup = screen.getByText("Pinned");
    const projectGroup = screen.getByText("project-a");
    const pinned = screen.getByText("Pinned session");
    const recent = screen.getByText("Recent session");

    expect(within(pinnedSection).getByText("Pinned session")).not.toBeNull();
    expect(within(pinnedSection).queryByText("Recent session")).toBeNull();
    expect(within(projectSection).getByText("Recent session")).not.toBeNull();
    expect(within(projectSection).queryByText("Pinned session")).toBeNull();
    expect(
      pinnedGroup.compareDocumentPosition(projectGroup) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).not.toBe(0);
    expect(pinned.compareDocumentPosition(recent) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);
  });

  it("does not show the new draft button on the pinned section", () => {
    const agents = [
      agent({
        id: "pinned-agent",
        cwd: "/repo/project",
        title: "Pinned session",
        labels: { "chisacode.sidebarPinned": "true" },
      }),
    ];
    renderSidebarSessionList({ serverId: "server-1", agents });

    expect(screen.getByTestId("sidebar-session-group-__pinned__")).not.toBeNull();
    expect(screen.queryByTestId("sidebar-session-group-new-server-1-__pinned__")).toBeNull();
  });

  it("hides the pinned section when no sessions are pinned", () => {
    const agents = [agent({ id: "agent-1", cwd: "/repo/project", title: "Project session" })];
    renderSidebarSessionList({ serverId: "server-1", agents });

    expect(screen.queryByTestId("sidebar-session-group-__pinned__")).toBeNull();
    expect(screen.getByTestId("sidebar-session-group-/repo/project")).not.toBeNull();
  });

  it("deletes sessions after confirmation", async () => {
    const agents = [agent({ id: "agent-1", cwd: "/repo/project" })];
    renderSidebarSessionList({ serverId: "server-1", agents });

    fireEvent.click(screen.getByTestId("sidebar-session-delete-server-1-agent-1"));

    await vi.waitFor(() => {
      expect(confirmDialogMock).toHaveBeenCalled();
      expect(deleteAgentMock).toHaveBeenCalledWith("agent-1");
    });
    expect(setAgentsMock).toHaveBeenCalled();
  });

  it("copies the session cwd from the row menu", async () => {
    const agents = [agent({ id: "agent-1", cwd: "/repo/project" })];
    renderSidebarSessionList({ serverId: "server-1", agents });

    fireEvent.click(screen.getByTestId("sidebar-session-copy-path-server-1-agent-1"));

    await vi.waitFor(() => {
      expect(setStringAsyncMock).toHaveBeenCalledWith("/repo/project");
    });
    expect(toastCopiedMock).toHaveBeenCalledWith("Copied to clipboard.");
  });

  it("copies the session agent id from the row menu", async () => {
    const agents = [agent({ id: "agent-1", cwd: "/repo/project" })];
    renderSidebarSessionList({ serverId: "server-1", agents });

    fireEvent.click(screen.getByTestId("sidebar-session-copy-agent-id-server-1-agent-1"));

    await vi.waitFor(() => {
      expect(setStringAsyncMock).toHaveBeenCalledWith("agent-1");
    });
    expect(toastCopiedMock).toHaveBeenCalledWith("Copied to clipboard.");
  });

  it("renames sessions from the row menu", async () => {
    const agents = [agent({ id: "agent-1", cwd: "/repo/project" })];
    renderSidebarSessionList({ serverId: "server-1", agents });

    fireEvent.click(screen.getByTestId("sidebar-session-rename-server-1-agent-1"));
    fireEvent.click(screen.getByTestId("sidebar-session-rename-modal-server-1-agent-1"));

    await vi.waitFor(() => {
      expect(updateAgentMock).toHaveBeenCalledWith("agent-1", { name: "Renamed session" });
    });
    expect(invalidateQueriesMock).toHaveBeenCalledWith({
      queryKey: ["agentHistory", "server-1"],
    });
  });
});
