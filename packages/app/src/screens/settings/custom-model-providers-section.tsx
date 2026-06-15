import { Pencil, Plus, RotateCw, Trash2 } from "lucide-react-native";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Pressable,
  Text,
  TextInput,
  View,
  type PressableStateCallbackType,
} from "react-native";
import { useTranslation } from "react-i18next";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import {
  AdaptiveModalSheet,
  AdaptiveTextInput,
  type SheetHeader,
} from "@/components/adaptive-modal-sheet";
import { Button } from "@/components/ui/button";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Switch } from "@/components/ui/switch";
import { isWeb } from "@/constants/platform";
import { useDaemonConfig } from "@/hooks/use-daemon-config";
import { useProvidersSnapshot } from "@/hooks/use-providers-snapshot";
import { SettingsSection } from "@/screens/settings/settings-section";
import { settingsStyles } from "@/styles/settings";
import { confirmDialog } from "@/utils/confirm-dialog";
import {
  buildDisableCustomModelProviderPatch,
  buildModelGatewayProviderIds,
  buildSaveCustomModelProviderPatch,
  collectCustomModelProviders,
  type CollectedCustomModelProvider,
  type CustomModelProviderModelInput,
  type CustomOpenAIWireApi,
} from "@/screens/settings/custom-model-providers";
import type { AgentProvider, ProviderSnapshotEntry } from "@chisacode/protocol/agent-types";
import type { MutableDaemonConfig } from "@chisacode/protocol/messages";

interface CustomModelProvidersSectionProps {
  serverId: string;
}

interface EditingProviderState {
  mode: "add" | "edit";
  provider: CollectedCustomModelProvider | null;
}

interface ProviderEditorValues {
  id: string;
  label: string;
  anthropicEnabled: boolean;
  anthropicBaseUrl: string;
  anthropicApiKey: string;
  openaiEnabled: boolean;
  openaiBaseUrl: string;
  openaiApiKey: string;
  openaiWireApi: CustomOpenAIWireApi;
  responsesEnabled: boolean;
  responsesBaseUrl: string;
  responsesApiKey: string;
  models: CustomModelProviderModelInput[];
}

interface ModelEditorDraft {
  id: string;
  label?: string;
  contextWindowText: string;
  supportsImages: boolean;
}

interface ModelEditorState {
  index: number | null;
  draft: ModelEditorDraft;
}

const EDITOR_SNAP_POINTS = ["84%", "94%"];
const WIRE_API_OPTIONS = [
  { value: "responses" as const, label: "Responses" },
  { value: "chat" as const, label: "Chat" },
];

function formatContextWindow(tokens: number | undefined): string | null {
  if (tokens === undefined || !Number.isFinite(tokens) || tokens <= 0) {
    return null;
  }
  if (tokens >= 10_000) {
    return `${Math.round(tokens / 10_000)}万`;
  }
  return String(tokens);
}

function parseContextWindow(value: string): number | undefined {
  const normalized = value.trim().replace(/[,，_\s]/gu, "");
  if (!normalized) {
    return undefined;
  }
  const numberValue = Number(normalized);
  if (!Number.isFinite(numberValue) || numberValue <= 0) {
    return undefined;
  }
  return Math.trunc(numberValue);
}

function createEmptyModelDraft(): ModelEditorDraft {
  return {
    id: "",
    contextWindowText: "",
    supportsImages: false,
  };
}

function createModelDraft(model: CustomModelProviderModelInput): ModelEditorDraft {
  return {
    id: model.id,
    label: model.label,
    contextWindowText:
      model.contextWindowMaxTokens === undefined ? "" : String(model.contextWindowMaxTokens),
    supportsImages: model.supportsImages === true,
  };
}

function normalizeModelDraft(draft: ModelEditorDraft): CustomModelProviderModelInput | null {
  const id = draft.id.trim();
  if (!id) {
    return null;
  }
  const contextWindowMaxTokens = parseContextWindow(draft.contextWindowText);
  return {
    id,
    ...(draft.label?.trim() ? { label: draft.label.trim() } : {}),
    ...(contextWindowMaxTokens !== undefined ? { contextWindowMaxTokens } : {}),
    ...(draft.supportsImages ? { supportsImages: true } : {}),
  };
}

function readProviderEnv(
  config: MutableDaemonConfig | null,
  providerId: string | undefined,
  envKey: string,
): string {
  if (!providerId) return "";
  const provider = (
    config?.providers as Record<string, { env?: Record<string, unknown> }> | undefined
  )?.[providerId];
  const value = provider?.env?.[envKey];
  return typeof value === "string" ? value : "";
}

function readGatewayApiKey(
  config: MutableDaemonConfig | null,
  gatewayId: string,
  upstream: "anthropic" | "chatCompletions" | "responses",
): string {
  const value = config?.modelGateways?.[gatewayId]?.upstreams?.[upstream]?.apiKey;
  return typeof value === "string" ? value : "";
}

