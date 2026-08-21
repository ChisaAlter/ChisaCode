import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { afterEach, describe, expect, test } from "vitest";

import { createTestLogger } from "../../../test-utils/test-logger.js";
import {
  buildManagedDshCordisYml,
  DSH_DEFAULT_MODELS,
  DshAgentClient,
  resolveDshVendorDir,
} from "./dsh-agent.js";

const VENDOR_PACKAGES = [
  "dsh-llm-deepseek",
  "dsh-sandbox-local",
  "dsh-sandbox-policy",
  "dsh-subprocess-local",
  "dsh-bash-sandbox",
  "dsh-user-approval",
  "dsh-fs-sandbox",
  "dsh-fs-observation-policy",
  "dsh-tool-fs",
  "dsh-token-meter",
  "dsh-compaction-basic",
  "dsh-repeat-tool-reminder",
];

function makeVendorDir(root: string): string {
  const vendorDir = join(root, "vendor", "@deepseek-ai");
  for (const pkg of VENDOR_PACKAGES) {
    mkdirSync(join(vendorDir, pkg, "lib"), { recursive: true });
  }
  return vendorDir;
}

function pluginUrl(vendorDir: string, pkg: string): string {
  return pathToFileURL(join(vendorDir, pkg, "lib", "index.js")).href;
}

describe("buildManagedDshCordisYml", () => {
  test("writes the full composition with file-URL plugins and pinned default model", () => {
    const yml = buildManagedDshCordisYml("/managed/home", {
      pluginBaseDir: "/vendor/@deepseek-ai",
      models: [
        {
          id: "deepseek-v4-flash",
          label: "DeepSeek V4 Flash",
          thinkingOptions: [
            { id: "off", label: "Off" },
            { id: "high", label: "High", isDefault: true },
          ],
        },
        {
          id: "deepseek-v4-vision",
          label: "DeepSeek V4 Vision",
          isDefault: true,
          supportsImages: true,
          thinkingOptions: [
            { id: "off", label: "Off" },
            { id: "max", label: "Max", isDefault: true },
          ],
        },
      ],
    });

    for (const pkg of VENDOR_PACKAGES) {
      expect(yml).toContain(`name: "${pluginUrl("/vendor/@deepseek-ai", pkg)}"`);
    }
    expect(yml).toContain('name: "@deepseek-ai/dsh-acp-demo"');
    expect(yml).toContain("thinking: enabled");
    expect(yml).toContain('reasoningEffort: "max"');
    expect(yml).toContain('      - id: "deepseek-v4-flash"');
    expect(yml).toContain('      - id: "deepseek-v4-vision"');
    expect(yml).toContain("inputModalities: [text, image]");
    expect(yml).toContain('model: "deepseek-v4-vision"');
    expect(yml).toContain(`persistenceRoot: ${JSON.stringify(join("/managed/home", "sessions"))}`);
    expect(yml).toContain("workspaceContext: false");
    expect(yml).toContain("!!js process.cwd()");
  });

  test("serializes thinking off without a reasoningEffort line", () => {
    const yml = buildManagedDshCordisYml("/managed/home", {
      pluginBaseDir: "/vendor/@deepseek-ai",
      models: [
        {
          id: "deepseek-v4-flash",
          label: "Flash",
          thinkingOptions: [{ id: "off", label: "Off", isDefault: true }],
        },
      ],
    });

    expect(yml).toContain("thinking: disabled");
    expect(yml).not.toContain("reasoningEffort");
  });

  test("deduplicates models and YAML-escapes ids via JSON string semantics", () => {
    const yml = buildManagedDshCordisYml("/managed/home", {
      pluginBaseDir: "/vendor/@deepseek-ai",
      models: [
        { id: 'custom\n"model"', label: "Weird" },
        { id: 'custom\n"model"', label: "Weird v2", isDefault: true },
      ],
    });

    expect(yml.match(/- id: "custom\\n\\"model\\""/gu)).toHaveLength(1);
    expect(yml).toContain('model: "custom\\n\\"model\\""');
  });
});

