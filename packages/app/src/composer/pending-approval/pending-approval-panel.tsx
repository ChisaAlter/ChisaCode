import { useCallback, useEffect, useMemo, useState, type ReactElement } from "react";
import { useMutation } from "@tanstack/react-query";
import { Pressable, ScrollView, StyleSheet as RNStyleSheet, Text, View } from "react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { useTranslation } from "react-i18next";
import { AlertTriangle, Check, ChevronLeft, ChevronRight, X } from "lucide-react-native";
import type { DaemonClient } from "@chisacode/client/internal/daemon-client";
import type {
  AgentPermissionAction,
  AgentPermissionResponse,
} from "@chisacode/protocol/agent-types";
import { PlanCard } from "@/components/plan-card";
import { QuestionFormCard } from "@/components/question-form-card";
import { ToolCallDetailsContent } from "@/components/tool-call-details";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { ToastApi } from "@/components/toast-host";
import { submitPermissionResponse } from "@/agent-stream/permission-response";
import type { PendingPermission } from "@/types/shared";
import { Fonts } from "@/constants/theme";
import { ICON_SIZE, type Theme } from "@/styles/theme";
import {
  buildPendingApprovalView,
  clampPendingApprovalIndex,
  resolvePendingApprovalActions,
  type PendingApprovalKind,
  type PendingApprovalView,
} from "./pending-approval-model";

const ThemedAlertTriangle = withUnistyles(AlertTriangle);
const ThemedCheck = withUnistyles(Check);
const ThemedX = withUnistyles(X);
const ThemedChevronLeft = withUnistyles(ChevronLeft);
const ThemedChevronRight = withUnistyles(ChevronRight);

const warningColor = (theme: Theme) => ({ color: theme.colors.statusWarning });
const dangerColor = (theme: Theme) => ({ color: theme.colors.statusDanger });
const mutedColor = (theme: Theme) => ({ color: theme.colors.foregroundMuted });
const foregroundColor = (theme: Theme) => ({ color: theme.colors.foreground });

export interface PendingApprovalPanelProps {
  permissions: readonly PendingPermission[];
  client: DaemonClient | null;
  toast?: ToastApi | null;
  testID?: string;
}

function kindLabelKey(kind: PendingApprovalKind): string {
  switch (kind) {
    case "command":
      return "permissions.approvalKindCommand";
    case "file-read":
      return "permissions.approvalKindFileRead";
    case "file-change":
      return "permissions.approvalKindFileChange";
    case "plan":
      return "permissions.approvalKindPlan";
    case "question":
      return "permissions.approvalKindQuestion";
    default:
      return "permissions.approvalKindOther";
  }
}

function detailLabelKey(kind: PendingApprovalKind): string {
  switch (kind) {
    case "command":
      return "permissions.approvalDetailCommand";
    case "file-read":
      return "permissions.approvalDetailFile";
    case "file-change":
      return "permissions.approvalDetailDiff";
    default:
      return "permissions.approvalDetailGeneric";
  }
}

function resolveActionTone(
  action: AgentPermissionAction,
): "primary" | "danger" | "warning" | "neutral" {
  if (action.behavior === "deny") {
    return "danger";
  }
  if (action.id === "allow_always" || /always/i.test(action.id)) {
    return "warning";
  }
  if (action.variant === "primary") {
    return "primary";
  }
  return "neutral";
}

function resolvePlanMarkdown(request: PendingPermission["request"]): string | undefined {
  const planFromMetadata =
    typeof request.metadata?.planText === "string" ? request.metadata.planText : undefined;
  if (planFromMetadata) {
    return planFromMetadata;
  }
  const candidate = request.input?.["plan"];
  return typeof candidate === "string" ? candidate : undefined;
}

/**
 * Banner-attached approval panel (T3 port M12). Replaces in-stream permission
 * cards: multi-approval pager + reject / accept / always-allow.
 */