function statusText(
  entry: ProviderSnapshotEntry | undefined,
  t: ReturnType<typeof useTranslation>["t"],
): string {
  if (!entry) return t("customModelProviders.notTested");
  if (entry.status === "ready") return t("providers.ready");
  if (entry.status === "loading") return t("providers.loading");
  if (entry.status === "error") return entry.error ?? t("providers.error");
  return t("providers.missing");
}

function CustomProviderRow({
  provider,
  snapshotById,
  testing,
  onEdit,
  onDelete,
  onTest,
}: {
  provider: CollectedCustomModelProvider;
  snapshotById: Map<string, ProviderSnapshotEntry>;
  testing: boolean;
  onEdit: (provider: CollectedCustomModelProvider) => void;
  onDelete: (provider: CollectedCustomModelProvider) => void;
  onTest: (provider: CollectedCustomModelProvider) => void;
}) {
  const { theme } = useUnistyles();
  const { t } = useTranslation();
  const handleEdit = useCallback(() => onEdit(provider), [onEdit, provider]);
  const handleDelete = useCallback(() => onDelete(provider), [onDelete, provider]);
  const handleTest = useCallback(() => onTest(provider), [onTest, provider]);
  const actionButtonStyle = useCallback(
    ({ hovered, pressed }: PressableStateCallbackType & { hovered?: boolean }) => [
      styles.iconButton,
      (Boolean(hovered) || pressed) && styles.iconButtonHovered,
      testing ? styles.disabled : null,
    ],
    [testing],
  );
  const statuses = provider.providerIds
    .map((providerId) => statusText(snapshotById.get(providerId), t))
    .join(" / ");

  return (
    <View style={styles.providerRow} testID={`custom-provider-row-${provider.id}`}>
      <View style={styles.providerTextColumn}>
        <Text style={settingsStyles.rowTitle} numberOfLines={1}>
          {provider.label}
        </Text>
        <Text style={styles.monoHint} numberOfLines={1} selectable>
          {provider.id}
        </Text>
        <Text style={settingsStyles.rowHint} numberOfLines={2}>
          {provider.models.map((model) => model.id).join(", ")}
        </Text>
        <Text style={styles.statusHint} numberOfLines={2}>
          {statuses || t("customModelProviders.notTested")}
        </Text>
      </View>
      <View style={styles.rowActions}>
        <Button
          variant="outline"
          size="sm"
          leftIcon={RotateCw}
          onPress={handleTest}
          disabled={testing}
        >
          {testing ? t("customModelProviders.testing") : t("customModelProviders.test")}
        </Button>
        <Pressable
          onPress={handleEdit}
          hitSlop={8}
          style={actionButtonStyle}
          accessibilityRole="button"
          accessibilityLabel={t("customModelProviders.editProvider", { provider: provider.label })}
        >
          <Pencil size={theme.iconSize.sm} color={theme.colors.foregroundMuted} />
        </Pressable>
        <Pressable
          onPress={handleDelete}
          hitSlop={8}
          style={actionButtonStyle}
          accessibilityRole="button"
          accessibilityLabel={t("customModelProviders.deleteProvider", {
            provider: provider.label,
          })}
        >
          <Trash2 size={theme.iconSize.sm} color={theme.colors.destructive} />
        </Pressable>
      </View>
    </View>
  );
}

function createEmptyEditorValues(): ProviderEditorValues {
  return {
    id: "",
    label: "",
    anthropicEnabled: true,
    anthropicBaseUrl: "",
    anthropicApiKey: "",
    openaiEnabled: true,
    openaiBaseUrl: "",
    openaiApiKey: "",
    openaiWireApi: "responses",
    responsesEnabled: false,
    responsesBaseUrl: "",
    responsesApiKey: "",
    models: [],
  };
}

function createEditorValuesFromProvider(
  provider: CollectedCustomModelProvider,
  config: MutableDaemonConfig | null,
): ProviderEditorValues {
  return {
    id: provider.id,
    label: provider.label,
    anthropicEnabled: provider.anthropic?.enabled ?? false,
    anthropicBaseUrl: provider.anthropic?.baseUrl ?? "",
    anthropicApiKey:
      readGatewayApiKey(config, provider.id, "anthropic") ||
      readProviderEnv(config, provider.anthropic?.providerId, "ANTHROPIC_AUTH_TOKEN"),
    openaiEnabled: provider.openai?.enabled ?? false,
    openaiBaseUrl: provider.openai?.baseUrl ?? "",
    openaiApiKey:
      readGatewayApiKey(config, provider.id, "chatCompletions") ||
      readProviderEnv(config, provider.openai?.providerId, "OPENAI_API_KEY"),
    openaiWireApi: provider.openai?.wireApi ?? "responses",
    responsesEnabled: provider.responses?.enabled ?? false,
    responsesBaseUrl: provider.responses?.baseUrl ?? "",
    responsesApiKey: readGatewayApiKey(config, provider.id, "responses"),
    models: provider.models.map((model) => ({
      id: model.id,
      label: model.label,
      contextWindowMaxTokens: model.contextWindowMaxTokens,
      supportsImages: model.supportsImages,
    })),
  };
}

