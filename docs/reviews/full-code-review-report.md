# ChisaCode 全仓库代码审查报告

- **审查方式**：Lead（本 agent）拆解 10 个责任区，9 名 teammate 并发执行 + 1 名 Lead 接续，按共享 rubric 七维（A 正确性/健壮性、B 安全、C 协议兼容、D 性能、E 代码质量、F 仓库规范、G 测试健康）审查；Lead 逐条对抗性复核、对照 `docs/refactors/comprehensive-improvement-roadmap.md` 去重（tracked 判断）、汇总。
- **严重级**：P0=安全/数据丢失/崩溃；P1=常见路径行为错误；P2=退化/技术债；P3=吹毛求疵。
- **验证状态**：**[核]** = Lead 亲自逐行读代码确认；**[员]** = 队员发现并自述已读、Lead 未复核；**[驳]** = Lead 复核后驳回或降级（见 §6）。所有结论均为纯静态。
- **环境限制**：本会话 pwsh 沙箱 ACL 故障（`SetNamedSecurityInfoW failed (Win32 5): grantWrite(C:\Ai\ChisaCode)`），**所有结论均为静态审查**，未跑 typecheck / lint / vitest / Playwright / 实机；已逐项标注。
- **运行过程**：服务端/客户端/app 域初期子代理频繁中断，强制小步协议（读完即交付）后完成 9 个责任区；任务 #10（横切面）由 Lead 亲自执行。

---

## 摘要

共得出 **3 项 P0、14 项 P1、约 47 项 P2、约 62 项 P3**（含规范与测试卫生）。四条最重要的结论：

1. **唯一认证边界被穿透（P1 A-1）**：`buildExternalProcessEnv` 未剥离 `CHISACODE_PASSWORD`，所有 Provider 子进程（claude/codex/opencode/pi/kimi/grok/dsh/ACP/SSH）继承 daemon 明文密码，拿到密码即可 WS 全权控制 daemon。
2. **MCP 作用域校验在生产环境是死代码（P1 A-3）**：`voiceCallerContexts` 全仓无写入点 → `resolveScopeRoot` 默认返回 null → `assertAgentInScope` 短路返回。任意 agent 可跨 workspace 控制任意 agent（kill/archive/send/responder），并可写入任意路径。
3. **注册表损坏文件 fail-destructive（P0 D-1）**：`workspace-registry.ts` 的 load() 用空 cache 标记 loaded → 下一次写盘直接清空整个 projects/workspaces.json（server-data 独立发现同模式的 relay-device-credential-store 变体）。
4. **macOS 打包产物根本起不来（P1 C-3，大会截取）**：`after-pack.js` 把 pnpm deploy 暂存的 node_modules 固定复制到 win32 资源目录，macOS 打上包后 `@chisacode/server` 等运行时依赖完全缺席，而构建**静默"成功"**——这直接打破了 AGENTS.md 的头号不变量（"冷启动永远启动 daemon"）。

已验证合规的关键安全项（正面结论）：Electron webview 加固四件套、`--no-sandbox` 仅限 AppImage、Electron 特权 IPC 发送方校验、`atomic-write.ts` 的 fsync+rename 链路、protocol/relay 的 E2EE 协议设计（除下述发现外无架构级问题）、平台门禁 10 类 grep 专项仅 3 处违例（且均为低风险）、i18n 结构性 key 对齐断言、CLI/CLI 注入面无 command injection。

---

## 1. P0（3 项）

### D-1 P0 项目/工作区注册表损坏文件 fail-destructive：一次解析失败清空全部记录

- **位置**：`packages/server/src/server/workspace-registry.ts:141-160`（FileBackedRegistry 基类，projects/workspaces 共用）
- **类别**：A/C
- **证据 [核]**：

  ```ts
  try {
    const raw = await fs.readFile(this.filePath, "utf8");
    const parsed = z.array(this.schema).parse(JSON.parse(raw)); // 任一条坏记录 → 整体抛错
    ...
  } catch (error) {
    if (code !== "ENOENT") { this.logger.error(...); }          // 只记一行日志
  }
  this.loaded = true;                                            // 空 cache 仍标记已加载
  ...
  private async persist(): Promise<void> {
    const records = Array.from(this.cache.values());             // 空 cache → 写空数组
  ```

- **影响**：`projects.json`/`workspaces.json` 中任一条记录不合 schema（旧版缺 required-nullable `archivedAt`、字段类型漂移、截断 JSON）→ 缓存清空但 `loaded=true` → 第一次 upsert/archive/remove 就把"只剩 1 条"的数组**原子写回**，全部 project/workspace 记录**静默丢失**（agent 的 projectId/workspaceId 全失效，且 agent JSON 无法重建注册表——无 rebuild 路径）。与 `agent-storage.ts:372-381` 的显式防御（真实错误保持 unloaded 并 throw）直接矛盾。
- **叠加放大**：`workspace-registry-bootstrap.ts:55-64` 以 `existsOnDisk()` 为准——文件存在即不物化；坏文件存在时反而跳过 bootstrap，与 D-1 叠加成确定的静默全量丢失。
- **修复**：load 失败保持 `loaded=false` 并上抛给 `initialize()`；至少改逐条 `safeParse`、跳过坏记录；persist 前 assert loaded；补 4 条回归（坏记录不写盘/隔离备份；persist 失败不回退 cache；applySnapshot 并发不丢字段；git 截断 reject）。
- **tracked**：true（roadmap 在"registry/chat/schedule 持久化损坏文件静默覆盖（server，P2 数据）"已登记方案：损坏文件隔离备份 + 拒绝写入或只读模式；本报告认为严重级应从 P2 上调至 P0）。

### D-2 P0 relay-devices.json 损坏文件 fail-destructive：一次解析失败抹掉全部配对设备

- **位置**：`packages/server/src/server/relay-device-credential-store.ts:225-245`
- **类别**：A
- **证据 [员]**：`load()` 的 catch 返回空 store 后，后续任何 `persist()` 会把"空设备表"原子写回 `relay-devices.json`；且每个 relay hello 都 `new` 一个 store（读盘）+ verify/consume 后同步整文件原子写（且每个 hello 一次读 + 一次整文件写），重连风暴下每连接各一次。
- **影响**：一次 JSON 解析失败即永久抹掉全部配对设备（fail-closed 变 fail-destructive）；热路径再加剧。
- **修复**：同 D-1（损坏文件隔离备份 + 拒绝写入；upsert 合并内存非空记录）；另加 store 单例/带互斥。
- **tracked**：false。

---

## 2. P1（12 项）

### A. 安全簇（4 项，均 [核]）

**A-1 P1 daemon 明文密码继承到所有 Provider 子进程**
- 位置：`packages/server/src/server/chisacode-env.ts:4-10,20-34`
- 证据 [核]：`RUNTIME_CONTROL_ENV_KEYS = [CHISACODE_NODE_ENV、CHISACODE_DESKTOP_MANAGED、CHISACODE_SUPERVISED、ELECTRON_RUN_AS_NODE、ELECTRON_NO_ATTACH_CONSOLE]`——无 `CHISACODE_PASSWORD`。`buildExternalProcessEnv()` 把这些删掉后，其余 `process.env` 原样下发给 agent。所有 Provider 子进程（claude/codex/opencode/pi/kimi/grok/dsh/ACP/SSH spawn）都走 `createProviderEnv→createExternalProcessEnv` → 继承完整 daemon env（config-auth.test.ts:42-51 亦证 CHISACODE_PASSWORD 优先级）。
- 影响：agent 子进程 `printenv` 即得 daemon 密码 → 拿密码可 WS `Bearer` 全权控制 daemon（这是本地 daemon 唯一的认证边界）。
- 修复：RUNTIME_CONTROL_ENV_KEYS 增列 `CHISACODE_PASSWORD`；或建立 SECRET_ENV_KEYS 单独剥离。
- **tracked**：false。

