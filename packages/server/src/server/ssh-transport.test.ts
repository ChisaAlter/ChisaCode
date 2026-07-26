import { describe, expect, test } from "vitest";

import { buildSSHArgs, type SSHConnectionConfig } from "./ssh-transport.js";

describe("buildSSHArgs", () => {
  const minimal: SSHConnectionConfig = { host: "example.com" };

  test("builds minimal SSH args", () => {
    const args = buildSSHArgs(minimal, { remoteCommand: "echo", remoteArgs: ["hello"] });
    expect(args).toContain("-T");
    expect(args).toContain("example.com");
    expect(args[args.length - 1]).toContain("echo");
  });

  test("includes user@host when user is set", () => {
    const args = buildSSHArgs({ host: "srv", user: "deploy" }, { remoteCommand: "ls" });
    expect(args).toContain("deploy@srv");
  });

  test("includes port when non-default", () => {
    const args = buildSSHArgs({ host: "srv", port: 2222 }, { remoteCommand: "ls" });
    expect(args).toContain("-p");
    expect(args).toContain("2222");
  });

  test("omits port for default 22", () => {
    const args = buildSSHArgs({ host: "srv", port: 22 }, { remoteCommand: "ls" });
    expect(args).not.toContain("-p");
  });

  test("includes identity file", () => {
    const args = buildSSHArgs(
      { host: "srv", identityFile: "~/.ssh/id_ed25519" },
      { remoteCommand: "ls" },
    );
    expect(args).toContain("-i");
    expect(args).toContain("~/.ssh/id_ed25519");
  });

  test("includes additional SSH options", () => {
    const args = buildSSHArgs(
      { host: "srv", sshOptions: ["StrictHostKeyChecking=no"] },
      { remoteCommand: "ls" },
    );
    expect(args).toContain("-o");
    expect(args).toContain("StrictHostKeyChecking=no");
  });

  test("includes BatchMode and ConnectTimeout", () => {
    const args = buildSSHArgs(minimal, { remoteCommand: "ls" });
    expect(args).toContain("BatchMode=yes");
    expect(args).toContain("ConnectTimeout=30");
  });

  test("prepends cd for remoteCwd", () => {
    const args = buildSSHArgs(minimal, {
      remoteCommand: "claude",
      remoteCwd: "/home/user/project",
    });
    const remoteCmd = args[args.length - 1];
    expect(remoteCmd).toContain("cd /home/user/project");
    expect(remoteCmd).toContain("claude");
  });

  test("prepends export for remoteEnv", () => {
    const args = buildSSHArgs(minimal, {
      remoteCommand: "agent",
      remoteEnv: { NODE_ENV: "production" },
    });
    const remoteCmd = args[args.length - 1];
    expect(remoteCmd).toContain("export NODE_ENV=production");
  });

  test("quotes values with spaces", () => {
    const args = buildSSHArgs(minimal, {
      remoteCommand: "agent",
      remoteCwd: "/home/user/my project",
    });
    const remoteCmd = args[args.length - 1];
    expect(remoteCmd).toContain("'/home/user/my project'");
  });

  test("quotes env values with special characters", () => {
    const args = buildSSHArgs(minimal, {
      remoteCommand: "agent",
      remoteEnv: { GREETING: "hello world" },
    });
    const remoteCmd = args[args.length - 1];
    expect(remoteCmd).toContain("'hello world'");
  });

  test("chains cd + env + command with &&", () => {
    const args = buildSSHArgs(minimal, {
      remoteCommand: "claude",
      remoteArgs: ["--acp"],
      remoteCwd: "/app",
      remoteEnv: { KEY: "val" },
    });
    const remoteCmd = args[args.length - 1];
    expect(remoteCmd).toBe("cd /app && export KEY=val && claude --acp");
  });
});