export function PendingApprovalPanel({
  permissions,
  client,
  toast,
  testID = "pending-approval-panel",
}: PendingApprovalPanelProps): ReactElement | null {
  const { t } = useTranslation();
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [respondingActionId, setRespondingActionId] = useState<string | null>(null);

  const permissionCount = permissions.length;
  useEffect(() => {
    setSelectedIndex((current) => clampPendingApprovalIndex(current, permissionCount));
  }, [permissionCount]);

  const activeIndex = clampPendingApprovalIndex(selectedIndex, permissionCount);
  const activePermission = permissions[activeIndex];
  const activeRequestId = activePermission?.request.id;

  useEffect(() => {
    setRespondingActionId(null);
  }, [activeRequestId]);

  const view = useMemo(
    () =>
      buildPendingApprovalView({
        permissions,
        selectedIndex: activeIndex,
        titleFallback: t("permissions.required"),
      }),
    [activeIndex, permissions, t],
  );

  const permissionMutation = useMutation({
    mutationFn: async (input: {
      agentId: string;
      requestId: string;
      response: AgentPermissionResponse;
    }) => {
      if (!client) {
        throw new Error(t("permissions.daemonClientUnavailable"));
      }
      return client.respondToPermissionAndWait(
        input.agentId,
        input.requestId,
        input.response,
        15000,
      );
    },
  });
  const {
    reset: resetPermissionMutation,
    mutateAsync: respondToPermission,
    isPending: isResponding,
  } = permissionMutation;

  useEffect(() => {
    resetPermissionMutation();
  }, [activeRequestId, resetPermissionMutation]);

  const handleResponse = useCallback(
    (response: AgentPermissionResponse) => {
      if (!activePermission) {
        return;
      }
      void submitPermissionResponse({
        agentId: activePermission.agentId,
        requestId: activePermission.request.id,
        response,
        respond: respondToPermission,
        presentError: (message) => toast?.error(message),
        fallbackMessage: t("permissions.responseFailed"),
        onFailure: () => setRespondingActionId(null),
      });
    },
    [activePermission, respondToPermission, t, toast],
  );

  const handleActionPress = useCallback(
    (action: AgentPermissionAction) => {
      setRespondingActionId(action.id);
      if (action.behavior === "allow") {
        handleResponse({ behavior: "allow", selectedActionId: action.id });
        return;
      }
      handleResponse({
        behavior: "deny",
        selectedActionId: action.id,
        message: t("permissions.deniedByUser"),
      });
    },
    [handleResponse, t],
  );

  const goPrev = useCallback(() => {
    setSelectedIndex((index) => Math.max(0, index - 1));
  }, []);
  const goNext = useCallback(() => {
    setSelectedIndex((index) => Math.min(permissionCount - 1, index + 1));
  }, [permissionCount]);

  if (!view || !activePermission || permissionCount === 0) {
    return null;
  }

  if (activePermission.request.kind === "question") {
    return (
      <View style={styles.root} testID={testID}>
        <QuestionFormCard
          permission={activePermission}
          onRespond={handleResponse}
          isResponding={isResponding}
        />
      </View>
    );
  }

  return (
    <View style={styles.root} testID={testID}>
      <ApprovalHeader
        view={view}
        testID={testID}
        canPrev={activeIndex > 0}
        canNext={activeIndex < permissionCount - 1}
        onPrev={goPrev}
        onNext={goNext}
      />
      <ApprovalBody permission={activePermission} view={view} testID={testID} />
      <Text testID="permission-request-question" style={styles.question}>
        {t("permissions.question")}
      </Text>
      <ApprovalActions
        request={activePermission.request}
        isResponding={isResponding}
        respondingActionId={respondingActionId}
        onActionPress={handleActionPress}
      />
    </View>
  );
}

function ApprovalHeader({
  view,
  testID,
  canPrev,
  canNext,
  onPrev,
  onNext,
}: {
  view: PendingApprovalView;
  testID: string;
  canPrev: boolean;
  canNext: boolean;
  onPrev: () => void;
  onNext: () => void;
}) {
  const { t } = useTranslation();
  return (
    <View style={styles.head}>
      <ThemedAlertTriangle size={ICON_SIZE.sm} uniProps={warningColor} />
      <Text style={styles.title} numberOfLines={1}>
        {view.title}
      </Text>
      <View style={styles.kindPill}>
        <Text style={styles.kindText}>{t(kindLabelKey(view.kind))}</Text>
      </View>
      {view.count > 1 ? (
        <View style={styles.pager} testID={`${testID}-pager`}>
          <PagerButton
            disabled={!canPrev}
            onPress={onPrev}
            accessibilityLabel={t("permissions.approvalPrevious")}
            testID={`${testID}-prev`}
            Icon={ThemedChevronLeft}
          />
          <Text style={styles.pagerCount} testID={`${testID}-count`}>
            {view.index}/{view.count}
          </Text>
          <PagerButton
            disabled={!canNext}
            onPress={onNext}
            accessibilityLabel={t("permissions.approvalNext")}
            testID={`${testID}-next`}
            Icon={ThemedChevronRight}
          />
        </View>
      ) : null}
    </View>
  );
}