**A-2 P1 注入 agent 的 daemon MCP 配置缺 Authorization header，密码 daemon 上 agent M CP 全量 401**
- 位置：`packages/server/src/server/agent/agent-launch-config-controller.ts:223-241`
- 证据 [核]：注入的 `chisacode`/`chisacode-companion` 只有 `{ type: "http", url }`（仅 URL，无 headers）。而 HTTP Bearer 层（`auth.ts:113-150`）对设了密码的 daemon 全路径强制 `Authorization: Bearer ${password}`（仅放行 `/api/health`、`/api/source`）——`/mcp/*` 不在放行表。e2e 自证：`agent-mcp.e2e.test.ts:93` 自建客户端时显式带 `Bearer ${password}`，说明 MCP 路由会过这一层。
- 影响：设了密码的 daemon（relay/远程场景推荐姿态）下，agent 侧 MCP 工具（create_agent / wait_for_agent / companion 四件套）请求全部被 401 → 委派体系**静默失效**（客户端层把 401 当 RPC 失败）。
- 修复：委托时给配置加 `headers: { Authorization: "Bearer ..." }`（或专用 MCP scoped token）；stdio bridge 场景则改传参。 bootstrap 缺失：mcpBaseUrl 转 agent 侧时先认证通过也应计入测试。
- **tracked**：false。

**A-3 P1 MCP 作用域校验是生产死代码：任意 agent 可跨 workspace 操控任意 agent + 任意路径写入**
- 位置：`packages/server/src/server/agent/mcp-server.ts:262-271`（resolveScopeRoot 默认 null）+ `packages/server/src/server/websocket-server.ts:417,1453`（voiceCallerContexts 仅声明+getter，无写入点）+ `agent-control-mcp-tools.ts:605-627`（assertAgentInScope 在 scopeRoot null 时直接 return）
- 证据 [核]`resolveScopeRoot`：无 `lockedCwd` 且 `allowCustomCwd ?? true` → null；生产 daemon 中 `wsServer.voiceCallerContexts`（Map）**全仓没有任何 `.set()` 写入点**（grep 仅命中 :417 声明、:1453 读）。所以 `callerContext` 恒 null → `resolveScopeRoot` 恒 null → `assertAgentInScope():614-617` 的 scope 校验短路，且 `resolveCallerAgent()` 只保证"是 caller 的子 agent"，**不做**跨 workspace 归属校验。
- 影响：
  (a) 任意 agent 可对任意 agentId（跨 workspace）执行 archive_agent / kill_agent / cancel_agent / send_agent_prompt / respond_to_permission / update_agent / set_agent_mode——MCP 作用域校验在生产环境是**死代码**（只有 mcp-server.test.ts 注入 `resolveCallerContext: () => ({lockedCwd})` 时才走到受限路径）；
  (b) 配合 `resolveScopedCwd`/`resolvePathFromBase`（path-utils.ts）允许绝对路径/`~`/`..` 逃逸 → create_agent/terminal/worktree 可指向任意目录。
- 修复（fail-closed）：callerAgentId 存在时，`scopeRoot` 默认=caller.cwd（在 `voiceCallerContexts` 接线生效前先硬约束）；`resolvePathFromBase` 增加 scope root 包含性钳制。
- **tracked**：false。
- **备注**：测试恰好都通过注入 `resolveCallerContext` 触发受限路径——这组测试证明了受限分支是对的、但**没有证明**生产默认路径会走到受限分支；回归建议在测试里用生产真实构造（不注入 resolveCallerContext）断言 scope 生效。

**A-4 P1 Electron IPC：`desktop_daemon_pairing` 未列入 PRIVILEGED_COMMANDS，配对凭据可被任意 webview/子帧读取**
- 位置：`packages/desktop/src/daemon/daemon-manager.ts:63-93`（Set）vs `:862`（注册）
- 证据 [核]：`PRIVILEGED_COMMANDS` 含 `start/stop/restart_desktop_daemon`、写附件、skills、settings mutation、`encrypt/decrypt_relay_device_secret` 等 22 项，但**不含** `desktop_daemon_pairing`；而注册表 `:862` 把 `getDaemonPairing()` 暴露给 `chisacode:invoke`，后者跑 `daemon pair --json` 拿 {relayEnabled, url, qr}（含配对 token）→ `registerDaemonManager`（:940-957）只对 Set 内命令做 `isMainAppSenderUrl` 校验。
- 影响：被攻陷的浏览器面板 webview 或子帧（能调 `window.chisacode.invoke`）即可拿到本机 daemon 的 relay 配对 URL/QR——这是给远程设备授权 daemon 的凭据类工件。
- 修复：`"desktop_daemon_pairing"` 加入 `PRIVILEGED_COMMANDS` 并在桌面测试断言 Set 覆盖。
- **tracked**：false。

### B. 状态机簇（2 项）

**B-1 P1 relay E2EE 致命错误路径不置 closed，上层继续对死 socket send** [核]
- 位置：`packages/relay/src/encrypted-channel.ts:440-454`
- 证据 [核]：`decrypt`/协议错误时只 `transport.close(code, reason)`，**不置 `this.state = "closed"`、不触发 `events.onclose`**、不清 `securityContext`。而 `send():494-496` 的守卫是 `this.state !== "open"`——上层 relay-transport 不知道通道已毁，继续 `send()` 每次都失败。
- 修复：抽统一 `fatalClose(code, reason)`：state="closed"、清 securityContext、events.onclose、走 onCloseCallbacks。`handleDaemonRehello` 的 key-mismatch 关闭路径（:541-545）同根。

**B-2 P1 [驳-降级] workspace transform 补值陷阱**
- 位置：`packages/protocol/src/workspace/messages.ts:376-410`
- 证据 [核]：`WorkspaceDescriptorPayloadSchema.transform()` 把 `workspaceDirectory` 兜底成 `projectRootPath`，`z.infer` 因 transform 把它标为非可选 `string`——safeParse **成功**时一切正常；只有 safeParse 失败后"手写 fallback 对象"的路径会漏掉该字段。 ProjectCheckoutLite 三个变体重复 3 份同逻辑。
- 影响：不致命，仅 fallback 路径类型收缩不一致，可能 `workspace.workspaceDirectory.split(...)` 在 fallback 路径下炸；wire-sec 原判 P1 过强，Lead 降级。
- 修复：transform 改 `z.preprocess` + `.optional().default()`，让补值在 fallback 分支也生效；抽共享 helper。

### C. 资源簇（2 项）

**C-1 P1 ACP 系 Provider 关闭不杀进程树：npx/bunx 启动器下孙进程成孤儿** [员/结构核]
- 位置：`packages/server/src/server/agent/providers/acp/process-runtime.ts:185-194` + `session-lifecycle-controller.ts:93/235`
- 证据 [员]`process-runtime.ts` 只用 `child.kill("SIGTERM")` + 2s SIGKILL；而 codex（`app-server-transport.ts:6`）/opencode（`server-manager.ts:9`）/pi（`cli-runtime.ts:8`）均改用 `utils/tree-kill`.  `generic-acp-agent.ts:259-261 isPackageRunner` 自认启动器常为 npx/bunx/pnpm/uvx。
- 影响：close/archive/daemon 退出后，POSIX/Windows 下 agent 孙进程获孤儿身份继续执行（拿的是用户机器执行权）——同仓其他 provider 已修过同类问题，ACP 路径漏网（回归）。
- 修复：`terminateACPChildProcess` 改走 `terminateProcessTreeWithFallback`，保留 2s 宽限/SIGKILL 升级语义。

**C-2 P1 relay E2EE 握手前入站消息无界缓存（内存 DoS）[核]**
- 位置：`packages/server/src/server/relay-transport.ts:587-595`
- 证据 [核]：`pendingMessages: Array<string | ArrayBuffer> = []` 在握手完成前对每条入站消息 `pendingMessages.push(data)`——无条数/字节上限。而 relay data socket 单帧上限是 `RELAY_DATA_MAX_PAYLOAD_BYTES`（MB 级），攻击者在握手窗口内连续灌帧可让 daemon 内存无界增长。
- 修复：加条数+累计字节双上限，超限 close(1009/1011) + warn；或握手期不缓存直接丢弃并计数。

### C+. 构建/资源簇（3 项）