function ProviderTextField({
  label,
  value,
  resetKey,
  placeholder,
  placeholderColor,
  secureTextEntry,
  onChangeText,
}: {
  label: string;
  value: string;
  resetKey: string;
  placeholder: string;
  placeholderColor: string;
  secureTextEntry?: boolean;
  onChangeText: (value: string) => void;
}) {
  return (
    <View style={styles.fieldGroup}>
      <Text style={styles.formLabel}>{label}</Text>
      <AdaptiveTextInput
        initialValue={value}
        resetKey={resetKey}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={placeholderColor}
        secureTextEntry={secureTextEntry}
        autoCapitalize="none"
        autoCorrect={false}
        // @ts-expect-error - outlineStyle is web-only
        style={FORM_INPUT_STYLE}
      />
    </View>
  );
}

function EndpointEditorCard({
  title,
  enabled,
  baseUrl,
  apiKey,
  apiKeyPlaceholder,
  baseUrlPlaceholder,
  resetPrefix,
  placeholderColor,
  wireApi,
  onEnabledChange,
  onBaseUrlChange,
  onApiKeyChange,
  onWireApiChange,
}: {
  title: string;
  enabled: boolean;
  baseUrl: string;
  apiKey: string;
  apiKeyPlaceholder: string;
  baseUrlPlaceholder: string;
  resetPrefix: string;
  placeholderColor: string;
  wireApi?: CustomOpenAIWireApi;
  onEnabledChange: (value: boolean) => void;
  onBaseUrlChange: (value: string) => void;
  onApiKeyChange: (value: string) => void;
  onWireApiChange?: (value: CustomOpenAIWireApi) => void;
}) {
  return (
    <View style={styles.endpointCard}>
      <View style={styles.endpointHeader}>
        <Text style={settingsStyles.rowTitle}>{title}</Text>
        <Switch value={enabled} onValueChange={onEnabledChange} />
      </View>
      <AdaptiveTextInput
        initialValue={baseUrl}
        resetKey={`${resetPrefix}-base`}
        onChangeText={onBaseUrlChange}
        placeholder={baseUrlPlaceholder}
        placeholderTextColor={placeholderColor}
        autoCapitalize="none"
        // @ts-expect-error - outlineStyle is web-only
        style={FORM_INPUT_STYLE}
      />
      <AdaptiveTextInput
        initialValue={apiKey}
        resetKey={`${resetPrefix}-key`}
        onChangeText={onApiKeyChange}
        placeholder={apiKeyPlaceholder}
        placeholderTextColor={placeholderColor}
        secureTextEntry
        autoCapitalize="none"
        // @ts-expect-error - outlineStyle is web-only
        style={FORM_INPUT_STYLE}
      />
      {wireApi && onWireApiChange ? (
        <SegmentedControl
          size="sm"
          value={wireApi}
          onValueChange={onWireApiChange}
          options={WIRE_API_OPTIONS}
        />
      ) : null}
    </View>
  );
}