function PagerButton({
  disabled,
  onPress,
  accessibilityLabel,
  testID,
  Icon,
}: {
  disabled: boolean;
  onPress: () => void;
  accessibilityLabel: string;
  testID: string;
  Icon: typeof ThemedChevronLeft;
}) {
  const style = useCallback(
    ({ pressed }: { pressed: boolean }) => [
      styles.pagerButton,
      disabled && styles.pagerButtonDisabled,
      pressed && !disabled && styles.pagerButtonPressed,
    ],
    [disabled],
  );
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      disabled={disabled}
      onPress={onPress}
      style={style}
      testID={testID}
    >
      <Icon size={14} uniProps={mutedColor} />
    </Pressable>
  );
}

function ApprovalBody({
  permission,
  view,
  testID,
}: {
  permission: PendingPermission;
  view: PendingApprovalView;
  testID: string;
}) {
  const { t } = useTranslation();
  const isPlan = permission.request.kind === "plan";
  const planMarkdown = useMemo(() => resolvePlanMarkdown(permission.request), [permission.request]);
  const toolDetail = permission.request.detail;

  if (isPlan && planMarkdown) {
    return (
      <View style={styles.body}>
        <PlanCard
          title={view.title}
          description={permission.request.description ?? ""}
          text={planMarkdown}
          footer={null}
          testID="permission-plan-card"
          disableOuterSpacing
        />
      </View>
    );
  }

  return (
    <View style={styles.body}>
      <Text style={styles.detailLabel}>{t(detailLabelKey(view.kind))}</Text>
      <ScrollView style={styles.detailScroll} nestedScrollEnabled>
        {toolDetail && toolDetail.type !== "unknown" ? (
          <ToolCallDetailsContent detail={toolDetail} maxHeight={120} />
        ) : (
          <Text style={styles.detailText} testID={`${testID}-detail`}>
            {view.detail || permission.request.description || view.title}
          </Text>
        )}
      </ScrollView>
    </View>
  );
}

function ApprovalActions({
  request,
  isResponding,
  respondingActionId,
  onActionPress,
}: {
  request: PendingPermission["request"];
  isResponding: boolean;
  respondingActionId: string | null;
  onActionPress: (action: AgentPermissionAction) => void;
}) {
  const { t } = useTranslation();
  const actions = useMemo(
    () =>
      resolvePendingApprovalActions({
        request,
        labels: {
          reject: t("permissions.reject"),
          accept: t("permissions.accept"),
          execute: t("permissions.execute"),
          alwaysAllow: t("permissions.alwaysAllow"),
        },
      }),
    [request, t],
  );

  const onReject = useCallback(() => {
    if (actions.reject) onActionPress(actions.reject);
  }, [actions.reject, onActionPress]);
  const onAccept = useCallback(() => {
    if (actions.accept) onActionPress(actions.accept);
  }, [actions.accept, onActionPress]);
  const onAlways = useCallback(() => {
    if (actions.alwaysAllow) onActionPress(actions.alwaysAllow);
  }, [actions.alwaysAllow, onActionPress]);

  return (
    <View style={styles.actions}>
      {actions.reject ? (
        <ActionButton
          label={actions.reject.label}
          tone="danger"
          disabled={isResponding}
          busy={respondingActionId === actions.reject.id}
          testID="permission-request-deny"
          Icon={ThemedX}
          iconMapping={dangerColor}
          onPress={onReject}
        />
      ) : null}
      {actions.accept ? (
        <ActionButton
          label={actions.accept.label}
          tone="primary"
          disabled={isResponding}
          busy={respondingActionId === actions.accept.id}
          testID="permission-request-accept"
          Icon={ThemedCheck}
          iconMapping={foregroundColor}
          onPress={onAccept}
        />
      ) : null}
      {actions.alwaysAllow ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <View style={styles.alwaysAllowWrap}>
              <ActionButton
                label={actions.alwaysAllow.label}
                tone="warning"
                disabled={isResponding}
                busy={respondingActionId === actions.alwaysAllow.id}
                testID="permission-request-always-allow"
                Icon={ThemedAlertTriangle}
                iconMapping={warningColor}
                onPress={onAlways}
              />
            </View>
          </TooltipTrigger>
          <TooltipContent>
            <Text>{t("permissions.alwaysAllowWarning")}</Text>
          </TooltipContent>
        </Tooltip>
      ) : null}
      {actions.extras.map((action) => (
        <ExtraActionButton
          key={action.id}
          action={action}
          disabled={isResponding}
          busy={respondingActionId === action.id}
          onActionPress={onActionPress}
        />
      ))}
    </View>
  );
}