**C-3 P1 [核] after-pack.js 平台硬编码 win32：macOS 打包缺全部 workspace 运行时依赖，且构建静默"成功"**
- 位置：`packages/desktop/scripts/after-pack.js:124-148`（尤其 :131-135）
- 证据 [核]：

  ```js
  const targetNm = path.join(
    resolveResourcesDir(appOutDir, "win32"),   // ← 平台硬编码 win32
    "app.asar.unpacked",
    "node_modules",
  );
  function resolveResourcesDir(appOutDir, platform) {   // :96-100
    return platform === "darwin"
      ? path.join(appOutDir, `${EXECUTABLE_NAME}.app`, "Contents", "Resources")
      : path.join(appOutDir, "resources");
  }
  ```

- 影响链（静态推导）：
  1. 走 `scripts/build.js` 打 macOS 时，appOutDir=release/mac*，目标被写成 `release/mac*/resources/app.asar.unpacked/node_modules`——这是 electron-builder **从不打包**的伪路径；真正位置 `release/mac*/ChisaCode.app/Contents/Resources/app.asar.unpacked/node_modules` 保持为空。
  2. 而 `packages/desktop/src/daemon/runtime-paths.ts:40-56` 在 packaged 模式下要求 `resolvePackagedAsarPath()/node_modules/@chisacode/server/dist/scripts/supervisor-entrypoint.js` 存在（`assertPathExists` 抛"内置 daemon runner 缺失"）——即桌面 daemon 硬绑定冷启动的入口。
  3. 于是 `@chisacode/server`/`@chisacode/cli`/`protocol`/`relay`/`better-sqlite3` 全部缺席；随后的 `rebuildElectronNativeModules` 因列表空直接 return（after-pack.js:157-159）、`pruneNativeModules` 因目录不存在直接 return（:82-83）——两级静默跳过，构建照常打印 "Copied staged production node_modules: N top-level packages" 并成功。
  4. 结果：**macOS 打包产物根本无法启动内置 daemon**（AGENTS.md"冷启动永远启动 daemon"头号不变量被破），构建期零告警。Windows 正确；Linux 因 deb/AppImage 恰好都是 `<out>/resources` 而"碰巧正确"。
  5. 死结：`build-x64.js:42-44` 只对 Windows 支持，macOS 只能走 build.js，无替代路径。
- 修复：`copyStagedProductionNodeModules` 按 `context.electronPlatformName` 取 platform（与 rebuild/prune 共用 :251-257 已有），并对目标目录写入后校验 `@chisacode/server` 入口存在，缺失即抛错而非静默。
- **tracked**：false（roadmap 只提到 build-x64.js 与 build.js 的 asar-integrity 逻辑需同步，未覆盖此平台硬编码）。
- **建议验证**：macOS 跑一次 `npm run build`，断言 `release/mac*/ChisaCode.app/Contents/Resources/app.asar.unpacked/node_modules/@chisacode/server/dist/scripts/supervisor-entrypoint.js` 存在。

**C-4 P2 [核] `desktop_daemon_pairing` 未列入 PRIVILEGED_COMMANDS（A-4 已详）**
（迁移 A-4 的生态条目，归此包不算重复。）

### D. 丢帧/静默失败簇（2 项）

**D-3 P1 client 丢帧路径全静默：Blob 解码失败让 readFile 悬挂 15min** [员]
- 位置：`packages/client/src/daemon-client-connection-controller.ts:476-483`
- 证据 [员]：`void rawData.arrayBuffer().then(...).catch(() => undefined)`——`arrayBuffer()` 一旦 reject（Blob 已关闭/detach、RN Blob polyfill 边界），该帧被无声吞掉；无日志/计数/waiter 拒绝。对文件传输=FileBegin 丢失，而 idle timer 只在收到帧时武装（file-transfer.ts:100），readFile 的上层 waiter 挂到 15 分钟超时才报错（daemon-client.ts:1366）。
- 修复：`.catch` 内按 transport 身份 warn + dropped 计数；对已知 requestId 主动 reject waiter。同组：`daemon-client-inbound-controller.ts:196-200,185-188` 的 malformed JSON/对象负载/二进制不可解帧丢弃零日志零计数，与 schema invalid 的 warn（211-215）不对称；`daemon-client-relay-e2ee-transport.ts:190-196` handler 异常静默吞。

**D-4 P1 terminal 流帧 slot 单字节截断：跨终端数据串显** [员]
- 位置：`packages/protocol/src/binary-frames/terminal.ts:66-92`
- 证据 [员]：`bytes[1] = input.slot & 0xff`；`input.slot: number` 无 schema 约束。slot 1 与 257、255 与 511 帧在 wire 上完全一样。
- 影响：调用方错误传入 ≥256 的 slot → 整帧输出写入**错误终端**缓冲区（跨会话数据串显），且不报错。
- 修复：encode 侧 RangeError；slot 参数改 `z.number().int().min(0).max(255)`；补 round-trip 边界测试（0/255/256）。

### E. 索引/文档簇（2 项）

**E-1 P1 SQLite 索引零自愈：无 user_version / busy_timeout / 事务，漂移即永久陈旧**
- 位置：`packages/server/src/server/agent-index/agent-index-rebuilder.ts:8-14` + `sqlite-agent-index.ts:39-44,111-119` + `agent-index/schema.ts:1-30`
- 证据 [员]：rebuilder 只在 `isEmpty()` 为真时重建；schema 用 `CREATE TABLE IF NOT EXISTS` 且无 `PRAGMA user_version`，将来加列的旧库每次 upsert 抛错被 `agent-storage.ts:479-485` 吞成 warn → 索引永久陈旧且无恢复路径；upsetTimelineItems 的 DELETE+逐行 INSERT 无事务（崩溃即半更新）。
- 修复：`PRAGMA user_version` + 版本不匹配即删库重建 + rebuild 条件改"版本不匹配或空" + 事务 + busy_timeout + WAL。

**E-2 P1 `agent_timeline_search` 是死表：`upsertTimelineItems()` 无生产调用方 [核（grep）]**
- 位置：`packages/server/src/server/agent-index/sqlite-agent-index.ts:95-109`；`docs/data-model.md:99-101` 声称该表受维护。
- 证据 [核]全仓 grep `upsertTimelineItems` 仅命中接口声明(:21)、实现(:95)、sqlite-agent-index.test.ts:119。
- 影响：时间线搜索能力实际不存在（dead code + 文档漂移）。
- 修复：接入 timeline flush 或删除方法/表/文档。

---

## 3. P2（约 45 项，按包归类）

### 3.1 server（18 项）