function ModelListRow({
  model,
  index,
  testing,
  onEdit,
  onDelete,
  onTest,
}: {
  model: CustomModelProviderModelInput;
  index: number;
  testing: boolean;
  onEdit: (index: number) => void;
  onDelete: (index: number) => void;
  onTest: (model: CustomModelProviderModelInput) => void;
}) {
  const { theme } = useUnistyles();
  const { t } = useTranslation();
  const actionButtonStyle = useCallback(
    ({ hovered, pressed }: PressableStateCallbackType & { hovered?: boolean }) => [
      styles.iconButton,
      (Boolean(hovered) || pressed) && styles.iconButtonHovered,
    ],
    [],
  );
  const testButtonStyle = useCallback(
    ({ hovered, pressed }: PressableStateCallbackType & { hovered?: boolean }) => [
      ...actionButtonStyle({ hovered, pressed }),
      testing ? styles.disabled : null,
    ],
    [actionButtonStyle, testing],
  );
  const handleEdit = useCallback(() => onEdit(index), [index, onEdit]);
  const handleDelete = useCallback(() => onDelete(index), [index, onDelete]);
  const handleTest = useCallback(() => onTest(model), [model, onTest]);
  const contextLabel = formatContextWindow(model.contextWindowMaxTokens);

  return (
    <View style={styles.modelRow} testID={`custom-provider-model-row-${model.id}`}>
      <View style={styles.modelTextColumn}>
        <Text style={settingsStyles.rowTitle} numberOfLines={1}>
          {model.id}
        </Text>
        <View style={styles.modelBadges}>
          {contextLabel ? (
            <Text style={styles.modelBadge}>
              {t("customModelProviders.contextBadge", { context: contextLabel })}
            </Text>
          ) : null}
          {model.supportsImages ? (
            <Text style={styles.modelBadge}>{t("customModelProviders.supportsImagesBadge")}</Text>
          ) : null}
        </View>
      </View>
      <View style={styles.modelRowActions}>
        <Pressable
          onPress={handleTest}
          disabled={testing}
          hitSlop={8}
          style={testButtonStyle}
          accessibilityRole="button"
          accessibilityLabel={t("customModelProviders.testModel", {
            model: model.id,
          })}
        >
          <RotateCw
            size={theme.iconSize.sm}
            color={testing ? theme.colors.accent : theme.colors.foregroundMuted}
          />
        </Pressable>
        <Pressable
          onPress={handleEdit}
          hitSlop={8}
          style={actionButtonStyle}
          accessibilityRole="button"
          accessibilityLabel={t("customModelProviders.editModel", {
            model: model.id,
          })}
        >
          <Pencil size={theme.iconSize.sm} color={theme.colors.foregroundMuted} />
        </Pressable>
        <Pressable
          onPress={handleDelete}
          hitSlop={8}
          style={actionButtonStyle}
          accessibilityRole="button"
          accessibilityLabel={t("customModelProviders.deleteModel", {
            model: model.id,
          })}
        >
          <Trash2 size={theme.iconSize.sm} color={theme.colors.destructive} />
        </Pressable>
      </View>
    </View>
  );
}

function ModelListField({
  models,
  editor,
  testingModelId,
  testMessage,
  placeholderColor,
  onAdd,
  onEdit,
  onDelete,
  onTest,
  onDraftChange,
  onCancelEdit,
  onSaveEdit,
}: {
  models: CustomModelProviderModelInput[];
  editor: ModelEditorState | null;
  testingModelId: string | null;
  testMessage: string | null;
  placeholderColor: string;
  onAdd: () => void;
  onEdit: (index: number) => void;
  onDelete: (index: number) => void;
  onTest: (model: CustomModelProviderModelInput) => void;
  onDraftChange: (draft: ModelEditorDraft) => void;
  onCancelEdit: () => void;
  onSaveEdit: () => void;
}) {
  const { t } = useTranslation();

  const updateDraftId = useCallback(
    (id: string) => {
      if (!editor) return;
      onDraftChange({ ...editor.draft, id });
    },
    [editor, onDraftChange],
  );
  const updateDraftContext = useCallback(
    (contextWindowText: string) => {
      if (!editor) return;
      onDraftChange({ ...editor.draft, contextWindowText });
    },
    [editor, onDraftChange],
  );
  const updateDraftVision = useCallback(
    (supportsImages: boolean) => {
      if (!editor) return;
      onDraftChange({ ...editor.draft, supportsImages });
    },
    [editor, onDraftChange],
  );

  return (
    <View style={styles.fieldGroup}>
      <View style={styles.modelsHeader}>
        <Text style={styles.formLabel}>{t("customModelProviders.modelList")}</Text>
        <Button variant="outline" size="sm" leftIcon={Plus} onPress={onAdd}>
          {t("customModelProviders.addModel")}
        </Button>
      </View>
      <View style={styles.modelList}>
        {models.length > 0 ? (
          models.map((model, index) => (
            <ModelListRow
              key={model.id}
              model={model}
              index={index}
              testing={testingModelId === model.id}
              onEdit={onEdit}
              onDelete={onDelete}
              onTest={onTest}
            />
          ))
        ) : (
          <View style={styles.emptyModelRow}>
            <Text style={styles.emptyText}>{t("customModelProviders.noModels")}</Text>
          </View>
        )}
      </View>
      {testMessage ? <Text style={styles.statusHint}>{testMessage}</Text> : null}
      {editor ? (
        <View style={styles.modelEditorPanel}>
          <Text style={settingsStyles.rowTitle}>
            {editor.index === null
              ? t("customModelProviders.addModel")
              : t("customModelProviders.editModel", {
                  model: models[editor.index]?.id ?? editor.draft.id,
                })}
          </Text>
          <TextInput
            value={editor.draft.id}
            onChangeText={updateDraftId}
            placeholder="glm-5"
            placeholderTextColor={placeholderColor}
            autoCapitalize="none"
            autoCorrect={false}
            style={styles.formInput}
          />
          <TextInput
            value={editor.draft.contextWindowText}
            onChangeText={updateDraftContext}
            placeholder={t("customModelProviders.contextPlaceholder")}
            placeholderTextColor={placeholderColor}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="number-pad"
            style={styles.formInput}
          />
          <View style={styles.modelSwitchRow}>
            <Text style={styles.formLabel}>{t("customModelProviders.supportsImages")}</Text>
            <Switch value={editor.draft.supportsImages} onValueChange={updateDraftVision} />
          </View>
          <View style={styles.formActions}>
            <Button variant="secondary" size="sm" onPress={onCancelEdit}>
              {t("common.cancel")}
            </Button>
            <Button variant="default" size="sm" onPress={onSaveEdit}>
              {t("common.save")}
            </Button>
          </View>
        </View>
      ) : null}
    </View>
  );
}

