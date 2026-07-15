/**
 * @vitest-environment jsdom
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ProviderSnapshotEntry } from "@chisacode/protocol/agent-types";
import type { MutableDaemonConfig } from "@chisacode/protocol/messages";

const {
  theme,
  configState,
  snapshotState,
  patchConfigMock,
  refreshMock,
  confirmDialogMock,
  errorLogger,
} = vi.hoisted(() => ({
  theme: {
    spacing: { 1: 4, 2: 8, 3: 12, 4: 16 },
    iconSize: { sm: 14 },
    fontSize: { xs: 11, sm: 13 },
    fontWeight: { medium: "500" },
    borderRadius: { full: 999, lg: 8 },
    opacity: { 50: 0.5 },
    glass: { enabled: false },
    shadow: { sm: {}, md: {}, lg: {} },
    colors: {
      surface1: "#111",
      surface2: "#222",
      foreground: "#fff",
      foregroundMuted: "#aaa",
      border: "#555",
      destructive: "#f00",
    },
  },
  configState: {
    config: null as MutableDaemonConfig | null,
  },
  snapshotState: {
    entries: undefined as ProviderSnapshotEntry[] | undefined,
  },
  patchConfigMock: vi.fn<() => Promise<MutableDaemonConfig | undefined>>(async () => undefined),
  refreshMock: vi.fn<() => Promise<void>>(async () => undefined),
  confirmDialogMock: vi.fn(async () => true),
  errorLogger: { error: vi.fn() },
}));

vi.mock("react-native", () => ({
  View: ({ children, testID }: { children?: React.ReactNode; testID?: string; style?: unknown }) =>
    React.createElement("div", { "data-testid": testID }, children),
  Text: ({ children }: { children?: React.ReactNode }) =>
    React.createElement("span", null, children),
  TextInput: ({
    value,
    onChangeText,
    placeholder,
  }: {
    value?: string;
    onChangeText?: (value: string) => void;
    placeholder?: string;
  }) =>
    React.createElement("input", {
      value,
      placeholder,
      onInput: (event: React.FormEvent<HTMLInputElement>) =>
        onChangeText?.((event.target as HTMLInputElement).value),
    }),
  Pressable: ({
    children,
    onPress,
    disabled,
    accessibilityRole,
    accessibilityLabel,
    testID,
  }: {
    children?:
      | React.ReactNode
      | ((state: { pressed: boolean; hovered: boolean }) => React.ReactNode);
    onPress?: (event: React.MouseEvent) => void;
    disabled?: boolean;
    accessibilityRole?: string;
    accessibilityLabel?: string;
    testID?: string;
  }) =>
    React.createElement(
      "button",
      {
        type: "button",
        role: accessibilityRole,
        "aria-label": accessibilityLabel,
        "data-testid": testID,
        disabled,
        onClick: disabled ? undefined : onPress,
      },
      typeof children === "function" ? children({ pressed: false, hovered: false }) : children,
    ),
  Alert: { alert: vi.fn() },
}));

vi.mock("react-native-unistyles", () => ({
  StyleSheet: {
    create: (factory: unknown) => (typeof factory === "function" ? factory(theme) : factory),
  },
  useUnistyles: () => ({ theme }),
}));

vi.mock("lucide-react-native", () => {
  const icon = (name: string) => () => React.createElement("span", { "data-icon": name });
  return {
    Pencil: icon("Pencil"),
    Plus: icon("Plus"),
    RotateCw: icon("RotateCw"),
    Trash2: icon("Trash2"),
  };
});

vi.mock("@/constants/platform", () => ({ isWeb: true }));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, string>) => {
      const context = params?.context ?? "";
      const model = params?.model ?? "";
      const provider = params?.provider ?? "";
      const ready = params?.ready ?? "";
      const total = params?.total ?? "";
      const translations: Record<string, string> = {
        "common.cancel": "Cancel",
        "common.delete": "Delete",
        "common.save": "Save",
        "customModelProviders.add": "Add",
        "customModelProviders.addCustomProvider": "Add custom provider",
        "customModelProviders.addModel": "Add model",
        "customModelProviders.apiKey": "API key",
        "customModelProviders.contextBadge": `${context} context`,
        "customModelProviders.contextPlaceholder": "Context tokens, e.g. 200000",
        "customModelProviders.deleteConfirmMessage": `Disable ${provider}`,
        "customModelProviders.deleteConfirmTitle": "Delete custom provider?",
        "customModelProviders.deleteFailed": "Failed to delete custom provider",
        "customModelProviders.deleteModel": `Delete ${model}`,
        "customModelProviders.deleteProvider": `Delete ${provider}`,
        "customModelProviders.editCustomProvider": "Edit custom provider",
        "customModelProviders.editModel": `Edit ${model}`,
        "customModelProviders.editProvider": `Edit ${provider}`,
        "customModelProviders.empty": "No custom providers yet",
        "customModelProviders.modelList": "Model list",
        "customModelProviders.noModels": "No models yet",
        "customModelProviders.notTested": "Not tested",
        "customModelProviders.partiallyReady": `${ready}/${total} ready`,
        "customModelProviders.testFailedShort": "Test failed",
        "customModelProviders.providerId": "Provider ID",
        "customModelProviders.providerLabel": "Display name",
        "customModelProviders.saveFailed": "Failed to save custom provider",
        "customModelProviders.saveUnavailable": "Host is not connected",
        "customModelProviders.saving": "Saving...",
        "customModelProviders.saveBeforeTesting": "Save before testing",
        "customModelProviders.supportsImages": "Recognizes images",
        "customModelProviders.supportsImagesBadge": "Images",
        "customModelProviders.test": "Test",
        "customModelProviders.testingModel": `Testing ${model}`,
        "customModelProviders.testQueued": `${model} test started`,
        "customModelProviders.testModel": `Test ${model}`,
        "customModelProviders.testing": "Testing...",
        "customModelProviders.title": "Custom providers",
        "providers.ready": "Ready",
        "providers.loading": "Loading",
      };
      return translations[key] ?? key;
    },
  }),
}));

vi.mock("@/components/adaptive-modal-sheet", () => ({
  AdaptiveModalSheet: ({
    header,
    visible,
    children,
  }: {
    header: { title: string };
    visible: boolean;
    children?: React.ReactNode;
  }) =>
    visible
      ? React.createElement(
          "section",
          { "data-testid": "custom-provider-editor-sheet" },
          React.createElement("h2", null, header.title),
          children,
        )
      : null,
  AdaptiveTextInput: ({
    initialValue,
    onChangeText,
    placeholder,
  }: {
    initialValue?: string;
    onChangeText?: (value: string) => void;
    placeholder?: string;
  }) =>
    React.createElement("input", {
      defaultValue: initialValue,
      placeholder,
      onInput: (event: React.FormEvent<HTMLInputElement>) =>
        onChangeText?.((event.target as HTMLInputElement).value),
    }),
}));

vi.mock("@/components/ui/button", () => ({
  Button: ({
    children,
    onPress,
    disabled,
  }: {
    children?: React.ReactNode;
    onPress?: () => void;
    disabled?: boolean;
  }) =>
    React.createElement(
      "button",
      { type: "button", disabled, onClick: disabled ? undefined : onPress },
      children,
    ),
}));

vi.mock("@/components/ui/segmented-control", () => ({
  SegmentedControl: () => React.createElement("div", { "data-testid": "segmented-control" }),
}));

vi.mock("@/components/ui/switch", () => ({
  Switch: ({ value, onValueChange }: { value: boolean; onValueChange?: (next: boolean) => void }) =>
    React.createElement("input", {
      type: "checkbox",
      checked: value,
      onChange: () => undefined,
      onClick: (event: React.MouseEvent<HTMLInputElement>) =>
        onValueChange?.((event.target as HTMLInputElement).checked),
    }),
}));

vi.mock("@/screens/settings/settings-section", () => ({
  SettingsSection: ({
    title,
    trailing,
    children,
  }: {
    title: string;
    trailing?: React.ReactNode;
    children?: React.ReactNode;
  }) =>
    React.createElement(
      "section",
      null,
      React.createElement("h1", null, title),
      trailing,
      children,
    ),
}));

vi.mock("@/utils/confirm-dialog", () => ({
  confirmDialog: confirmDialogMock,
}));

vi.mock("@/hooks/use-daemon-config", () => ({
  useDaemonConfig: () => ({
    config: configState.config,
    patchConfig: patchConfigMock,
  }),
}));

vi.mock("@/hooks/use-providers-snapshot", () => ({
  useProvidersSnapshot: () => ({
    entries: snapshotState.entries,
    refresh: refreshMock,
  }),
}));

import { CustomModelProvidersSection } from "@/screens/settings/custom-model-providers-section";

function makeConfig(): MutableDaemonConfig {
  return {
    mcp: { injectIntoAgents: false },
    providers: {},
    modelGateways: {
      zai: {
        id: "zai",
        label: "ZAI",
        enabled: true,
        models: [
          {
            id: "glm-5",
            label: "GLM 5",
            isDefault: true,
            contextWindowMaxTokens: 200_000,
            supportsImages: true,
          },
        ],
        syntheticModels: [],
        upstreams: {
          anthropic: {
            enabled: true,
            baseUrl: "https://api.z.ai/api/anthropic",
            apiKey: "secret",
          },
          chatCompletions: {
            enabled: false,
            baseUrl: "",
            apiKey: "",
          },
          responses: {
            enabled: false,
            baseUrl: "",
            apiKey: "",
          },
        },
      },
    },
    metadataGeneration: { providers: [] },
    autoArchiveAfterMerge: false,
    appendSystemPrompt: "",
    skills: { global: { disabledSkillNames: [] }, providers: {}, agents: {}, installedSources: {} },
    mcpServers: { servers: {}, global: { disabledServerNames: [] }, providers: {}, agents: {} },
  };
}

describe("CustomModelProvidersSection", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    configState.config = makeConfig();
    snapshotState.entries = [];
    patchConfigMock.mockReset();
    patchConfigMock.mockResolvedValue(makeConfig());
    refreshMock.mockReset();
    refreshMock.mockResolvedValue(undefined);
    errorLogger.error.mockReset();
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("shows structured model rows with context, image support, and row actions", () => {
    act(() => {
      root.render(<CustomModelProvidersSection serverId="server-1" />);
    });

    const editProvider = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Edit ZAI"]',
    );
    expect(editProvider).not.toBeNull();

    act(() => {
      editProvider!.click();
    });

    expect(container.textContent).toContain("Model list");
    expect(container.textContent).toContain("glm-5");
    expect(container.textContent).toContain("20万 context");
    expect(container.textContent).toContain("Images");
    expect(container.querySelector('button[aria-label="Test glm-5"]')).not.toBeNull();
    expect(container.querySelector('button[aria-label="Edit glm-5"]')).not.toBeNull();
    expect(container.querySelector('button[aria-label="Delete glm-5"]')).not.toBeNull();
  });

  it("summarizes generated provider status without exposing raw availability errors", () => {
    snapshotState.entries = [
      {
        provider: "zai-claude",
        status: "ready",
        enabled: true,
      },
      {
        provider: "zai-codex",
        status: "error",
        enabled: true,
        error: "Timed out checking zai Codex availability after 30000ms",
      },
      {
        provider: "zai-opencode",
        status: "error",
        enabled: true,
        error: "Unknown error",
      },
    ];

    act(() => {
      root.render(<CustomModelProvidersSection serverId="server-1" />);
    });

    expect(container.textContent).toContain("1/3 ready");
    expect(container.textContent).not.toContain("Timed out checking");
    expect(container.textContent).not.toContain("Unknown error");
  });

  it("closes the editor after saving without waiting for provider refresh", async () => {
    refreshMock.mockImplementationOnce(() => new Promise(() => undefined));

    act(() => {
      root.render(<CustomModelProvidersSection serverId="server-1" />);
    });

    const editProvider = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Edit ZAI"]',
    );
    expect(editProvider).not.toBeNull();

    act(() => {
      editProvider!.click();
    });

    const saveButton = Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find(
      (button) => button.textContent === "Save",
    );
    expect(saveButton).not.toBeUndefined();

    await act(async () => {
      saveButton!.click();
      await Promise.resolve();
    });

    expect(patchConfigMock).toHaveBeenCalledTimes(1);
    expect(refreshMock).toHaveBeenCalledTimes(1);
    expect(container.querySelector('[data-testid="custom-provider-editor-sheet"]')).toBeNull();
  });

  it("keeps save failures visible inside the provider editor", async () => {
    const error = new Error("Gateway rejected config");
    patchConfigMock.mockRejectedValueOnce(error);

    act(() => {
      root.render(<CustomModelProvidersSection serverId="server-1" errorLogger={errorLogger} />);
    });

    const editProvider = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Edit ZAI"]',
    );
    expect(editProvider).not.toBeNull();

    act(() => {
      editProvider!.click();
    });

    const saveButton = Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find(
      (button) => button.textContent === "Save",
    );
    expect(saveButton).not.toBeUndefined();

    await act(async () => {
      saveButton!.click();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(container.querySelector('[data-testid="custom-provider-editor-sheet"]')).not.toBeNull();
    expect(container.textContent).toContain("Gateway rejected config");
    expect(errorLogger.error).toHaveBeenCalledWith(
      "[CustomModelProviders] Failed to save custom provider",
      error,
    );
  });

  it("shows visible feedback when testing a saved model row", async () => {
    let resolveRefresh: (() => void) | null = null;
    refreshMock.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          resolveRefresh = resolve;
        }),
    );

    act(() => {
      root.render(<CustomModelProvidersSection serverId="server-1" />);
    });

    const editProvider = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Edit ZAI"]',
    );
    expect(editProvider).not.toBeNull();

    act(() => {
      editProvider!.click();
    });

    const testButton = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Test glm-5"]',
    );
    expect(testButton).not.toBeNull();

    act(() => {
      testButton!.click();
    });

    expect(container.textContent).toContain("Testing glm-5");

    await act(async () => {
      resolveRefresh?.();
      await Promise.resolve();
    });

    expect(container.textContent).toContain("glm-5 test started");
  });
});
