import type { ComponentType } from "react";
import type { PanelDescriptor, PanelIconProps } from "@/panels/panel-registry";

export function buildDraftPanelDescriptor(input: {
  isCreating: boolean;
  pendingPrompt?: string | null;
  icon: ComponentType<PanelIconProps>;
}): PanelDescriptor {
  const { icon, isCreating, pendingPrompt } = input;
  const creatingLabel = pendingPrompt?.trim() || "新智能体";
  if (isCreating) {
    return {
      label: creatingLabel,
      subtitle: "正在创建智能体",
      titleState: "ready",
      icon,
      statusBucket: "running",
    };
  }

  return {
    label: "新智能体",
    subtitle: "新智能体",
    titleState: "ready",
    icon,
    statusBucket: null,
  };
}
