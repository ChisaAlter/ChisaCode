# Provider 探测风暴与 error 可见性（2026-08-13）

阶段一已落地并完成打包桌面验证。本文是契约说明，不是调研笔记。路线图条目见 `docs/refactors/comprehensive-improvement-roadmap.md`。

## 用户可见行为

- 打开模型选择器不再触发全量 provider 重探。选择器只做 stale snapshot 读取；daemon 已有的 warm-up 和 `providers_snapshot_update` PUSH 负责把 loading 推到终态。
- provider 进入 `error` 后，上次成功拿到的模型列表仍显示、仍可选。composer 不得把已选 provider 清成「请选择模型」。
- `unavailable` / disabled 仍然不可选。
- 用户点某个 provider 的「重试」才对该 provider 做定向 force。Settings 的显式刷新仍是全量重探。
- 对仍处于 error 的 provider 发送/创建会在 daemon `getReadyProvider` 失败，错误必须暴露，不得静默。

## 实现契约

### App

- `useProvidersSnapshot().refetchIfStale()` 只调用 `refetchProvidersSnapshotIfStale`（active + stale query refetch）。禁止再引入 `refresh-now` / `refreshSnapshot(undefined)` 作为选择器打开路径。
- `RESOLVABLE_PROVIDER_STATUSES` 与 `SELECTABLE_PROVIDER_STATUSES` 包含 `error`。
- 选择器对 error + last-good models 显示琥珀色「缓存」徽标和钻取警告头；从未有缓存的 error 保持空态 + 重试。
- composer 触发器在选中 error provider 时显示琥珀色点，不增加 cbar 高度。

### Server

- `loadProvider` 在已有 in-flight load 时复用该 promise，包括 force 路径。`refreshSettingsSnapshot` 先清缓存再 force，所以 Settings 刷新仍是新探测。
- 未指定 provider 列表的全量 force 跳过 `status === "ready"` 且 `fetchedAt` 新于 60s 的条目。定向 force 不受此限。
- `DEFAULT_REFRESH_TIMEOUT_MS` 保持 30s。不要把默认改成 10s：Windows 冷 spawn + MCP venv 会误报 error。

## 已验证

- 聚焦 vitest：`use-providers-snapshot.test.ts`、`provider-snapshot-manager.test.ts` 守卫、`provider-selection.test.ts`、`resolve-agent-form.test.ts`。
- app / server typecheck、改动文件 lint/format。
- 打包 win-unpacked 实机：`npx tsx packages/app/e2e/desktop-provider-probe-gate.script.ts`。隔离 `CHISACODE_HOME` + 仅 mock / mock-slow。开选择器 unscoped refresh = 0；Mock 模型可选；Mock Slow 超时后 error 空态 + 重试，点重试回到 loading。证据 `.omo/evidence/desktop-provider-probe-gate-2026-08-13T02-48-23.md`。

原型：`prototypes/provider-error-visibility.html`。

## 阶段二（未做，勿与阶段一混交）

单次 `isAvailable()` / initialize 仍可能卡 30s，因为部分 runtime 会等机器级 MCP（cua-driver、taptap-maker、maker-lua-lsp）连上。阶段一只降频率、保列表可见，不缩短单次探测。

下一阶段应把探测与 MCP 握手拆开：initialize 不等 MCP 齐就返回，MCP 使用独立超时。在那之前不要宣称「探测风暴彻底消失」，也不要用用户真实 12-provider daemon 的一次超时来否定阶段一。

门禁脚本证明的是协议和行为，不是用户日常机器上的 MCP 冷启动时长。日常配置的抽检方式：打开选择器时 `daemon.log` 不应再因选择器打开刷出一批 `Failed to check provider availability`。