function ExtraActionButton({
  action,
  disabled,
  busy,
  onActionPress,
}: {
  action: AgentPermissionAction;
  disabled: boolean;
  busy: boolean;
  onActionPress: (action: AgentPermissionAction) => void;
}) {
  const onPress = useCallback(() => onActionPress(action), [action, onActionPress]);
  const tone = resolveActionTone(action);
  return (
    <ActionButton
      label={action.label}
      tone={tone}
      disabled={disabled}
      busy={busy}
      testID={`permission-request-action-${action.id}`}
      Icon={action.behavior === "allow" ? ThemedCheck : ThemedX}
      iconMapping={action.behavior === "deny" ? dangerColor : mutedColor}
      onPress={onPress}
    />
  );
}

function ActionButton({
  label,
  tone,
  disabled,
  busy,
  testID,
  Icon,
  iconMapping,
  onPress,
}: {
  label: string;
  tone: "primary" | "danger" | "warning" | "neutral";
  disabled: boolean;
  busy: boolean;
  testID: string;
  Icon: typeof ThemedCheck;
  iconMapping: (theme: Theme) => { color: string };
  onPress: () => void;
}) {
  const style = useCallback(
    ({ pressed }: { pressed: boolean }) => [
      styles.actionButton,
      tone === "primary" && styles.actionPrimary,
      tone === "danger" && styles.actionDanger,
      tone === "warning" && styles.actionWarning,
      pressed && styles.actionPressed,
      disabled && styles.actionDisabled,
    ],
    [disabled, tone],
  );
  const labelStyle = useMemo(() => {
    if (tone === "primary") return [styles.actionLabel, styles.actionLabelPrimary];
    if (tone === "danger") return [styles.actionLabel, styles.actionLabelDanger];
    if (tone === "warning") return [styles.actionLabel, styles.actionLabelWarning];
    return styles.actionLabel;
  }, [tone]);
  const accessibilityState = useMemo(() => ({ disabled: disabled || busy }), [busy, disabled]);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={accessibilityState}
      disabled={disabled}
      onPress={onPress}
      testID={testID}
      style={style}
    >
      <View style={styles.actionContent}>
        <Icon size={14} uniProps={iconMapping} />
        <Text style={labelStyle}>{busy ? "…" : label}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create((theme) => ({
  root: {
    width: "100%",
    gap: 0,
  },
  head: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: RNStyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.border,
    backgroundColor: theme.colors.surface1,
  },
  title: {
    flexShrink: 1,
    fontSize: 13,
    fontWeight: theme.fontWeight.semibold,
    color: theme.colors.foreground,
  },
  kindPill: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface0,
    paddingHorizontal: 8,
    paddingVertical: 1,
  },
  kindText: {
    fontSize: 11,
    fontWeight: theme.fontWeight.semibold,
    color: theme.colors.foregroundMuted,
  },
  pager: {
    marginLeft: "auto",
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  pagerButton: {
    width: 20,
    height: 20,
    borderRadius: 5,
    alignItems: "center",
    justifyContent: "center",
  },
  pagerButtonDisabled: {
    opacity: 0.35,
  },
  pagerButtonPressed: {
    backgroundColor: theme.colors.surface0,
  },
  pagerCount: {
    fontSize: 12,
    color: theme.colors.foregroundMuted,
    fontVariant: ["tabular-nums"],
  },
  body: {
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 4,
    gap: 6,
  },
  detailLabel: {
    fontSize: 11,
    fontWeight: theme.fontWeight.semibold,
    color: theme.colors.foregroundMuted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  detailScroll: {
    maxHeight: 120,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface1,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  detailText: {
    fontFamily: Fonts.mono,
    fontSize: 12,
    lineHeight: 18,
    color: theme.colors.foreground,
  },
  question: {
    paddingHorizontal: 14,
    paddingTop: 8,
    fontSize: 12.5,
    lineHeight: 18,
    color: theme.colors.foregroundMuted,
  },
  actions: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 12,
  },
  alwaysAllowWrap: {
    marginLeft: "auto",
  },
  actionButton: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingVertical: 7,
    paddingHorizontal: 14,
    backgroundColor: theme.colors.surface0,
  },
  actionPrimary: {
    backgroundColor: theme.colors.foreground,
    borderColor: theme.colors.foreground,
  },
  actionDanger: {
    borderColor: "rgba(220, 90, 98, 0.4)",
  },
  actionWarning: {
    borderColor: "rgba(165, 118, 31, 0.35)",
  },
  actionPressed: {
    opacity: 0.9,
  },
  actionDisabled: {
    opacity: 0.55,
  },
  actionContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  actionLabel: {
    fontSize: 12.5,
    fontWeight: theme.fontWeight.semibold,
    color: theme.colors.foregroundMuted,
  },
  actionLabelPrimary: {
    color: theme.colors.background,
  },
  actionLabelDanger: {
    color: theme.colors.statusDanger,
  },
  actionLabelWarning: {
    color: theme.colors.statusWarning,
  },
}));