| # | 位置 | 要点 | 验证 |
|---|------|------|------|
| S-1 | `provider-registry.ts:1284-1290` | `shutdownProviders()` 每次都 `createAllClients` 新建一批 client 再 shutdown——真正跑过 provider 的 client 永不关闭；2 个 real e2e 用它做清理 → 残留 provider 子进程。正确样板：`provider-snapshot-manager.ts:518-527` 的 `shutdownAgentClients(clients-from-cache)` | [核] |
| S-2 | `agent-archive-controller.ts:66-70` | `closeAgent()` 在 `cascadeArchiveChildren()` 前且未容错：archivedAt 已落盘、close reject（provider 进程已死等） → cascade 不执行 → 子 agent 泄漏（违反 docs/agent-lifecycle.md cascade） | [核] |
| S-3 | `bootstrap.ts:1337-1348` | `mcpDebug` 记 `url: req.originalUrl` 未脱敏——companion MCP URL 的 query 带 `companionToken=<uuid>`（companion-mcp-injection.ts:29-33）→ 开 debug 即令牌明文入 daemon.log；同段 `authorization` 已 REDACTED 成反差 | [核] |
| S-4 | `dsh-agent.ts:337-343` | `execSync("npm root -g", timeout:5000)` 构造期同步执行，而 `provider-registry.ts:465-469` 注释明确"kimi/dsh 必须懒构造、同步 vendor I/O 不得位于冷启动路径"——`getAgentManagerProviderState()` 每次 bootstrap/applyMutableProviderConfig 仍同步构造 dsh/kimi，首次启动 daemon 事件循环阻塞最长 5s（WS/MCP/广播全停；Windows 冷启动必中） | [核] |
| S-5 | `dsh-agent.ts:169-190,320-324,395` | ① composition home 由 providerId+baseUrlHash 决定（无 session 维度），pinCompositionForConfig 按请求 model 重写同一份 `cordis.yml`，两并发 createSession（不同 model）交错 A 跑错模型；② `writeManagedDshCompositionAtomic` 的 tmp 名仅 pid+Date.now()，同毫秒并发写同名 tmp 致 renameSync ENOENT | [核] |
| S-6 | `agent-storage.ts:281-304` | `applySnapshot` 读-改-写竞态：两并发快照都基于同一 existing 重建，后到 write 用旧 existing 覆盖字段（生成 title 被打回 legacy title / createdAt / archivedAt） | [员] |
| S-7 | `workspace-registry.ts:162-174` | `persist()` 手写 temp+rename，无 `datasync`（对比 utils/atomic-write.ts:59），persist 失败后内存永久领先磁盘、目录残留 .tmp——`docs/data-model.md:37` 声称"Atomic writes (temp file + rename)"实际缺 fsync；roadmap:584-610 的原子写统一清单漏收该处 | [核] |
| S-8 | `workspace-registry-bootstrap.ts:55-64` | `existsOnDisk()` 存在即不 bootstrap，与 D-1 叠加成确定的静默丢失 | [员] |
| S-9 | `run-git-command.ts:285` | stdout 超 maxOutputBytes 时置 `truncated=true` 并 SIGKILL，close 时 `exitCode=null/signal=SIGKILL` 且因 `!truncated` 跳过错误判断 → 对解析型调用把不完整输出当成功返回（git-snapshot.ts:266、checkout-git diff/status 均走此路） | [员] |
| S-10 | `chisacode-worktree-archive-service.ts:104-192` | 归档中止不回滚已归档 agent：`git worktree remove` 因脏拒删时状态回 active 但 agent 已软删，UI 上消失且重启仍归档 | [员] |
| S-11 | `workspace-reconciliation-service.ts:151,198,347,99` | ① 每 60s 一轮用 `existsSync` 探测（同步 I/O，网络盘不可达时阻塞事件循环）；② "不可达"与"不存在"不分即被 archive 且**无 un-archive 路径** → 网络盘/移动卷短暂离线 = 永久软删 + 级联 project；③ 同仓已有异步 `detectStaleWorkspaces(checkDirectoryExists)`（workspace-registry-model.ts:214-232）但是死代码 | [员] |
| S-12 | `relay-transport.ts:283,449-452` | `connectControl` 未包 try/catch：`createWebSocket(url)` 同步 throw → 在启动路径直接冒泡使 daemon 起不来；在 reconnect timer 里冒泡成 uncaughtException 打挂进程 | [员] |
| S-13 | `websocket-server.ts:781-809` | `close()` 等待每个 socket `close` 事件无超时：半开连接（ws 已 close 但 TCP 未回 FIN）永久挂住优雅关闭/测试 teardown | [员] |
| S-14 | `workspace-update-controller.ts:139-148` | bootstrap 失败时 `handleFetchAgents` 抛错把 subscription 置 null，已缓冲增量更新被静默丢、不重发；`recordGitState` 热路径对每 workspace 逐 git 子进程（未走 Metro coalesce） | [员] |
| S-15 | `websocket-server.ts:705-714` | `broadcast()` 无 try/catch + 对全部 socket unbounded iter send，三条共用路径（server_info/daemon_config_changed/attention）均全量广播；对比 `sendToClient()`（826-831）有 try/catch，防护不对称 | [员] |
| S-16 | `relay-device-credential-store.ts:225-245` + `websocket-server.ts:1122` | relay hello 每次 `new` store + 整文件同步写（每连接两次同步 I/O），坏文件见 D-2 | [员] |
| S-17 | `git-snapshot.ts:65-83,367-368` | 快照 key 是原始 cwd 字符串（大小写/尾分隔符差异绕开串行化）；rewind `files` 是协议入参但未复用 `validateSnapshotLeafPath`、未按 `INDEX_PATH_BATCH_SIZE` 分批（对比 :432） | [員] |
| S-18 | `utils/tree-kill/_未聚合_` | S-1/ S-4/S-7/S-12 都属"该走 helper/正确路径但没走"的同类分散；建议抽 `safe -lifecycle` 统一伺服 | [核] |

### 3.2 client / SDK（6 项）

| # | 位置 | 要点 | 验证 |
|---|------|------|------|
| K-1 | `packages/client/src/index.ts:468-476` | SDK `workspaces.ref().refetch()` 固定 `page.limit=25` 且从不读 `pageInfo.hasMore/nextCursor`（protocol 侧上限 200）→ 目标 workspace 在第 26+ 条时静默返回 null，误导为"已删除"（agent-create/CLI 用户可见） | [核] |
| K-2 | `packages/client/src/index.ts:381-385` | `createChisaCodeClient` 硬编码 `clientType: "cli"`，所有 Electron/web/mobile SDK 消费方对 daemon 自报为 CLI，且 config 类型未透出该字段可覆写 | [員] |
| K-3 | `daemon-client-file-transfer.ts:75-77` + `daemon-client.ts:1845` | `clearActiveTransfers()` 只清 map 不清 idleTimers：每次 reconnect 残留 60s setTimeout（拖住 CLI 退出/对已死 requestId 发"idle timeout"合成失败响应） | [員] |
| K-4 | `daemon-client-relay-e2ee-transport.ts:190-196`、`terminal-stream-router.ts:126-129`、`daemon-client-transport-utils.ts:79-81` | handler 异常静默吞（`catch { }`），与 inbound-controller warn 不对称 | [員] |
| K-5 | `daemon-client-inbound-controller.ts:198-215,245` | 帧丢弃无计数：malformed JSON/对象负载/二进制不可解帧直接 return，daemon-client runtime metrics 只记录成功案例，drop rate 不可观测 | [員] |
| K-6 | `daemon-client-connection-controller.ts:294`/`288-293`、`498-523` 与 `inbound-controller.ts:227-231` | `checkLiveness` 聚合共享同一 promise，任一方缺 catch → unhandled rejection；`relay_device_auth_result` 路由（含 deviceSecret 落回）**零单测覆盖**（安全敏感） | [員] |
| K-12 | `cli/src/utils/client.ts:186-190`、`64-73`、`156/164`；24 个命令的"Cannot connect to daemon at ${host}" | 显式 host 原样返回（可含 `?password=`），连接失败时把 daemon 密码明文打到 stderr（CI 日志/共享终端/截图/issue）；`--listen` 写入 `config.json` 后同样保留 query、后续连接失败同样复现 | [核] |
| K-13 | `cli/src/utils/client.ts:145,187,243` | 同一 env 变量重复读取 3 处（`CHISACODE_LISTEN ?? CHISACODE_LISTEN` 等）——若本意是第二个变量（CHISACODE_DAEMON_*），设了却不生效且无报错 | [核] |

### 3.3 protocol / relay（9 项）

