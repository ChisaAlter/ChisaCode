/**
 * @vitest-environment jsdom
 */
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { PendingPermission } from "@/types/shared";

vi.mock("@/styles/theme", () => ({
  ICON_SIZE: { sm: 14, md: 16 },
}));

vi.mock("@/constants/theme", () => ({
  Fonts: { mono: "monospace", sans: "sans-serif" },
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock("@tanstack/react-query", () => ({
  useMutation: () => ({
    mutateAsync: vi.fn().mockResolvedValue(undefined),
    isPending: false,
    reset: vi.fn(),
  }),
}));

vi.mock("@/agent-stream/permission-response", () => ({
  submitPermissionResponse: vi.fn().mockResolvedValue(true),
}));

vi.mock("@/components/tool-call-details", () => ({
  ToolCallDetailsContent: () => <div data-testid="tool-detail-stub" />,
}));

vi.mock("@/components/plan-card", () => ({
  PlanCard: ({ testID }: { testID?: string }) => <div data-testid={testID ?? "plan-stub"} />,
}));

vi.mock("@/components/question-form-card", () => ({
  QuestionFormCard: () => <div data-testid="question-stub" />,
}));

vi.mock("@/components/ui/tooltip", () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  TooltipContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("lucide-react-native", () => {
  const Icon = () => <span />;
  return {
    AlertTriangle: Icon,
    Check: Icon,
    ChevronLeft: Icon,
    ChevronRight: Icon,
    X: Icon,
  };
});

vi.mock("react-native-unistyles", () => ({
  StyleSheet: {
    create: (factory: (theme: unknown) => unknown) =>
      typeof factory === "function"
        ? factory({
            colors: {
              foreground: "#000",
              foregroundMuted: "#666",
              background: "#fff",
              border: "#ddd",
              surface0: "#fff",
              surface1: "#f5f5f5",
              statusWarning: "#a50",
              statusDanger: "#c00",
            },
            fontWeight: { semibold: "600" },
            spacing: {},
          })
        : factory,
  },
  withUnistyles: (Component: unknown) => Component,
}));

import { submitPermissionResponse } from "@/agent-stream/permission-response";
import { PendingApprovalPanel } from "./pending-approval-panel";

function permission(
  overrides: Partial<PendingPermission["request"]> & { id?: string; key?: string } = {},
): PendingPermission {
  const { id = "req-1", key = "k1", ...request } = overrides;
  return {
    key,
    agentId: "agent-1",
    request: {
      id,
      provider: "mock",
      name: "Bash",
      kind: "tool",
      title: "Run command",
      detail: { type: "shell", command: "ls" },
      ...request,
    },
  };
}

const EMPTY: PendingPermission[] = [];
const SINGLE = [permission()];
const MULTI = [
  permission({ id: "a", key: "ka", title: "First" }),
  permission({
    id: "b",
    key: "kb",
    title: "Second",
    detail: { type: "read", filePath: "/b.ts" },
  }),
];
const PLAN = [
  permission({
    kind: "plan",
    title: "Plan",
    metadata: { planText: "# Steps" },
    detail: undefined,
  }),
];
const QUESTION = [permission({ kind: "question", title: "Ask", detail: undefined })];

describe("PendingApprovalPanel", () => {
  beforeEach(() => {
    vi.mocked(submitPermissionResponse).mockClear();
  });

  it("renders nothing when the queue is empty", () => {
    const { container } = render(<PendingApprovalPanel permissions={EMPTY} client={null} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders title, kind, and detail for a shell approval", () => {
    render(<PendingApprovalPanel permissions={SINGLE} client={null} />);
    expect(screen.getByTestId("pending-approval-panel")).toBeTruthy();
    expect(screen.getByText("Run command")).toBeTruthy();
    expect(screen.getByTestId("permission-request-question")).toBeTruthy();
    expect(screen.getByTestId("permission-request-accept")).toBeTruthy();
    expect(screen.getByTestId("permission-request-deny")).toBeTruthy();
    expect(screen.getByTestId("permission-request-always-allow")).toBeTruthy();
  });

  it("pages between multiple approvals", () => {
    render(<PendingApprovalPanel permissions={MULTI} client={null} />);
    expect(screen.getByTestId("pending-approval-panel-count").textContent).toBe("1/2");
    fireEvent.click(screen.getByTestId("pending-approval-panel-next"));
    expect(screen.getByText("Second")).toBeTruthy();
    expect(screen.getByTestId("pending-approval-panel-count").textContent).toBe("2/2");
  });

  it("invokes accept through submitPermissionResponse", () => {
    render(<PendingApprovalPanel permissions={SINGLE} client={null} />);
    fireEvent.click(screen.getByTestId("permission-request-accept"));
    expect(submitPermissionResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        agentId: "agent-1",
        requestId: "req-1",
        response: { behavior: "allow", selectedActionId: "accept" },
      }),
    );
  });

  it("invokes reject through submitPermissionResponse", () => {
    render(<PendingApprovalPanel permissions={SINGLE} client={null} />);
    fireEvent.click(screen.getByTestId("permission-request-deny"));
    expect(submitPermissionResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        response: expect.objectContaining({ behavior: "deny", selectedActionId: "reject" }),
      }),
    );
  });

  it("invokes always-allow with allow_always action id", () => {
    render(<PendingApprovalPanel permissions={SINGLE} client={null} />);
    fireEvent.click(screen.getByTestId("permission-request-always-allow"));
    expect(submitPermissionResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        response: { behavior: "allow", selectedActionId: "allow_always" },
      }),
    );
  });

  it("renders a plan card for plan permissions", () => {
    render(<PendingApprovalPanel permissions={PLAN} client={null} />);
    expect(screen.getByTestId("permission-plan-card")).toBeTruthy();
  });

  it("renders the question form for question permissions", () => {
    render(<PendingApprovalPanel permissions={QUESTION} client={null} />);
    expect(screen.getByTestId("question-stub")).toBeTruthy();
  });

  it("hides the pager for a single approval", () => {
    render(<PendingApprovalPanel permissions={SINGLE} client={null} />);
    expect(screen.queryByTestId("pending-approval-panel-pager")).toBeNull();
  });

  it("disables previous on the first item", () => {
    render(<PendingApprovalPanel permissions={MULTI} client={null} />);
    expect(screen.getByTestId("pending-approval-panel-prev")).toHaveProperty("disabled", true);
  });
});
