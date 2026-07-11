import React, { Suspense, useCallback } from "react";
import { View, Text } from "react-native";
import { genUiRegistry } from "@/generative-ui/registry/registry";
/* eslint-disable-next-line import/no-unassigned-import */
import "@/generative-ui/registry/components";
import { GenerativeUiErrorBoundary } from "@/generative-ui/generative-ui-error-boundary";
import { useGenerativeUiAction } from "@/generative-ui/use-generative-ui-action";
import { dispatchValidatedAction } from "@/generative-ui/action-dispatch";
import type { GenerativeUiItem } from "@/types/stream";

interface Props {
  item: GenerativeUiItem;
  serverId: string;
  agentId: string;
}

const LOADING_FALLBACK = <LoadingSkeleton />;

/**
 * 生成式 UI 顶层渲染器
 * 查找注册表中的组件，校验 props，
 * 包裹在 ErrorBoundary + Suspense 中渲染
 */
export function GenerativeUiRenderer({ item, serverId, agentId }: Props) {
  // HTML 沙箱回退路径（由 message.tsx 中已有的 GenerativeHtmlPreview 处理）
  if (item.source === "fence" && item.componentId === "html") {
    return <FallbackCard message="HTML 沙箱渲染由独立路径处理" />;
  }

  const entry = genUiRegistry.get(item.componentId);

  if (!entry) {
    return <UnknownComponentCard componentId={item.componentId} />;
  }

  let safeProps: Record<string, unknown>;
  try {
    safeProps = genUiRegistry.validateProps(item.componentId, item.props);
  } catch {
    return <PropsErrorCard componentId={item.componentId} />;
  }

  return (
    <GenerativeUiErrorBoundary instanceId={item.instanceId} componentId={item.componentId}>
      <Suspense fallback={LOADING_FALLBACK}>
        <GenerativeUiRenderInner
          entry={entry}
          componentId={item.componentId}
          instanceId={item.instanceId}
          safeProps={safeProps}
          serverId={serverId}
          agentId={agentId}
        />
      </Suspense>
    </GenerativeUiErrorBoundary>
  );
}

function GenerativeUiRenderInner({
  entry,
  componentId,
  instanceId,
  safeProps,
  serverId,
  agentId,
}: {
  entry: NonNullable<ReturnType<typeof genUiRegistry.get>>;
  componentId: string;
  instanceId: string;
  safeProps: Record<string, unknown>;
  serverId: string;
  agentId: string;
}) {
  const { sendAction } = useGenerativeUiAction({ serverId, agentId });
  const validatedSendAction = useCallback(
    (_requestedInstanceId: string, action: string, payload: unknown) =>
      dispatchValidatedAction({
        componentId,
        instanceId,
        action,
        payload,
        sender: sendAction,
      }),
    [componentId, instanceId, sendAction],
  );
  const Component = entry.component;

  return <Component instanceId={instanceId} props={safeProps} sendAction={validatedSendAction} />;
}

function UnknownComponentCard({ componentId }: { componentId: string }) {
  return (
    <View style={fallbackStyle}>
      <Text style={fallbackTitleStyle}>未知组件</Text>
      <Text style={fallbackTextStyle}>组件 &quot;{componentId}&quot; 未在注册表中找到</Text>
    </View>
  );
}

function PropsErrorCard({ componentId }: { componentId: string }) {
  return (
    <View style={fallbackStyle}>
      <Text style={fallbackTitleStyle}>属性校验失败</Text>
      <Text style={fallbackTextStyle}>组件 &quot;{componentId}&quot; 的属性数据格式不正确</Text>
    </View>
  );
}

function FallbackCard({ message }: { message: string }) {
  return (
    <View style={fallbackStyle}>
      <Text style={fallbackTextStyle}>{message}</Text>
    </View>
  );
}

function LoadingSkeleton() {
  return (
    <View style={skeletonStyle}>
      <Text style={skeletonTextStyle}>加载中...</Text>
    </View>
  );
}

const fallbackStyle = {
  padding: 12,
  borderRadius: 8,
  backgroundColor: "#f3f4f6",
  borderWidth: 1,
  borderColor: "#e5e7eb",
};

const fallbackTitleStyle = {
  fontSize: 14,
  fontWeight: "600" as const,
  color: "#374151",
  marginBottom: 4,
};

const fallbackTextStyle = {
  fontSize: 13,
  color: "#6b7280",
};

const skeletonStyle = {
  padding: 16,
  borderRadius: 8,
  backgroundColor: "#f9fafb",
  height: 120,
  justifyContent: "center" as const,
  alignItems: "center" as const,
};

const skeletonTextStyle = {
  fontSize: 13,
  color: "#9ca3af",
};