| # | 位置 | 要点 | 验证 |
|---|------|------|------|
| P-1 | `binary-frames/file-transfer.ts:22`、`terminal.ts:9` | `.strict()`：新增可选字段 → 旧客户端整个 FileBegin/Resize 帧被丢弃（下载 0 字节/挂起）——与"新字段必须 optional + defaulted"契约冲突；文件对比：AgentCapabilityFlagsSchema 的三 rewind 字段（`protocol/src/messages.ts:31-37`）用了 optional+default，同一仓两种做法并存说明 strict 是回归 | [核] |
| P-2 | `agent/state.ts:207-215` | `ToolCallBasePayloadSchema.strict()` + 4 个 status 变体 strict + union：daemon 将来给 tool_call 增加字段 → 全部变体解析失败 → union 失败 → 整条 timeline 项（agent 的 tool 卡片流）被静默丢弃 | [核] |
| P-3 | `provider-config.ts`（17 处 strict）+ `daemon/messages.ts`、`terminal/messages.ts`（5） | 29 处 strict wire schema——系统性回归；建议统一改为 optional+default 或 `z.preprocess` 归一化，并为"未知字段不致命"加回归测试 | [核（grep）] |
| P-4 | `messages.ts:150-176` | `ClientHeartbeatMessageSchema.deviceType: z.enum(["web","mobile"])`：新 surface（desktop/CLI）发 `"desktop"` 类型会被旧 daemon 整个 heartbeat 丢；`lastActivityAt: z.string()` 无 `.datetime()` 格式校验 | [員] |
| P-5 | `messages.ts:587-597 vs relay-device-auth.ts:45-57,61-71` | `relayDeviceAuth` 在 WS 层与 relay-device-auth.ts 双份实现：① WS 层 challenge 非必填（protocol 版必填）；② `RelayDeviceAuthResult` 字段集 WS 版含 `deviceId`、protocol 版无——同一 wire message 两个 truth，server/relay-device-auth.ts 又一份 | [核] |
| P-6 | `workspace/messages.ts:376-410` | transform 补值陷阱（见 B-2）；另比作 3 份 ProjectCheckoutLite 同逻辑 | [核-降级] |
| P-7 | `workspace/messages.ts:412-430` | `fetch_workspaces_response.pageInfo.nextCursor: z.string().nullable()` vs 请求侧 `page.cursor: z.string().min(1).optional()`：空串 cursor 新/旧 daemon 行为不一致 | [員] |
| P-8 | `crypto.ts:340-376` | decrypt 只在 `< NONCE_LENGTH` 时 throw，未校验 tag-overhead——`nonce.slice(SALT_LENGTH)` 但 tag 侧 nacl 抛 "Decryption failed"，**不影响安全**（fail-closed）；但 relay 处理路径（433-436）依赖该异常做"garbage bytes"重同步——无独立 oracle 离需要改进 | [驳：wire-sec 原认为"salt tampering fatal close 在首帧失效"（P1）——Lead 复核：`salt = nonce.slice(0, SALT_LENGTH)` 长度固定、`enforceReplayProtection` 首帧仅 seed 是基线锁定设计、Poly1305 本身拒篡改；无独立 oracle → 驳回为非问题] |
| P-9 | `relay-device-auth.ts:1-96` | transcript 用 `\n` 拼接字段（`[v=..., serverId=..., daemonPublicKeyB64=..., ...].join("\n")`）且 schema 未排除 `\n`；server 侧另有重复实现（`server/relay-device-auth.ts:3-5`）——字段歧义本身不直接影响（server 只 HMAC 比较 transcript 字符串），真正问题是**双份实现漂移风险**（协议 schema + server 实现 + WS 层注入处三份） | [核-降级] |
| P-10 | `connection-offer.ts:32-43,62-67` | `parseConnectionOfferFromUrl` 用 `globalThis.atob` 做 base64url，非 base64url 输入抛 `InvalidCharacterError`（DOMException），CLI/.pairing UX 回落至"配对码已损坏"文案；未知字段被 zod 默认 strip——旧客户端读新 offer 不感知降级内容 | [員] |

### 3.4 app composer / agent-stream（20 项）

| # | 位置 | 要点 | 验证 |
|---|------|------|------|
| A-1 | `composer/index.tsx:436-441` | 30s fallback 定时器在 `!hasPendingSend \|\| isServerAdopted` 时早退；残余风险只在"daemon accepted(pendingRun) 但 agent_stream projection 因 seq gap/epoch 延迟 >30s"时弹"发送超时"→ 用户重发 → 重复消息（roadmap first-send 语义争议待裁决） | [员/驳-降级] |
| A-2 | `composer/delivery-controller.ts:147-173` | `sendAgentMessageRef` 闭包捕获 serverId，`agentIdRef` 走另一条 ref——快速切换 agent 时旧句柄可能把消息写到原 server 的 stream map（跨服务器串流/静默丢消息） | [員] |
| A-3 | `composer/submit.ts:42-49` | `queueComposerMessage` 在 text+attachments 均为空时返回 `queued:null`，submit.ts 仍执行 `setUserInput("")` + 返回 "queued" → 空输入被清且误报成功 | [員] |
| A-4 | `composer/queue-controller.ts:106-122` | `handleSendQueuedNow` 失败回滚把消息插队首（`[item, ...prev]`），打乱 FIFO——roadmap 未质疑语义，待裁决 | [員/驳-conflict] |
| A-5 | `agent-stream/stable-layout.ts:81-115`、`layout.ts:272-332` | 行级复用要求 `prevItem.items === current.items`（数组引用全等），而 `layoutSegment():312` 把 `input.items`（该 segment 的完整 tail 数组）赋给每行——流式路径上游 model 是否按 segment 缓存该引用决定稳定早退是否成立；**与 roadmap M2（2026-09-08 完成 / 23/23 测试）冲突，静态无法裁决，建议 Playwright+DevTools 实测** | [驳-待验] |
| A-6 | `agent-stream/view.tsx:841-882` | 行渲染未抽 memo，`streamLayout` 每帧导致所有行重渲 | [員] |
| A-7 | `agent-stream/view.tsx:1402-1416` | 死样式 `syncingIndicator`/`invertedWrapper` 与组件不存在 | [員] |
| A-8 | `composer/use-composer-scroll-collapse.ts:28-30` | `document.querySelector(...)` 无 `isWeb` 守卫裸 DOM API（调用侧有守卫、函数本体未封装） | [員] |
| A-9 | `composer/banner/composer-banner-stack.tsx:249-250` | `Pressable.onHoverIn/out` 驱动外部状态（peek chip 展开），违反 docs/hover.md 规范模式（同文件 1191 才是规范写法：View + onPointerEnter/Leave） | [員/合规核验] |
| A-10 | `composer/input/height-mirror.web.ts:46-71` | mirror append 在 effect（Passive）晚于 layoutEffect 的 measure → 首帧输入高度停在 MIN_INPUT_HEIGHT，到用户打第一个字符才纠正 | [員] |
| A-11 | `composer/agent-controls/index.tsx:664-667` | 模型选择先写 preference 后发 RPC，RPC 失败只 toast 不回滚 preference → 本地显示与 daemon 不一致（重启后复现但未选） | [員] |
| A-12 | `composer/attachments/workspace.tsx:95-187` | 用户手动移除 workspace 附件 → suppressedKeys 记内容 JSON —— review draft 内容变 → key 变不再抑制（附件偶现）；发送后 reset 但用户再编同样内容 → key 同仍被抑制（永久丢失）——乐观 UI 与 store 不一致 | [員] |
| A-13 | `composer/input/input.tsx:881-903` | dictation autoSend 与 `submitAgentInput` 的 "noop" 分支：语音输入既不清空也不发送，用户以为发送了 | [員] |
| A-14 | `composer/input/input.tsx:1890-1893` | iOS 硬件键盘 submit 未排除 dictating 期；`editable={!isDictating}`（L2061）与 keyboard submit 条件不一致 | [員] |
| A-15 | `composer/draft/input-draft.ts:111-146` | draft hydrate 的 generation vs cancelled 窗口：外部 restore pending auto-submit 时保存 effect 早退，卸载丢失输入 | [員] |
| A-16 | `composer/draft/workspace-tab.tsx:656-671` | auto-submit 的 create 成功但 onCreateSuccess 抛错时，乐观 sidebar 行/流条目已删，用户见"文本恢复+错误横幅"会以为 agent 不在跑 | [員] |
| A-17 | `agent-stream/bottom-anchor-controller.ts:712-726` | driver 在 render 体（非 effect）惰性创建，StrictMode 双调用产生两个 driver、第二个永不 destroy，旧 agent 的滚动回调打到新 agent 上 | [員] |
| A-18 | `agent-stream/strategy-native.tsx:152-172` | agentId reset 走两个独立 effect（顺序依赖声明次序），若有人把 metrics reset 上移到 hook 之前，driver 会先用旧 metrics 跑一帧 evaluate 导致跳到旧 agent 位置 | [員] |
| A-19 | `agent-stream/strategy-native.tsx:268-276` | `programmaticScrollEventBudget` 吞前 3 帧 scroll 事件与方向假设耦合：`maintainVisibleContentPosition` 的自动补滚可耗尽 budget，把用户紧接着的真实上滚误判为程序化 → 该 detach 时不 detach | [員] |
| A-20 | `agent-stream/strategy-native.tsx:320-325` | FlatList 缺 `extraData`：renderItem 用 `useStableEvent` 永久稳定、historyRows 引用不变但行内容变化时不会重渲 | [員] |

### 3.5 desktop / CLI（10 项）

