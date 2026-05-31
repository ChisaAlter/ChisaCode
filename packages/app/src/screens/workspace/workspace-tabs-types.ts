import type { WorkspaceTabTarget } from "@/stores/workspace-tabs-store";

export interface WorkspaceTabDescriptor {
  key: string;
  tabId: string;
  kind: WorkspaceTabTarget["kind"];
  target: WorkspaceTabTarget;
}
