import { Brain, Pencil, Plus, Trash2 } from "lucide-react-native";
import { useCallback, useEffect, useMemo, useState } from "react";
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
import { Switch } from "@/components/ui/switch";
import { isWeb } from "@/constants/platform";
import { useDaemonConfig } from "@/hooks/use-daemon-config";
import { SettingsSection } from "@/screens/settings/settings-section";
import {
  buildDeleteSyntheticModelPatch,
  buildSaveSyntheticModelPatch,
  collectSyntheticModelGateways,
  collectSyntheticModels,
  type SelectableSyntheticGateway,
  type SyntheticModelEntry,
} from "@/screens/settings/synthetic-models";
import { settingsStyles } from "@/styles/settings";
import { confirmDialog } from "@/utils/confirm-dialog";

interface SyntheticModelsSectionProps {
  serverId: string;
}

interface EditingSyntheticModelState {
  mode: "add" | "edit";
  model: SyntheticModelEntry | null;
}

interface SyntheticModelEditorValues {
  gatewayId: string;
  id: string;
  label: string;
  description: string;
  references: string[];
  aggregatorModel: string;
  roundsText: string;
}

interface PreviousSyntheticModelRef {
  gatewayId: string;
  id: string;
}

const EDITOR_SNAP_POINTS = ["82%", "94%"];
const EMPTY_PROVIDER_MODELS: SelectableSyntheticGateway["models"] = [];

function createDefaultValues(gateways: SelectableSyntheticGateway[]): SyntheticModelEditorValues {
  const firstGateway = gateways[0];
  const firstModels = firstGateway?.models ?? [];
  return {
    gatewayId: firstGateway?.id ?? "",
    id: "",
    label: "",
    description: "",
    references: firstModels.slice(0, 2).map((model) => model.id),
    aggregatorModel: firstModels[0]?.id ?? "",
    roundsText: "1",
  };
}

function createValuesFromModel(model: SyntheticModelEntry): SyntheticModelEditorValues {
  return {
    gatewayId: model.gatewayId,
    id: model.id,
    label: model.label,
    description: model.description ?? "",
    references: model.references.map((reference) => reference.model),
    aggregatorModel: model.aggregatorModel,
    roundsText: String(model.rounds ?? 1),
  };
}

function createValuesForState(
  state: EditingSyntheticModelState,
  gateways: SelectableSyntheticGateway[],
): SyntheticModelEditorValues {
  if (state.model) {
    return createValuesFromModel(state.model);
  }
  return createDefaultValues(gateways);
}

function getPreviousSyntheticModelRef(
  model: SyntheticModelEntry | null | undefined,
): PreviousSyntheticModelRef | null {
  if (!model) {
    return null;
  }
  return { gatewayId: model.gatewayId, id: model.id };
}

function getEditorTitleKey(mode: EditingSyntheticModelState["mode"] | undefined): string {
  return mode === "edit"
    ? "syntheticModels.editSyntheticModel"
    : "syntheticModels.addSyntheticModel";
}

function canSaveSyntheticModel(values: SyntheticModelEditorValues, saving: boolean): boolean {
  return (
    values.id.trim().length > 0 &&
    values.references.length >= 2 &&
    values.aggregatorModel.trim().length > 0 &&
    !saving
  );
}

function getSelectedGatewayModels(
  gateways: SelectableSyntheticGateway[],
  gatewayId: string,
): SelectableSyntheticGateway["models"] {
  return gateways.find((gateway) => gateway.id === gatewayId)?.models ?? EMPTY_PROVIDER_MODELS;
}

function toggleReference(references: string[], modelId: string, selected: boolean): string[] {
  const next = new Set(references);
  if (selected) {
    next.add(modelId);
  } else {
    next.delete(modelId);
  }
  return Array.from(next).sort();
}

function parseRounds(value: string): number {
  const parsed = Number(value.trim());
  if (!Number.isFinite(parsed)) {
    return 1;
  }
  return Math.max(1, Math.min(4, Math.trunc(parsed)));
}