| # | 位置 | 要点 | 验证 |
|---|------|------|------|
| DT-1 | `desktop/src/daemon/daemon-manager.ts:63-93` vs `:862` | `desktop_daemon_pairing` 未列入 PRIVILEGED_COMMANDS（**与 A-4 同**） | [核] |
| DT-2 | `desktop/src/daemon/daemon-manager.ts:723-735` | `stopDesktopDaemon()` 无 `assertBuiltInDaemonManagementEnabled`，而 `restartDaemon():731-735` 有——`manageBuiltInDaemon=false` 的用户预期桌面不能手动停，但 renderer 仍可经 `stop_desktop_daemon` 停掉内置 daemon（AGENTS.md 的硬绑定测试门禁只断言了 restart 抛错，未覆盖 stop） | [核] |
| DT-3 | `desktop/src/features/dialogs.ts:85-107`、`desktop/src/features/opener.ts:38-44`（Opener 补openPath 已核验正确） | `dialog:open/ask/askWithCheckbox`、`opener:openUrl`、`get-pending-open-project`、`browser:set-workspace-active-browser` 全部无 `isMainAppSenderUrl` 校验——与 `daemon-manager.ts:940-957` 的单一入口契约不一致：任意 frame 可枚举用户文件系统(dlg)、打开 URL、探取 openProject 路径、抢激活 browser | [员] |
| DT-4 | `features/opener.ts:38-44`（openUrl） | 只校验 http/https 协议白名单，无发送方校验 → 诱导/钓鱼 | [員] |
| K-7 | `utils/client.ts:335-347` | CLI 凭证落库 fire-and-forget：`void upsert(...).catch(...)`；CLI 立即结束时 0o600 存储可能还没落盘，下次连接退化为"需新 offer" | [員] |
| A-4b | `main.ts:507-533`（webview） | 已确认 4 件套：sandbox/webSecurity/disableDialogs/白名单完整性 + 负例测试齐备 | [员/健康] |
| A-4c | `main.ts:199-207`（`--no-sandbox`） | 已确认：仅 AppImage，`.deb/.rpm` 保持 sandbox（与 AGENTS.md 一致） | [核] |
| K-8 | `cli/src/utils/relay-device-store.ts:49-56,91-113` + `utils/client.ts:382-399` | CLI relay offer 设备认证链**正面核对**：write tmp + rename + mode 0o600（测试断言 :65）；secret/pairingToken 一次性 token 流程正确；落库失败只打 warning 不泄露 secret | [员/健康] |
| K-9 | `cli/src/commands/daemon/local-daemon.ts` | 无命令注入面（spawn argv 数组、env 透传、无 shell:true）；CLI 日志面无密码/token 落日志 | [员/健康] |

### 3.6 app 功能面（settings/voice/browser-pane/i18n/e2e helpers）（P3 归此包）

| # | 位置 | 要点 |
|---|------|------|
| F-1 | `screens/settings/custom-model-providers.ts:687-1012`、`voice/voice-runtime.ts:717-720`、`audio-engine.*.ts:133-298`、`pair-device-section.tsx:40/46-47` | 用户可见错误文案绕过了 i18n：toErrorMessage 优先返回 `error.message` 原文 → zh-CN 用户见英文、en 用户见中文混合；仓库已有正确范式（`composer/draft/create-flow.ts:298 appI18n.t`） |
| F-2 | `custom-model-providers.ts:983-995+1059` | back-compat shim 缺 `COMPAT(name)+版本+移除日期` 标注 |
| F-3 | `e2e/helpers/localized-text.ts:29` | `Daemon: ["Daemon", "守护进程"]` 过期（zh 真实串是"主机服务"）→ settings.ts:255 的负向断言匹配不存在字符串空转 |
| F-4 | `e2e/helpers/settings.ts:6-14` | `SECTION_LABELS` 的 value 是死数据，只有 `keyof` 用键集合 |
| F-5 | `browser-pane.electron.tsx:515-546` | crashRecoveryRef 组件级存活，webview 重建 effect 不重置 crashTimes；切换 browserId 后 30s 窗口旧 crash 计数透支新页面重试预算 |
| F-6（健康） | `browser-pane.electron.tsx:603-612,143-153,752-768` + `main.ts:507-533` + `browser-webview-security.test.ts` | webview 加固四件套逐条核对无 weakening；sandbox/webSecurity/disableDialogs/preload 剥离 + src 白名单 + partition 校验 + will-navigate/setWindowOpenHandler 负例均测试；应用侧只传 5 个非敏感属性 |
| F-7（健康） | `i18n/index.test.ts:105-110`、`i18n/index.ts:4059`、`ProvidersRoot.tsx:50` | i18n 结构性对齐：flattenKeys zh/en 全量相等断言 + fallbackLng=en + changeLanguage 接线 |
| F-8（健康） | `use-settings/storage.ts`、`desktop-settings.ts`、`custom-model-providers.ts` | 设置持久化无 secret；API Key 不落本地（走 daemon config patch）；relay device secret electron→safeStorage IPC / native→SecureStore / web→内存 |

---

## 4. P3 汇总（约 60 项，按类别归类）

### 4.1 规范偏差（F）

| 位置 | 问题 |
|------|------|
| `components/ui/context-menu.tsx:817`、`dropdown-menu.tsx:852` | StyleSheet 工厂内联 `Platform.OS === "web"` 而非导入 `isWeb`（AGENTS.md 明禁） [核] |
| `composer/keyboard-controller.ts:56`、`composer/agent-controls` | `typeof document !== "undefined"` 代替 `isWeb` 门禁 |
| `agent-stream/view.tsx:314`（Platform.OS 软分支，合规但风格不一致）、`agent-stream/view.tsx:412-424`（turnTiming 依赖标记"已核查通过"） | — |
| `expandable-badge.tsx:1230-1238` | Pressable `onHoverIn/onHoverOut` 驱动外部状态（`onDetailHoverChange`），违反 docs/hover.md 规范模式 [员] |
| `file-explorer-pane.tsx:166` | 数组 index 作 key（`key={i}` 的 IndentGuide；无重排故不可见，但 oxlint 应抓） [核] |
| `client/index.ts:380-378` / `daemon-client.ts:547` | 公开 API 缺 JSDoc（@param/@returns/@throws） |

### 4.2 文档漂移

| 位置 | 问题 |
|------|------|
| `provider-registry.ts:957` | 注释"all 6 faces"实返 7（dsh 未同步） |
| `docs/data-model.md:99-101` | 声称 `agent_timeline_search` 受维护，实际死表（见 E-2） |
| `docs/refactors/comprehensive-improvement-roadmap.md:57` | "CI 仍用 npm ci" 已不着：`.github/workflows` 全部 `pnpm install --frozen-lockfile` [核] |
| `dsh-agent.ts:330-343 vs provider-registry.ts:465-469` | 注释说"kimi/dsh 懒构造"，实现里 `getAgentManagerProviderState` 仍同步构造 dsh/kimi（见 S-4） |
| `composer/draft/create-flow.test.ts:203` | 用"isWeb is not defined"当 onBeforeSubmit 抛错文案（误导性 fixture） |

### 4.3 COMPAT 标注卫生

| 发现 | 位置 |
|------|------|
`COMPAT(relay-json-ping)` 目标移除日期 2026-11-13 已过期未清理，且只处理 `ping` 不处理 `pong`、旧 daemon 每次 ping `console.log` | `packages/relay/src/cloudflare-adapter.ts:358-378` |
67 处 COMPAT 扫描：无 `v0.1.X` 占位符（2026-08 S2 修复无回归），大多数带版本+移除日期 | [核grep] |
缺移除条件/日期的 5 处：`client daemon-client-connection-controller.ts:546`、`app utils/terminal-keys.ts:143`、`server agent/import-sessions.ts:80`、`cli daemon/status.ts:274`、`cli daemon/pair.ts:47` | [核grep] |
`CHISACODE_RELAY_ALLOW_UNAUTHENTICATED_RECOVERY=1`（`bootstrap.ts:1564-1589`）：emergency downgrade 带日期（2026-11-10），有 error 日志但**无启动横幅**——属"安全降级需大声审计"的缺口 | [核] |
`custom-model-providers.ts:983-995+1059` 的 supplyScope shim 缺 COMPAT 标注（见 F-2） |