function ProviderEditorSheet({
  state,
  config,
  onClose,
  onSave,
  onTestGateway,
}: {
  state: EditingProviderState | null;
  config: MutableDaemonConfig | null;
  onClose: () => void;
  onSave: (values: ProviderEditorValues, previousId: string | null) => Promise<void>;
  onTestGateway: (gatewayId: string) => Promise<void>;
}) {
  const { theme } = useUnistyles();
  const { t } = useTranslation();
  const [values, setValues] = useState<ProviderEditorValues>(createEmptyEditorValues);
  const [modelEditor, setModelEditor] = useState<ModelEditorState | null>(null);
  const [modelTestMessage, setModelTestMessage] = useState<string | null>(null);
  const [testingModelId, setTestingModelId] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const visible = state !== null;
  const previousId = state?.provider?.id ?? null;
  const resetSeed = `${previousId ?? "new"}-${state?.mode ?? "closed"}`;

  useEffect(() => {
    if (!state) {
      return;
    }
    const provider = state.provider;
    setValues(
      provider ? createEditorValuesFromProvider(provider, config) : createEmptyEditorValues(),
    );
    setModelEditor(null);
    setModelTestMessage(null);
    setTestingModelId(null);
    setFormError(null);
  }, [config, state]);

  const setFieldValue = useCallback(
    <K extends keyof ProviderEditorValues>(key: K, value: ProviderEditorValues[K]) => {
      setValues((current) => ({ ...current, [key]: value }));
    },
    [],
  );
  const handleIdChange = useCallback(
    (value: string) => setFieldValue("id", value),
    [setFieldValue],
  );
  const handleLabelChange = useCallback(
    (value: string) => setFieldValue("label", value),
    [setFieldValue],
  );
  const handleAnthropicEnabledChange = useCallback(
    (value: boolean) => setFieldValue("anthropicEnabled", value),
    [setFieldValue],
  );
  const handleAnthropicBaseUrlChange = useCallback(
    (value: string) => setFieldValue("anthropicBaseUrl", value),
    [setFieldValue],
  );
  const handleAnthropicApiKeyChange = useCallback(
    (value: string) => setFieldValue("anthropicApiKey", value),
    [setFieldValue],
  );
  const handleOpenaiEnabledChange = useCallback(
    (value: boolean) => setFieldValue("openaiEnabled", value),
    [setFieldValue],
  );
  const handleOpenaiBaseUrlChange = useCallback(
    (value: string) => setFieldValue("openaiBaseUrl", value),
    [setFieldValue],
  );
  const handleOpenaiApiKeyChange = useCallback(
    (value: string) => setFieldValue("openaiApiKey", value),
    [setFieldValue],
  );
  const handleOpenaiWireApiChange = useCallback(
    (value: CustomOpenAIWireApi) => setFieldValue("openaiWireApi", value),
    [setFieldValue],
  );
  const handleResponsesEnabledChange = useCallback(
    (value: boolean) => setFieldValue("responsesEnabled", value),
    [setFieldValue],
  );
  const handleResponsesBaseUrlChange = useCallback(
    (value: string) => setFieldValue("responsesBaseUrl", value),
    [setFieldValue],
  );
  const handleResponsesApiKeyChange = useCallback(
    (value: string) => setFieldValue("responsesApiKey", value),
    [setFieldValue],
  );
  const handleAddModel = useCallback(() => {
    setFormError(null);
    setModelEditor({ index: null, draft: createEmptyModelDraft() });
  }, []);
  const handleEditModel = useCallback(
    (index: number) => {
      setModelEditor((current) => {
        if (current?.index === index) {
          return current;
        }
        const model = values.models[index];
        return model ? { index, draft: createModelDraft(model) } : null;
      });
    },
    [values.models],
  );
  const handleDeleteModel = useCallback((index: number) => {
    setFormError(null);
    setValues((current) => ({
      ...current,
      models: current.models.filter((_, modelIndex) => modelIndex !== index),
    }));
    setModelEditor((current) => (current?.index === index ? null : current));
  }, []);
  const handleModelDraftChange = useCallback((draft: ModelEditorDraft) => {
    setModelEditor((current) => (current ? { ...current, draft } : current));
  }, []);
  const handleCancelModelEdit = useCallback(() => {
    setModelEditor(null);
  }, []);
  const handleSaveModelEdit = useCallback(() => {
    if (!modelEditor) {
      return;
    }
    const model = normalizeModelDraft(modelEditor.draft);
    if (!model) {
      Alert.alert(t("customModelProviders.modelRequired"));
      return;
    }
    setValues((current) => {
      const models =
        modelEditor.index === null
          ? [...current.models, model]
          : current.models.map((entry, index) => (index === modelEditor.index ? model : entry));
      return { ...current, models };
    });
    setModelEditor(null);
  }, [modelEditor, t]);
  const handleTestModel = useCallback(
    (model: CustomModelProviderModelInput) => {
      const gatewayId = values.id.trim();
      const savedGatewayId = previousId?.trim().toLowerCase() ?? "";
      if (!gatewayId || state?.mode !== "edit" || savedGatewayId !== gatewayId.toLowerCase()) {
        setModelTestMessage(t("customModelProviders.saveBeforeTesting"));
        return;
      }
      setModelTestMessage(t("customModelProviders.testingModel", { model: model.id }));
      setTestingModelId(model.id);
      void onTestGateway(gatewayId)
        .then(() => {
          setModelTestMessage(t("customModelProviders.testQueued", { model: model.id }));
          return undefined;
        })
        .catch((error) => {
          setModelTestMessage(error instanceof Error ? error.message : String(error));
        })
        .finally(() => {
          setTestingModelId((current) => (current === model.id ? null : current));
        });
    },
    [onTestGateway, previousId, state?.mode, t, values.id],
  );
  const handleSave = useCallback(() => {
    if (saving) return;
    setFormError(null);
    setSaving(true);
    void onSave(values, previousId)
      .catch((error) => {
        setFormError(error instanceof Error ? error.message : String(error));
      })
      .finally(() => setSaving(false));
  }, [onSave, previousId, saving, values]);
  const header = useMemo<SheetHeader>(
    () => ({
      title:
        state?.mode === "edit"
          ? t("customModelProviders.editCustomProvider")
          : t("customModelProviders.addCustomProvider"),
    }),
    [state?.mode, t],
  );
  const canSave = values.id.trim().length > 0 && values.models.length > 0;

  return (
    <AdaptiveModalSheet
      header={header}
      visible={visible}
      onClose={onClose}
      desktopMaxWidth={520}
      snapPoints={EDITOR_SNAP_POINTS}
      testID="custom-provider-editor-sheet"
    >
      <View style={styles.formGroup}>
        <View style={styles.fieldRow}>
          <ProviderTextField
            label={t("customModelProviders.providerId")}
            value={values.id}
            resetKey={`custom-provider-id-${resetSeed}`}
            onChangeText={handleIdChange}
            placeholder="zai"
            placeholderColor={theme.colors.foregroundMuted}
          />
          <ProviderTextField
            label={t("customModelProviders.providerLabel")}
            value={values.label}
            resetKey={`custom-provider-label-${resetSeed}`}
            onChangeText={handleLabelChange}
            placeholder="ZAI"
            placeholderColor={theme.colors.foregroundMuted}
          />
        </View>
        <EndpointEditorCard
          title="Anthropic Messages"
          enabled={values.anthropicEnabled}
          baseUrl={values.anthropicBaseUrl}
          apiKey={values.anthropicApiKey}
          apiKeyPlaceholder={t("customModelProviders.apiKey")}
          baseUrlPlaceholder="https://api.example.com/anthropic"
          resetPrefix={`anthropic-${resetSeed}`}
          placeholderColor={theme.colors.foregroundMuted}
          onEnabledChange={handleAnthropicEnabledChange}
          onBaseUrlChange={handleAnthropicBaseUrlChange}
          onApiKeyChange={handleAnthropicApiKeyChange}
        />
        <EndpointEditorCard
          title="Chat Completions"
          enabled={values.openaiEnabled}
          baseUrl={values.openaiBaseUrl}
          apiKey={values.openaiApiKey}
          apiKeyPlaceholder={t("customModelProviders.apiKey")}
          baseUrlPlaceholder="https://api.example.com/v1"
          resetPrefix={`openai-${resetSeed}`}
          placeholderColor={theme.colors.foregroundMuted}
          wireApi={values.openaiWireApi}
          onEnabledChange={handleOpenaiEnabledChange}
          onBaseUrlChange={handleOpenaiBaseUrlChange}
          onApiKeyChange={handleOpenaiApiKeyChange}
          onWireApiChange={handleOpenaiWireApiChange}
        />
        <EndpointEditorCard
          title="Responses"
          enabled={values.responsesEnabled}
          baseUrl={values.responsesBaseUrl}
          apiKey={values.responsesApiKey}
          apiKeyPlaceholder={t("customModelProviders.apiKey")}
          baseUrlPlaceholder="https://api.example.com/v1"
          resetPrefix={`responses-${resetSeed}`}
          placeholderColor={theme.colors.foregroundMuted}
          onEnabledChange={handleResponsesEnabledChange}
          onBaseUrlChange={handleResponsesBaseUrlChange}
          onApiKeyChange={handleResponsesApiKeyChange}
        />
        <ModelListField
          models={values.models}
          editor={modelEditor}
          testingModelId={testingModelId}
          testMessage={modelTestMessage}
          placeholderColor={theme.colors.foregroundMuted}
          onAdd={handleAddModel}
          onEdit={handleEditModel}
          onDelete={handleDeleteModel}
          onTest={handleTestModel}
          onDraftChange={handleModelDraftChange}
          onCancelEdit={handleCancelModelEdit}
          onSaveEdit={handleSaveModelEdit}
        />
        {formError ? <Text style={styles.formError}>{formError}</Text> : null}
        <View style={styles.formActions}>
          <Button variant="secondary" size="sm" onPress={onClose} disabled={saving}>
            {t("common.cancel")}
          </Button>
          <Button
            variant="default"
            size="sm"
            onPress={handleSave}
            disabled={!canSave || saving}
            loading={saving}
          >
            {saving ? t("customModelProviders.saving") : t("common.save")}
          </Button>
        </View>
      </View>
    </AdaptiveModalSheet>
  );
}

