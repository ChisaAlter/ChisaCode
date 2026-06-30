import React from "react";
import { View, Text, TouchableOpacity } from "react-native";

interface Props {
  instanceId: string;
  componentId: string;
  children: React.ReactNode;
  onError?: (instanceId: string, error: Error) => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * 生成式 UI 组件的错误边界
 * 捕获渲染时的同步异常，显示退化 UI 卡片，
 * 防止单个组件崩溃影响整个聊天界面
 */
export class GenerativeUiErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error) {
    this.props.onError?.(this.props.instanceId, error);
  }

  private handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <View style={errorCardStyle}>
          <Text style={errorIconStyle}>⚠</Text>
          <Text style={errorTitleStyle}>{this.props.componentId} 渲染失败</Text>
          <Text style={errorDetailStyle}>组件渲染过程中发生异常，请尝试重试</Text>
          <TouchableOpacity onPress={this.handleRetry}>
            <Text style={retryTextStyle}>重试</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return this.props.children;
  }
}

const errorCardStyle = {
  padding: 16,
  borderRadius: 8,
  borderWidth: 1,
  borderColor: "#e5e7eb",
  backgroundColor: "#fef2f2",
  alignItems: "center" as const,
  gap: 8,
};

const errorIconStyle = {
  fontSize: 20,
  fontWeight: "600" as const,
  color: "#ef4444",
};

const errorTitleStyle = {
  fontSize: 14,
  fontWeight: "600" as const,
  color: "#991b1b",
};

const errorDetailStyle = {
  fontSize: 12,
  color: "#7f1d1d",
};

const retryTextStyle = {
  fontSize: 13,
  fontWeight: "500" as const,
  color: "#2563eb",
};