### 4.4 测试卫生（G，系统性）

- 全仓 `vi.mock(` 341+ 处（app 组件测试大面积 mock react-native/unistyles），与 AGENTS.md"避免 vi.mock/JSDOM"相悖——属系统性"标准 vs 实践"分歧，建议 #10 统一裁定或明确豁免 [核grep 250+]。
- 全仓测试文件 `setTimeout(` 213 处——多数是 timeout/deadline/零延 defer，真固定等待集中在 `create-flow.test.ts`、relay 相关 e2e 等少数点，部分已被 `audit-tests.mjs` 基线（229→196）跟踪 [核grep、roadmap]。
- agent-stream/composer 区测试断言多为"行为+具体值"的高质量模式；残余弱断言残留（`composer-control.test.tsx:156,163` `expect(...).not.toBe("")`）与 vi.mock-heavy UI 组件测试（`turn-footer.test.tsx:112` mock 里调 useUnistyles——仓库已禁）有少数残留 [员]。
- app-shell G 系统观察：`components/ui/*.test.tsx` 等 10+ 文件大面积用 JSDOM+容器挂载+`vi.stubGlobal` mock `document/window`——若 #10 明确豁免，可以入册；否则需要推倒重写按照"纯函数+端口注入"模式。

### 4.5 日志/资源卫生

| 位置 | 问题 |
|------|------|
| `cloudflare-adapter.ts:358-378` | 旧 daemon JSON ping `console.log`（高频噪声） |
| `runtime-metrics.ts:136-141` | `bufferedAmountSamples` 无采样上限（高频广播下窗口内数组无界增长后整体 sort 求 p95） |
| `websocket-server.ts:1490-1497` | 90s 重连宽限 timer 未 `unref`（helloTimeout 有） |
| `websocket-server.ts:1592-1644` | 校验失败路径无速率限制（每 requestId 一条 rpc_error），可被用于日志放大 |
| `agent-control-mcp-tools.ts:311-338` | `list_agents` 对全部 active agent 串行化后再过滤 scope（agent 多时热路径全量序列化） |
| `agent-stream/use-aggregated-agents.ts` | AggregatedAgent 包装 cache 已选用 WeakMap（已存 `createAggregatedAgentCache`），未见问题 |
| `browser-store`、`ComposerBanner` | browser store 只存 title/url/宽度，无任何瞬态状态；banner stack 每渲染新建类 Component 的风险无（已 memo 化） |

### 4.6 杂项

| 位置 | 问题 |
|------|------|
| `composer/tasks-badge.ts:43-46` | `deriveComposerTasks` 把第一个 pending 强行置 in_progress 覆盖协议原 status（若 TodoItem 已带 status：应透传） |
| `composer/attachment-menu.tsx:163-170` | Codex `/goal` 菜单项写入 `/goal ` 后直接替换 user input（无草稿快照，可能吞掉已有输入） |
| `composer/runtime-controls.tsx:216` | cancel 按钮显隐条件与 send-busy 判据不统一——agent running + 有内容时两个按钮都消失 |
| `composer/agent-controls/index.tsx:355` | `favoriteKeys = new Set<string>()` 每帧新建 Set 引用 |
| `composer/turn-footer.ts` | running-footer 每秒 setInterval 重渲整个 footer（24px 文本频率高但成本可控） |
| `agent-stream/running-turn-footer.tsx:41-57` | —（同） |
| `e2e/helpers/settings.ts:6-14` | SECTION_LABELS value 死数据 |
| `e2e/helpers/localized-text.ts:29` | 过期 zh 变体守护进程（实际 DI 词） |
| `webview-crash-recovery.ts` | 逻辑正确无发现；衍生物见 F-5 |

---

## 5. 已确认健康的面（积极抽查结论）

1. **Electron webview 加固**：sandbox/webSecurity/disableDialogs/preload 剥离 + src 白名单 + partition 校验 + 负例测试齐备（browser-pane.electron.tsx + main.ts:507-533 + browser-webview-security.test.ts）。[员/核-抽查]
2. **`--no-sandbox` 仅限 AppImage**：main.ts:199-207 与 AGENTS.md 一致，`.deb/.rpm` 保持 sandbox。[核]
3. **Electron 特权 IPC 双门禁**：PRIVILEGED_COMMANDS + isMainAppSenderUrl——`chisacode://app` 精确匹配，`chisacode://app.evil.test`、`app@evil`、`https://localhost.evil.test`、`127.0.0.1.nip.io` 全被拒；`desktop_daemon_pairing` 例外已记 DT-1。[核]
4. **`atomic-write.ts`**：temp + datasync + rename + 父目录 fsync + 失败清理，实现正确。[核]
5. **Electron main 主窗 preload 目录剥离、isMainAppSenderUrl 负例覆盖**。[核-抽查]
6. **CLI relay offer 设备认证链**：token 一次性、store 0600、无注入、落库不泄露 secret。[员]
7. **workspace mutation coordinator**：runExclusive 链式排队、写租约、drain、祖先路径阻断设计一致。[员]
8. **无订阅零工作广播**：roadmap:89 的 buildDescriptorMap `scope.cwds` 预过滤到位（:177-181），无回归。[员]
9. **平台门禁**：未守卫 DOM API **0 违例**（app-shell 全量 grep + 抽查：所有命中均在 isWeb/isNative 守卫或 Metro 后缀隔离下）；`useUnistyles()` 仅 2 个 docs 明文豁免处（constants/layout.ts:188、context-window-meter.tsx:91）；hover 兜底 `isHovered || isNative || isCompact` 模式全仓约 6 处；`useIsCompactFormFactor()` 统一走 `@/constants/layout`。[员/核-扫]
10. **RPC 命名合规**：入站新 RPC 已全面点分化（project.rename、model_gateway.*、discovered_ports.*），COMPAT 均带版本+日期；扁平旧名属"保留待迁移"合规。[员]
11. **模型选择器/错误码**：`agent-controls` slice 模式 + `useShallow`、favoriteKeys memo 化、组合模型选择器 provider→model→thinking 三级 + gateway 列表链路正确。[员]
12. **i18n 结构性对齐**：`i18n/index.test.ts:105-110` flattenKeys zh/en 全量相等断言 + fallbackLng=en + ProvidersRoot changeLanguage 接线；抽查 3 组新 key 两侧齐备。[员]
13. **dsh 凭证错误**：DshCredentialsError code 稳定（DSH_MISSING_API_KEY）+ zh i18n，诊断只输出 env presence 布尔不泄露值。[员]
14. **重连状态机**：退避封顶、成功 attempt 归零、error/close 风暴只武装一个 timer、in-flight RPC 即时拒绝（onReset + requests.clear），已被 R1-R7/B1-B6 测试矩阵覆盖。[员]
15. **跨包热路径**：relay 广播 / workspace-update controller / agent-event forwarder 的"无订阅早退" 三处守卫均在位，无回归。[员]
16. **Speech/voice 域**：voice-runtime.ts 状态机 generation 守卫完整，timer 均在 stop/destroy 路径清理。[员]

---

## 6. 对抗性复核记录（Lead 对队员断言的裁决）

