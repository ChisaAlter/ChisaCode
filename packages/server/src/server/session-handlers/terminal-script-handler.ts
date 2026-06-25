/**
 * TerminalScriptHandler — extracted from Session.
 *
 * Handles workspace script start requests and terminal message dispatch.
 */

import { spawnWorkspaceScript } from "../worktree-bootstrap.js";
import type { StartWorkspaceScriptRequest, SessionInboundMessage } from "../messages.js";
import type { SessionContext, DisposableHandler } from "./session-context.js";

export class TerminalScriptHandler implements DisposableHandler {
  private readonly context: SessionContext;

  constructor(context: SessionContext) {
    this.context = context;
  }

  dispose(): void {
    // terminalController.dispose() is called by Session directly.
  }

  async handleStartWorkspaceScriptRequest(request: StartWorkspaceScriptRequest): Promise<void> {
    try {
      if (
        !this.context.terminalManager ||
        !this.context.scriptRouteStore ||
        !this.context.scriptRuntimeStore
      ) {
        throw new Error("Workspace scripts are not available on this daemon");
      }

      const workspace = await this.context.workspaceRegistry.get(request.workspaceId);
      if (!workspace) {
        throw new Error(`Workspace not found: ${request.workspaceId}`);
      }
      const gitMetadata = await this.context.workspaceGitService.getWorkspaceGitMetadata(
        workspace.cwd,
      );

      const serviceResult = await spawnWorkspaceScript({
        repoRoot: workspace.cwd,
        workspaceId: workspace.workspaceId,
        projectSlug: gitMetadata.projectSlug,
        branchName: gitMetadata.currentBranch,
        scriptName: request.scriptName,
        daemonPort: this.context.getDaemonTcpPort?.() ?? null,
        daemonListenHost: this.context.getDaemonTcpHost?.() ?? null,
        routeStore: this.context.scriptRouteStore,
        runtimeStore: this.context.scriptRuntimeStore,
        terminalManager: this.context.terminalManager,
        logger: this.context.sessionLogger,
        onLifecycleChanged: () => {
          this.context.emitWorkspaceScriptStatusUpdate(workspace.workspaceId, workspace.cwd);
        },
      });

      this.context.emitWorkspaceScriptStatusUpdate(workspace.workspaceId, workspace.cwd);
      this.context.emit({
        type: "start_workspace_script_response",
        payload: {
          requestId: request.requestId,
          workspaceId: request.workspaceId,
          scriptName: request.scriptName,
          terminalId: serviceResult.terminalId,
          error: null,
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to start workspace script";
      this.context.sessionLogger.error(
        { err: error, workspaceId: request.workspaceId, scriptName: request.scriptName },
        "Failed to start workspace script",
      );
      this.context.emit({
        type: "start_workspace_script_response",
        payload: {
          requestId: request.requestId,
          workspaceId: request.workspaceId,
          scriptName: request.scriptName,
          terminalId: null,
          error: message,
        },
      });
    }
  }

  dispatchTerminalMessage(msg: SessionInboundMessage): Promise<void> | undefined {
    if (msg.type === "start_workspace_script_request") {
      return this.handleStartWorkspaceScriptRequest(msg);
    }
    return this.context.terminalController.dispatch(msg);
  }
}
