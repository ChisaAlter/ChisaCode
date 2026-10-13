import type { ReactElement } from "react";
import type { DaemonClient } from "@chisacode/client/internal/daemon-client";
import type { ComposerBannerDescriptor } from "@/composer/banner/composer-banner-logic";
import type { ToastApi } from "@/components/toast-host";
import type { PendingPermission } from "@/types/shared";
import { PendingApprovalPanel } from "./pending-approval-panel";

export const PENDING_APPROVAL_BANNER_ID = "pending-approval";

/**
 * Builds the highest-priority composer banner for pending approvals (M12).
 * Returns an empty list when there is nothing to approve so mergeComposerBanners
 * can drop the slot cleanly.
 */
export function buildPendingApprovalBanners(input: {
  permissions: readonly PendingPermission[];
  client: DaemonClient | null;
  toast?: ToastApi | null;
  title: string;
}): readonly ComposerBannerDescriptor[] {
  if (input.permissions.length === 0) {
    return [];
  }
  const bodySlot: ReactElement = (
    <PendingApprovalPanel
      permissions={input.permissions}
      client={input.client}
      toast={input.toast}
    />
  );
  return [
    {
      id: PENDING_APPROVAL_BANNER_ID,
      variant: "approval",
      title: input.title,
      dismissible: false,
      width: "full",
      bodySlot,
      testID: "pending-approval-banner",
    },
  ];
}