export function CustomModelProvidersSection({ serverId }: CustomModelProvidersSectionProps) {
  const { theme } = useUnistyles();
  const { t } = useTranslation();
  const { config, patchConfig } = useDaemonConfig(serverId);
  const { entries, refresh } = useProvidersSnapshot(serverId);
  const [editorState, setEditorState] = useState<EditingProviderState | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);
  const providers = useMemo(
    () => collectCustomModelProviders(config?.modelGateways, config?.providers),
    [config?.modelGateways, config?.providers],
  );
  const snapshotById = useMemo(
    () => new Map((entries ?? []).map((entry) => [entry.provider, entry])),
    [entries],
  );
  const openAdd = useCallback(() => setEditorState({ mode: "add", provider: null }), []);
  const openEdit = useCallback(
    (provider: CollectedCustomModelProvider) => setEditorState({ mode: "edit", provider }),
    [],
  );
  const closeEditor = useCallback(() => setEditorState(null), []);
  const handleSave = useCallback(
    async (values: ProviderEditorValues, previousId: string | null) => {
      const patch = buildSaveCustomModelProviderPatch({
        currentGateways: config?.modelGateways,
        previousId,
        id: values.id,
        label: values.label,
        models: values.models,
        anthropic: {
          enabled: values.anthropicEnabled,
          baseUrl: values.anthropicBaseUrl,
          apiKey: values.anthropicApiKey,
        },
        openai: {
          enabled: values.openaiEnabled,
          baseUrl: values.openaiBaseUrl,
          apiKey: values.openaiApiKey,
          wireApi: values.openaiWireApi,
        },
        responses: {
          enabled: values.responsesEnabled,
          baseUrl: values.responsesBaseUrl,
          apiKey: values.responsesApiKey,
        },
      });
      const updatedConfig = await patchConfig(patch);
      if (!updatedConfig) {
        throw new Error(t("customModelProviders.saveUnavailable"));
      }
      setEditorState(null);
      const ids = buildModelGatewayProviderIds(values.id);
      void refresh([
        ids.claudeProviderId,
        ids.codexProviderId,
        ids.opencodeProviderId,
      ] as AgentProvider[]).catch((error) => {
        console.warn("[CustomModelProviders] Failed to refresh providers after save", error);
      });
    },
    [config?.modelGateways, patchConfig, refresh, t],
  );
  const handleTestGatewayId = useCallback(
    async (gatewayId: string) => {
      const ids = buildModelGatewayProviderIds(gatewayId);
      await refresh([
        ids.claudeProviderId,
        ids.codexProviderId,
        ids.opencodeProviderId,
      ] as AgentProvider[]);
    },
    [refresh],
  );
  const handleTest = useCallback(
    (provider: CollectedCustomModelProvider) => {
      setTestingId(provider.id);
      void refresh(provider.providerIds as AgentProvider[]).finally(() => {
        setTestingId((current) => (current === provider.id ? null : current));
      });
    },
    [refresh],
  );
  const handleDelete = useCallback(
    (provider: CollectedCustomModelProvider) => {
      void (async () => {
        const confirmed = await confirmDialog({
          title: t("customModelProviders.deleteConfirmTitle"),
          message: t("customModelProviders.deleteConfirmMessage", { provider: provider.label }),
          confirmLabel: t("common.delete"),
          cancelLabel: t("common.cancel"),
          destructive: true,
        });
        if (!confirmed) return;
        const patch = buildDisableCustomModelProviderPatch(provider.id);
        await patchConfig(patch);
        const ids = buildModelGatewayProviderIds(provider.id);
        await refresh([
          ids.claudeProviderId,
          ids.codexProviderId,
          ids.opencodeProviderId,
        ] as AgentProvider[]);
      })().catch((error) => {
        Alert.alert(
          t("customModelProviders.deleteFailed"),
          error instanceof Error ? error.message : String(error),
        );
      });
    },
    [patchConfig, refresh, t],
  );
  const headerActions = useMemo(
    () => (
      <Pressable
        onPress={openAdd}
        hitSlop={8}
        style={settingsStyles.sectionHeaderLink}
        accessibilityRole="button"
        accessibilityLabel={t("customModelProviders.addCustomProvider")}
      >
        <Plus size={theme.iconSize.sm} color={theme.colors.foregroundMuted} />
        <Text style={settingsStyles.sectionHeaderLinkText}>{t("customModelProviders.add")}</Text>
      </Pressable>
    ),
    [openAdd, t, theme.colors.foregroundMuted, theme.iconSize.sm],
  );

  return (
    <>
      <SettingsSection
        title={t("customModelProviders.title")}
        trailing={headerActions}
        style={styles.sectionSpacing}
      >
        {providers.length > 0 ? (
          <View style={settingsStyles.card}>
            {providers.map((provider, index) => (
              <View key={provider.id} style={index === 0 ? undefined : styles.providerRowBorder}>
                <CustomProviderRow
                  provider={provider}
                  snapshotById={snapshotById}
                  testing={testingId === provider.id}
                  onEdit={openEdit}
                  onDelete={handleDelete}
                  onTest={handleTest}
                />
              </View>
            ))}
          </View>
        ) : (
          <View style={EMPTY_CARD_STYLE}>
            <Text style={styles.emptyText}>{t("customModelProviders.empty")}</Text>
          </View>
        )}
      </SettingsSection>
      <ProviderEditorSheet
        state={editorState}
        config={config}
        onClose={closeEditor}
        onSave={handleSave}
        onTestGateway={handleTestGatewayId}
      />
    </>
  );
}