function SyntheticModelRow({
  model,
  onEdit,
  onDelete,
}: {
  model: SyntheticModelEntry;
  onEdit: (model: SyntheticModelEntry) => void;
  onDelete: (model: SyntheticModelEntry) => void;
}) {
  const { theme } = useUnistyles();
  const { t } = useTranslation();
  const handleEdit = useCallback(() => onEdit(model), [model, onEdit]);
  const handleDelete = useCallback(() => onDelete(model), [model, onDelete]);
  const buttonStyle = useCallback(
    ({ hovered, pressed }: PressableStateCallbackType & { hovered?: boolean }) => [
      styles.iconButton,
      (Boolean(hovered) || pressed) && styles.iconButtonHovered,
    ],
    [],
  );

  return (
    <View style={styles.modelRow} testID={`synthetic-model-row-${model.id}`}>
      <View style={styles.modelTextColumn}>
        <Text style={settingsStyles.rowTitle} numberOfLines={1}>
          {model.label}
        </Text>
        <Text style={styles.modelIdText} numberOfLines={1} selectable>
          {model.id} · {model.gatewayLabel}
        </Text>
        <Text style={settingsStyles.rowHint} numberOfLines={2}>
          {t("syntheticModels.referencesSummary", {
            count: model.references.length,
            aggregator: model.aggregatorModel,
          })}
        </Text>
      </View>
      <View style={styles.rowActions}>
        <Pressable
          onPress={handleEdit}
          hitSlop={8}
          style={buttonStyle}
          accessibilityRole="button"
          accessibilityLabel={t("syntheticModels.editModel", { model: model.label })}
        >
          <Pencil size={theme.iconSize.sm} color={theme.colors.foregroundMuted} />
        </Pressable>
        <Pressable
          onPress={handleDelete}
          hitSlop={8}
          style={buttonStyle}
          accessibilityRole="button"
          accessibilityLabel={t("syntheticModels.deleteModel", { model: model.label })}
        >
          <Trash2 size={theme.iconSize.sm} color={theme.colors.destructive} />
        </Pressable>
      </View>
    </View>
  );
}

function GatewayOptionRow({
  gateway,
  selected,
  bordered,
  onSelect,
}: {
  gateway: SelectableSyntheticGateway;
  selected: boolean;
  bordered: boolean;
  onSelect: (gateway: SelectableSyntheticGateway) => void;
}) {
  const { t } = useTranslation();
  const rowStyle = useMemo(
    () => [styles.optionRow, bordered && settingsStyles.rowBorder],
    [bordered],
  );
  const accessibilityState = useMemo(() => ({ selected }), [selected]);
  const handleSelect = useCallback(() => onSelect(gateway), [gateway, onSelect]);

  return (
    <Pressable
      onPress={handleSelect}
      style={rowStyle}
      accessibilityRole="button"
      accessibilityState={accessibilityState}
    >
      <View style={settingsStyles.rowContent}>
        <Text style={settingsStyles.rowTitle}>{gateway.label}</Text>
        <Text style={settingsStyles.rowHint}>
          {t("syntheticModels.modelCount", { count: gateway.models.length })}
        </Text>
      </View>
      <Switch value={selected} onValueChange={handleSelect} />
    </Pressable>
  );
}

function GatewayPicker({
  gateways,
  selectedGatewayId,
  onSelect,
}: {
  gateways: SelectableSyntheticGateway[];
  selectedGatewayId: string;
  onSelect: (gateway: SelectableSyntheticGateway) => void;
}) {
  const { t } = useTranslation();

  return (
    <View style={styles.fieldGroup}>
      <Text style={styles.formLabel}>{t("syntheticModels.provider")}</Text>
      <View style={settingsStyles.card}>
        {gateways.length > 0 ? (
          gateways.map((gateway, index) => (
            <GatewayOptionRow
              key={gateway.id}
              gateway={gateway}
              selected={gateway.id === selectedGatewayId}
              bordered={index > 0}
              onSelect={onSelect}
            />
          ))
        ) : (
          <View style={styles.emptyCard}>
            <Text style={settingsStyles.rowHint}>{t("syntheticModels.noProviders")}</Text>
          </View>
        )}
      </View>
    </View>
  );
}