describe("DshAgentClient launch", () => {
  const envBackup = { ...process.env };
  const tempRoots: string[] = [];

  afterEach(() => {
    process.env = { ...envBackup };
    for (const root of tempRoots.splice(0)) {
      rmSync(root, { recursive: true, force: true });
    }
  });

  function makeHome(): { home: string; vendorDir: string } {
    const home = mkdtempSync(join(tmpdir(), "chisacode-dsh-home-"));
    tempRoots.push(home);
    process.env.CHISACODE_HOME = home;
    process.env.CHISACODE_DSH_VENDOR_DIR = makeVendorDir(home);
    return { home, vendorDir: process.env.CHISACODE_DSH_VENDOR_DIR };
  }

  test("materializes the managed composition and points --config at it", () => {
    const { home } = makeHome();
    const client = new DshAgentClient({ logger: createTestLogger(), models: [] });

    const managedRoot = join(home, "provider-runtime", "dsh");
    const entries = readdirSync(managedRoot);
    expect(entries).toHaveLength(1);
    const configPath = join(managedRoot, entries[0] ?? "", "cordis.yml");
    expect(readFileSync(configPath, "utf8")).toContain('model: "deepseek-v4-pro"');
    expect(existsSync(join(managedRoot, entries[0] ?? "", "sessions"))).toBe(true);
    expect(client.command).toEqual(["dsh-acp-demo", "--config", configPath]);
  });

  test("append overrides insert before --config", () => {
    makeHome();
    const client = new DshAgentClient({
      logger: createTestLogger(),
      providerId: "deepseek-dsh",
      runtimeSettings: {
        command: { mode: "append", args: ["--verbose"] },
        env: { DEEPSEEK_API_KEY: "sk-test" },
      },
      models: [{ id: "deepseek-v4-flash", label: "Flash", isDefault: true }],
    });

    expect(client.command.slice(0, 3)).toEqual(["dsh-acp-demo", "--verbose", "--config"]);
  });

  test("replace overrides skip managed materialization entirely", () => {
    const { home } = makeHome();
    const client = new DshAgentClient({
      logger: createTestLogger(),
      runtimeSettings: {
        command: { mode: "replace", argv: ["custom-acp", "--flag"] },
      },
      models: [],
    });

    expect(client.command).toEqual(["custom-acp", "--flag"]);
    expect(existsSync(join(home, "provider-runtime"))).toBe(false);
  });

  test("missing vendor dir keeps construction safe and leaves no yml behind", () => {
    const home = mkdtempSync(join(tmpdir(), "chisacode-dsh-home-"));
    tempRoots.push(home);
    process.env.CHISACODE_HOME = home;
    process.env.CHISACODE_DSH_VENDOR_DIR = join(home, "vendor"); // never created

    const client = new DshAgentClient({ logger: createTestLogger(), models: [] });
    expect(client.command[0]).toBe("dsh-acp-demo");
    expect(client.command[1]).toBe("--config");
    expect(existsSync(join(home, "provider-runtime"))).toBe(false);
  });

  test("gateway env passes through untouched", () => {
    makeHome();
    const client = new DshAgentClient({
      logger: createTestLogger(),
      runtimeSettings: {
        env: {
          DEEPSEEK_API_KEY: "sk-gateway-token",
          DEEPSEEK_BASE_URL: "http://127.0.0.1:6767/api/model-gateways/deepseek/v1",
        },
      },
      models: [{ id: "deepseek-v4-flash", label: "Flash", isDefault: true }],
    });

    expect(client.provider).toBe("acp");
    // Env passthrough happens at spawn via runtimeSettings; nothing secret is
    // written into the managed yml.
    const configPath = client.command[2];
    expect(readFileSync(configPath, "utf8")).not.toContain("sk-gateway-token");
  });
});

describe("resolveDshVendorDir", () => {
  const envBackup = { ...process.env };
  const tempRoots: string[] = [];

  afterEach(() => {
    process.env = { ...envBackup };
    for (const root of tempRoots.splice(0)) {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("honors the override only when the tree is complete", () => {
    const root = mkdtempSync(join(tmpdir(), "chisacode-dsh-vendor-"));
    tempRoots.push(root);
    process.env.CHISACODE_DSH_VENDOR_DIR = makeVendorDir(root);
    expect(resolveDshVendorDir()).toBe(process.env.CHISACODE_DSH_VENDOR_DIR);

    const incomplete = mkdtempSync(join(tmpdir(), "chisacode-dsh-vendor-"));
    tempRoots.push(incomplete);
    process.env.CHISACODE_DSH_VENDOR_DIR = incomplete;
    expect(resolveDshVendorDir()).toBeNull();
  });
});

describe("DSH_DEFAULT_MODELS", () => {
  test("offers the upstream v4 lineup with thinking options and a default", () => {
    expect(DSH_DEFAULT_MODELS.map((model) => model.id)).toEqual([
      "deepseek-v4-flash",
      "deepseek-v4-pro",
    ]);
    expect(DSH_DEFAULT_MODELS.find((model) => model.isDefault)?.id).toBe("deepseek-v4-pro");
    const thinking = DSH_DEFAULT_MODELS[0]?.thinkingOptions?.map((option) => option.id);
    expect(thinking).toEqual(["off", "low", "high", "max"]);
  });
});