| 队员断言 | 裁决 | 理由 |
|--------|------|------|
| relay `crypto.ts` salt 首帧 tamper 致命 close 缺失（wire-sec P1） | **驳回（误报）** | [核] `salt = nonce.slice(0, SALT_LENGTH)` 长度恒定由构造决定；`enforceReplayProtection` 首帧 seed 是基线锁定设计；Poly1305 本身拒篡改，SECURITY.md:57 的"salt tampering fatal close"在首帧后同样成立；无独立 oracle |
| workspace `messages.ts` transform 补值陷阱（wire-sec P1） | **降级（→P2）** | [核] transform 在 parse 成功时生效，只有 safeParse 失败后手写 fallback 对象路径才漏补，与 `:405-410` 的 COMPAT 注释一致 |
| `relay-device-auth.ts` transcript `\n` 拼接字段歧义（wire-sec P2） | **降级（→P3）** | [核] server 只 HMAC 比较 transcript 字符串、从不解析回字段（`server/relay-device-auth.ts:23-57`）；真正的问题是双份实现漂移而非可注入 |
| `agent/state.ts` tool_call `.strict()` union（wire-sec P1） | **维持** | [核] `.strict()` + 4 变体 strict + union 意味着"新增可选字段 → 整个 timeline 项丢弃"，与兼容契约直接冲突（属 P-3 体系性支） |
| `stable-layout.ts` 早退形同虚设（app-composer #5/#44） | **待动态验证** | 与 roadmap M2（2026-09-08 完成、23/23 测试）直接冲突；静态无法定夺，建议以流式 Playwright spec + DevTools 渲染次数实测 |
| `composer/index.tsx:436` 30s 误伤（app-composer #1） | **降级（→P2）** | [核] `isServerAdopted` 置位即早退；残余只在"daemon accepted 但 projection 延迟 >30s"歧义场景 |
| `queue-controller.ts` FIFO 反转（app-composer #4） | **待裁决** | roadmap 未质疑语义（roadmap 记录 queue 头部恢复是设计），与 app-composer 断言冲突 |
| `workspace-registry.ts:141` fail-destructive（server-data P0） | **维持 P0 并纠正严重级** | [核] roadmap:828 已登记方案但实现仍缺失；D-1 验证同时纠正 server-data 判断"严重级低估"（roadmap 写 P2） |
| `scripts`/`relay`/`cli`/`desktop` 各域 | — | 全部在 9 个责任区内交付 |

---

## 7. 系统性问题（跨包至少出现 3 次，建议统一处理）

1. **"损坏持久化文件 fail-destructive" 模式**：workspace-registry（D-1）、relay-device-credential-store（D-2）、agent-index（E-1）同族。统一方案：load 失败保持 unloaded / 进入只读模式 + 损坏文件隔离备份 + 下次启动重载。
2. **静默失败/可观测性缺失**：丢帧零日志（client inbound）、Blob reject 吞、kicked 消息吞、validation-failure log 无尽速限制、runtime metrics 只记成功帧。建议分类 dropped/error 计数并入 metrics flush。
3. **资源生命周期分散**：子进程（S-1 shutdownProviders 关错对象、S-4 dsh execSync、C-1 ACP tree-kill）、timer（K-3 file-transfer idle、S-13 90s 宽限、S-12 connectControl）、driver（A-17 bottom-anchor）——建议统一 helper：`terminateProcessTreeWithFallback` 全覆盖、`CleanupToken` 管理 timer/driver。
4. **schema strict 化与兼容契约冲突**：29 处 `.strict()` + 相关 union。统一改 optional+default 或 `z.preprocess` 归一化，并加"未知字段不致命"回归测试。
5. **路径身份跨平台不一致**：workspace-directory / chisacode-worktree-service 用 `===`/`normalizeWorkspaceId()`（平台相关 resolve），`areEquivalentPaths` 已有却未复用；UNC/大小写/symlink 场景产生幽灵 id/重复记录。
6. **文档漂移**：注释"6 faces"/"懒构造"/"no migrations"/"CI 用 npm ci"与实现不符。建议建立"每次 PR 同步注释 + roadmap"的门禁。
7. **测试实践与 AGENTS.md 分歧**：341+ vi.mock、大量 JSDOM 挂载、"isWeb is not defined" 当 fixture——要么修标准、要么修测试、要么明确豁免（router 部门）。

---

## 8. 未覆盖 / 覆盖不足（如实声明）

- **已完成交付的 9 个责任区**：protocol+relay、client、server RT、server 数据层、server 网络层、app composer/agent-stream、app 外壳+平台门禁、app 功能面、cli+desktop——全部完成。
- **横切面（task-10，Lead）**：已完成 packages/protocol/relay/client/app 的 COMPAT 扫描、vi.mock/setTimeout 扫描、docs-vs-code（CI pnpm）、平台门禁 grep；未深读 packages/highlight（src 以其它扩展名布局）、packages/expo-two-way-audio、scripts/ 守卫自身——见下。

### 未逐行深读的范围（明确声明）

- **server**：codex/opencode/claude/pi 各 provider 内部（turn handlers/session runtime/event translator 等约 50 文件）；session.ts（2243 行）正文；session-handlers/ 其余 19 handler；server/terminal/、server/speech/、server/push/；worktree 12 文件的 checkout-git 子集；desktop/CLI 大部仅抽查入口。
- **app**：message.tsx、turn-changes-tree.tsx、build-turn-diff-tree.ts、assistant-file-links（#7 只扫了 hover 兜底）、command-center、combined-model-selector、panels 其余、maestro flows、部分 settings 深层。
- **cli+desktop**：`local-daemon.ts` 全文已抽查正な；协议/pair offer 已核；installer/update_check/daemon_launch 较深。
- **packages/highlight / expo-two-way-audio**：未做域内审查（由 Lead/后续轮次补）。
- **scripts/**：guard.test.ts、audit-tests.mjs、generate-modular-knowledge-graphs.mjs 等未读；**CI 是用 `pnpm install --frozen-lockfile`**（已核，与老的 npm ci 条目无关）。
- **验证方式限制**：所有结论为静态审查；390px 移动 viewport 崩溃、desktop/mobile 真实表面等须按 Release Gate 红测——本报告**不做**"实机验证已达成"的声称，所有高优先级项已在批次建议里标出优先验证点。

---

## 9. 修复优先级批次建议

**批次 1（安全/数据完整性，立即修）**：
- A-1 密码 env（1 行）、A-2 MCP auth header（注入 headers/scoped token）、A-3 scope 死代码（fail-closed 修正默认为 caller.cwd）
- D-1 workspace-registry fail-destructive（保持 unloaded + 隔离备份）、D-2 relay-devices 同族 + store 单例
- A-4/DT-1 desktop_daemon_pairing 入 Set、DT-2 stopDesktopDaemon 加 assert、DT-3 dialog:ask/askWithCheckbox/open + opener:openUrl 补发送方校验
- C-3 after-pack.js 按 `context.electronPlatformName` 取 platform + 写入后校验 `@chisacode/server` 入口存在（macOS 打包修复）
- C-1 ACP tree-kill
- C-2 relay 握手 DoS（pendingMessages 双上限）
- S-13/DT-2 close() 超时、stopDesktopDaemon 加 assert
- K-12 加 `redactDaemonHost()` 覆盖全部 24 处"Cannot connect to daemon at ${host}"
- K-13 修正 3 处 env 重复读取（确认意图后补正确变量名）

**批次 2（协议兼容 + 状态机）**：
- P-1/P-2/P-3 strict 化统一（29 处）：改 optional+default / preprocess 归一化 + "未知字段不致命" 回归测试
- P-4 clientHeartbeat deviceType 扩限
- P-5 WS/relayDeviceAuth 双源合并
- B-1 E2EE fatalClose 统一
- D-3/D-4 client 静默丢帧家族（含 waiter idle timer、Blob reject warn、dropped 计数）
- E-1/E-2 索引自愈 + 死表接入
- K-3 idle timer（file-transfer）
- A-4/A-5（app 队列/FIFO/30s busy 语义，与 roadmap 对齐产品裁决）

**批次 3（规范/文档）**：
- F 域 Platform.OS/local 门禁清理（context-menu/dropdown-menu 2 处 + keyboard-controller 1 处）
- 文档漂移修复（6 vs 7 faces、sessions 死表、CI pnpm）
- 公开 API JSDoc（client/index.ts + daemon-client.ts）
- COMPAT 缺日期补充 + relay-json-ping 过期清理 + RELAY_ALLOW_UNAUTHENTICATED_RECOVERY audit banner
- errorsMessages 结构化 code（settings/voice）

**批次 4（产品决策）**：
- A-1/roadmap first-send 语义（30s fallback）
- A-4 queue FIFO vs 头部恢复
- A-5 stable-layout 真流式实测 M2 完成性
- P-5 WS 级 relayDeviceAuth 两源合并
- 测试实践豁免 vs 修 test（vi.mock/JSDOM/route 部门）

---

_附录：见本目录 `remediation-plan.md`（即将生成，按批次排工单）。报告维护：Lead（Kimi K3 / DeepSeek Harness）。所有 file:line 以 cn-main 工作区为准，修复前请对照最新 HEAD 逐条复核。_