function ReferenceModelOptionRow({
  model,
  selected,
  aggregator,
  bordered,
  onToggleReference,
  onSelectAggregator,
}: {
  model: SelectableSyntheticGateway["models"][number];
  selected: boolean;
  aggregator: boolean;
  bordered: boolean;
  onToggleReference: (modelId: string, selected: boolean) => void;
  onSelectAggregator: (modelId: string) => void;
}) {
  const { t } = useTranslation();
  const rowStyle = useMemo(
    () => [styles.optionRow, bordered && settingsStyles.rowBorder],
    [bordered],
  );
  const handleAggregatorPress = useCallback(
    () => onSelectAggregator(model.id),
    [model.id, onSelectAggregator],
  );
  const handleReferenceChange = useCallback(
    (nextSelected: boolean) => onToggleReference(model.id, nextSelected),
    [model.id, onToggleReference],
  );

  return (
    <View style={rowStyle}>
      <View style={settingsStyles.rowContent}>
        <Text style={settingsStyles.rowTitle} numberOfLines={1}>
          {model.label}
        </Text>
        <Text style={settingsStyles.rowHint} numberOfLines={1}>
          {model.id}
        </Text>
      </View>
      <Button
        variant={aggregator ? "secondary" : "ghost"}
        size="sm"
        onPress={handleAggregatorPress}
      >
        {t("syntheticModels.aggregator")}
      </Button>
      <Switch value={selected} onValueChange={handleReferenceChange} />
    </View>
  );
}

function ReferenceModelsPicker({
  models,
  references,
  aggregatorModel,
  onToggleReference,
  onSelectAggregator,
}: {
  models: SelectableSyntheticGateway["models"];
  references: string[];
  aggregatorModel: string;
  onToggleReference: (modelId: string, selected: boolean) => void;
  onSelectAggregator: (modelId: string) => void;
}) {
  const { t } = useTranslation();

  return (
    <View style={styles.fieldGroup}>
      <Text style={styles.formLabel}>{t("syntheticModels.referenceModels")}</Text>
      <View style={settingsStyles.card}>
        {models.map((model, index) => (
          <ReferenceModelOptionRow
            key={model.id}
            model={model}
            selected={references.includes(model.id)}
            aggregator={aggregatorModel === model.id}
            bordered={index > 0}
            onToggleReference={onToggleReference}
            onSelectAggregator={onSelectAggregator}
          />
        ))}
      </View>
    </View>
  );
}