const styles = StyleSheet.create((theme) => ({
  sectionSpacing: {
    marginBottom: theme.spacing[4],
  },
  emptyCard: {
    padding: theme.spacing[4],
  },
  emptyText: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
  },
  providerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing[3],
    paddingVertical: theme.spacing[4],
    paddingHorizontal: theme.spacing[4],
  },
  providerRowBorder: {
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  providerTextColumn: {
    flex: 1,
    minWidth: 0,
    gap: theme.spacing[1],
  },
  monoHint: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
  },
  statusHint: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
  },
  rowActions: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    justifyContent: "flex-end",
    gap: theme.spacing[1],
  },
  iconButton: {
    width: 30,
    height: 30,
    borderRadius: theme.borderRadius.full,
    alignItems: "center",
    justifyContent: "center",
  },
  iconButtonHovered: {
    backgroundColor: theme.colors.surface2,
  },
  disabled: {
    opacity: theme.opacity[50],
  },
  formGroup: {
    gap: theme.spacing[4],
  },
  fieldRow: {
    flexDirection: "row",
    gap: theme.spacing[3],
  },
  fieldGroup: {
    flex: 1,
    gap: theme.spacing[2],
  },
  formLabel: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.medium,
  },
  formInput: {
    backgroundColor: theme.colors.surface2,
    borderRadius: theme.borderRadius.lg,
    paddingHorizontal: theme.spacing[4],
    paddingVertical: theme.spacing[3],
    color: theme.colors.foreground,
    borderWidth: 1,
    borderColor: theme.colors.border,
    fontSize: theme.fontSize.sm,
  },
  endpointCard: {
    gap: theme.spacing[3],
    padding: theme.spacing[3],
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  endpointHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  modelsHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing[2],
  },
  modelList: {
    gap: theme.spacing[2],
  },
  modelRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing[3],
    padding: theme.spacing[3],
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  modelTextColumn: {
    flex: 1,
    minWidth: 0,
    gap: theme.spacing[2],
  },
  modelBadges: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: theme.spacing[1],
  },
  modelBadge: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.full,
    paddingHorizontal: theme.spacing[2],
    paddingVertical: theme.spacing[1],
  },
  modelRowActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1],
  },
  emptyModelRow: {
    padding: theme.spacing[3],
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  modelEditorPanel: {
    gap: theme.spacing[3],
    padding: theme.spacing[3],
    borderRadius: theme.borderRadius.lg,
    backgroundColor: theme.colors.surface1,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  modelSwitchRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing[3],
  },
  formError: {
    color: theme.colors.destructive,
    fontSize: theme.fontSize.sm,
  },
  formActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: theme.spacing[2],
  },
}));

const EMPTY_CARD_STYLE = [settingsStyles.card, styles.emptyCard];
const FORM_INPUT_STYLE = [styles.formInput, isWeb && { outlineStyle: "none" }];