function SyntheticModelEditorSheet({
  state,
  gateways,
  onClose,
  onSave,
}: {
  state: EditingSyntheticModelState | null;
  gateways: SelectableSyntheticGateway[];
  onClose: () => void;
  onSave: (
    values: SyntheticModelEditorValues,
    previous: PreviousSyntheticModelRef | null,
  ) => Promise<void>;
}) {
  const { theme } = useUnistyles();
  const { t } = useTranslation();
  const [values, setValues] = useState<SyntheticModelEditorValues>(() =>
    createDefaultValues(gateways),
  );
  const [saving, setSaving] = useState(false);
  const visible = state !== null;
  const previous = useMemo(() => getPreviousSyntheticModelRef(state?.model), [state?.model]);
  const selectedGatewayModels = useMemo(
    () => getSelectedGatewayModels(gateways, values.gatewayId),
    [gateways, values.gatewayId],
  );

  useEffect(() => {
    if (!state) {
      return;
    }
    setValues(createValuesForState(state, gateways));
    setSaving(false);
  }, [gateways, state]);

  const setFieldValue = useCallback(
    <K extends keyof SyntheticModelEditorValues>(key: K, value: SyntheticModelEditorValues[K]) => {
      setValues((current) => ({ ...current, [key]: value }));
    },
    [],
  );

  const handleGatewaySelect = useCallback((gateway: SelectableSyntheticGateway) => {
    setValues((current) => ({
      ...current,
      gatewayId: gateway.id,
      references: gateway.models.slice(0, 2).map((model) => model.id),
      aggregatorModel: gateway.models[0]?.id ?? "",
    }));
  }, []);
  const handleIdChange = useCallback(
    (value: string) => setFieldValue("id", value),
    [setFieldValue],
  );
  const handleLabelChange = useCallback(
    (value: string) => setFieldValue("label", value),
    [setFieldValue],
  );
  const handleDescriptionChange = useCallback(
    (value: string) => setFieldValue("description", value),
    [setFieldValue],
  );
  const handleRoundsChange = useCallback(
    (value: string) => setFieldValue("roundsText", value.replace(/[^\d]/g, "")),
    [setFieldValue],
  );
  const handleToggleReference = useCallback((modelId: string, selected: boolean) => {
    setValues((current) => ({
      ...current,
      references: toggleReference(current.references, modelId, selected),
    }));
  }, []);
  const handleAggregatorSelect = useCallback((modelId: string) => {
    setValues((current) => ({ ...current, aggregatorModel: modelId }));
  }, []);
  const handleSave = useCallback(() => {
    if (saving) return;
    setSaving(true);
    void onSave(values, previous).finally(() => setSaving(false));
  }, [onSave, previous, saving, values]);
  const header = useMemo<SheetHeader>(
    () => ({
      title: t(getEditorTitleKey(state?.mode)),
    }),
    [state?.mode, t],
  );
  const canSave = canSaveSyntheticModel(values, saving);

  return (
    <AdaptiveModalSheet
      header={header}
      visible={visible}
      onClose={onClose}
      desktopMaxWidth={520}
      snapPoints={EDITOR_SNAP_POINTS}
      testID="synthetic-model-editor-sheet"
    >
      <View style={styles.formGroup}>
        <GatewayPicker
          gateways={gateways}
          selectedGatewayId={values.gatewayId}
          onSelect={handleGatewaySelect}
        />
        <View style={styles.fieldRow}>
          <View style={styles.fieldGroup}>
            <Text style={styles.formLabel}>{t("syntheticModels.modelId")}</Text>
            <AdaptiveTextInput
              initialValue={values.id}
              resetKey={`synthetic-id-${state?.mode ?? "closed"}-${previous?.id ?? "new"}`}
              onChangeText={handleIdChange}
              placeholder="moa-coder"
              placeholderTextColor={theme.colors.foregroundMuted}
              autoCapitalize="none"
              autoCorrect={false}
              // @ts-expect-error - outlineStyle is web-only
              style={FORM_INPUT_STYLE}
            />
          </View>
          <View style={styles.fieldGroup}>
            <Text style={styles.formLabel}>{t("syntheticModels.modelLabel")}</Text>
            <AdaptiveTextInput
              initialValue={values.label}
              resetKey={`synthetic-label-${state?.mode ?? "closed"}-${previous?.id ?? "new"}`}
              onChangeText={handleLabelChange}
              placeholder={t("syntheticModels.modelLabelPlaceholder")}
              placeholderTextColor={theme.colors.foregroundMuted}
              autoCapitalize="none"
              autoCorrect={false}
              // @ts-expect-error - outlineStyle is web-only
              style={FORM_INPUT_STYLE}
            />
          </View>
        </View>
        <View style={styles.fieldGroup}>
          <Text style={styles.formLabel}>{t("syntheticModels.description")}</Text>
          <AdaptiveTextInput
            initialValue={values.description}
            resetKey={`synthetic-description-${state?.mode ?? "closed"}-${previous?.id ?? "new"}`}
            onChangeText={handleDescriptionChange}
            placeholder={t("syntheticModels.descriptionPlaceholder")}
            placeholderTextColor={theme.colors.foregroundMuted}
            // @ts-expect-error - outlineStyle is web-only
            style={FORM_INPUT_STYLE}
          />
        </View>
        <ReferenceModelsPicker
          models={selectedGatewayModels}
          references={values.references}
          aggregatorModel={values.aggregatorModel}
          onToggleReference={handleToggleReference}
          onSelectAggregator={handleAggregatorSelect}
        />
        <View style={styles.fieldGroup}>
          <Text style={styles.formLabel}>{t("syntheticModels.rounds")}</Text>
          <TextInput
            value={values.roundsText}
            onChangeText={handleRoundsChange}
            placeholder="1"
            placeholderTextColor={theme.colors.foregroundMuted}
            keyboardType="number-pad"
            inputMode="numeric"
            style={styles.formInput}
          />
          <Text style={settingsStyles.rowHint}>{t("syntheticModels.roundsHint")}</Text>
        </View>
        <View style={styles.formActions}>
          <Button variant="secondary" size="sm" onPress={onClose} disabled={saving}>
            {t("common.cancel")}
          </Button>
          <Button
            variant="default"
            size="sm"
            onPress={handleSave}
            disabled={!canSave}
            loading={saving}
          >
            {saving ? t("syntheticModels.saving") : t("common.save")}
          </Button>
        </View>
      </View>
    </AdaptiveModalSheet>
  );
}

export function SyntheticModelsSection({ serverId }: SyntheticModelsSectionProps) {
  const { theme } = useUnistyles();
  const { t } = useTranslation();
  const { config, patchConfig } = useDaemonConfig(serverId);
  const [editorState, setEditorState] = useState<EditingSyntheticModelState | null>(null);
  const gateways = useMemo(
    () => collectSyntheticModelGateways(config?.modelGateways),
    [config?.modelGateways],
  );
  const syntheticModels = useMemo(
    () => collectSyntheticModels(config?.modelGateways),
    [config?.modelGateways],
  );
  const openAdd = useCallback(() => setEditorState({ mode: "add", model: null }), []);
  const openEdit = useCallback(
    (model: SyntheticModelEntry) => setEditorState({ mode: "edit", model }),
    [],
  );
  const closeEditor = useCallback(() => setEditorState(null), []);
  const handleSave = useCallback(
    async (values: SyntheticModelEditorValues, previous: PreviousSyntheticModelRef | null) => {
      try {
        await patchConfig(
          buildSaveSyntheticModelPatch({
            currentGateways: config?.modelGateways,
            previousGatewayId: previous?.gatewayId,
            previousId: previous?.id,
            gatewayId: values.gatewayId,
            id: values.id,
            label: values.label,
            description: values.description,
            references: values.references,
            aggregatorModel: values.aggregatorModel,
            rounds: parseRounds(values.roundsText),
          }),
        );
        setEditorState(null);
      } catch (error) {
        Alert.alert(
          t("syntheticModels.saveFailed"),
          error instanceof Error ? error.message : String(error),
        );
      }
    },
    [config?.modelGateways, patchConfig, t],
  );
  const handleDelete = useCallback(
    (model: SyntheticModelEntry) => {
      void (async () => {
        const confirmed = await confirmDialog({
          title: t("syntheticModels.deleteConfirmTitle"),
          message: t("syntheticModels.deleteConfirmMessage", { model: model.label }),
          confirmLabel: t("common.delete"),
          cancelLabel: t("common.cancel"),
          destructive: true,
        });
        if (!confirmed) return;
        await patchConfig(
          buildDeleteSyntheticModelPatch({
            currentGateways: config?.modelGateways,
            gatewayId: model.gatewayId,
            id: model.id,
          }),
        );
      })().catch((error) => {
        Alert.alert(
          t("syntheticModels.deleteFailed"),
          error instanceof Error ? error.message : String(error),
        );
      });
    },
    [config?.modelGateways, patchConfig, t],
  );
  const headerActions = useMemo(
    () => (
      <Pressable
        onPress={openAdd}
        hitSlop={8}
        style={settingsStyles.sectionHeaderLink}
        accessibilityRole="button"
        accessibilityLabel={t("syntheticModels.addSyntheticModel")}
      >
        <Plus size={theme.iconSize.sm} color={theme.colors.foregroundMuted} />
        <Text style={settingsStyles.sectionHeaderLinkText}>{t("syntheticModels.add")}</Text>
      </Pressable>
    ),
    [openAdd, t, theme.colors.foregroundMuted, theme.iconSize.sm],
  );

  return (
    <>
      <SettingsSection
        title={t("syntheticModels.title")}
        trailing={headerActions}
        style={styles.sectionSpacing}
      >
        {syntheticModels.length > 0 ? (
          <View style={settingsStyles.card}>
            {syntheticModels.map((model, index) => (
              <View
                key={`${model.gatewayId}:${model.id}`}
                style={index === 0 ? undefined : styles.modelRowBorder}
              >
                <SyntheticModelRow model={model} onEdit={openEdit} onDelete={handleDelete} />
              </View>
            ))}
          </View>
        ) : (
          <View style={EMPTY_CARD_STYLE}>
            <Brain size={theme.iconSize.md} color={theme.colors.foregroundMuted} />
            <Text style={styles.emptyText}>{t("syntheticModels.empty")}</Text>
          </View>
        )}
      </SettingsSection>
      <SyntheticModelEditorSheet
        state={editorState}
        gateways={gateways}
        onClose={closeEditor}
        onSave={handleSave}
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
    gap: theme.spacing[2],
    alignItems: "center",
  },
  emptyText: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
  },
  modelRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing[3],
    paddingVertical: theme.spacing[4],
    paddingHorizontal: theme.spacing[4],
  },
  modelRowBorder: {
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  modelTextColumn: {
    flex: 1,
    minWidth: 0,
  },
  modelIdText: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
    marginTop: theme.spacing[1],
  },
  rowActions: {
    flexDirection: "row",
    alignItems: "center",
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
  optionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[3],
    paddingVertical: theme.spacing[3],
    paddingHorizontal: theme.spacing[4],
  },
  formActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: theme.spacing[2],
  },
}));

const EMPTY_CARD_STYLE = [settingsStyles.card, styles.emptyCard];
const FORM_INPUT_STYLE = [styles.formInput, isWeb && { outlineStyle: "none" }];
