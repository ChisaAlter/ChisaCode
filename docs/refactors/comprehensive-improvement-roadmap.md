# ChisaCode 综合改进路线图

> **状态：活跃维护**（2026-07-04 重启）
>
> 历史执行记录见 [archive/comprehensive-improvement-roadmap-2026-06-28.md](archive/comprehensive-improvement-roadmap-2026-06-28.md)。
> 归档后新增的系统性改进在此登记，作为单一事实源。

---

## 进行中

### 架构/依赖安全/全量 CI 提升目标（2026-07-12 启动）

- **目标**：继续拆解 client/provider/workspace 超大责任中心；完成 AI SDK、Claude SDK、Expo/EAS major migration；恢复 `cn-main` 全量 CI 的可信绿色基线。
- **执行顺序**：先清理确定性 CI 失败，再迁移高风险依赖，最后按领域拆分大文件；每批独立本地验证和提交，普通开发不再推送触发远端 CI。
- **已完成批次**：修复 workspace authority 稳定错误契约、draft `runtimeProvider` 快照、Generative UI manager queue 兼容测试、异步进程终止断言、ACP cwd 隔离测试、POSIX terminal `vi.waitFor` 误用、CLI 脚本/Vitest 分类、Wrangler 公开入口解析及 Windows `npx.cmd` 启动。
- **App/链路 CI 收敛**：E2E daemon 改为仅监听 `127.0.0.1`，满足无密码 loopback 安全约束；补齐 Vitest 的 `matchMedia`、Unistyles、safe-area、toast 与平台测试边界，修复 i18n 实例缺失、Aemeath 英文资源、Projects 空状态硬编码、provider icon/turn footer/高度缓存过期契约。20 个目标文件 152 个断言通过，`moduleMock` 审计从基线 303 降至 302。
- **CLI CI 收敛**：错误断言改为机器可读 `CONFLICTING_MODEL_OPTIONS` 或显式语言，避免默认中文下依赖英文文案；CLI 测试 helper 改为无 shell 的 Node 直启，移除 Windows WSL/zx 与 `cmd -> npx -> tsx` 生命周期偶合；readiness probe 增加进程退出诊断。开发态 mock provider 支持按基础 JSON Schema 生成确定性 structured output，真实 daemon E2E 不再依赖 CI 机器的 Claude/Codex/OpenCode 登录态。
- **Server/Android CI 收敛**：Android runtime module 补齐 Maven/Gradle version metadata，真实 `:chisacode-android-runtime:tasks` 配置成功；wildcard daemon E2E 保留 `0.0.0.0` 安全意图并统一使用 bcrypt 密码夹具，不启用无认证逃生开关；provider live-preferences 改用与 fake runtime 一致的稳定模型对。
- **认证/MCP 生命周期修复**：WebSocket 密码校验期间暂存并按序重放早到的 hello，修复 bcrypt 异步窗口丢消息导致的永久连接等待；预认证缓冲限制为 4 条/64 KiB，超限按 1008 关闭，避免未认证内存放大。MCP E2E 改用正式 `settings.modeId` 契约并断言运行态模式，后台 agent 的同步 `startTurn` 失败不再被吞成成功；worktree setup/terminal 探针改为跨平台 Node 命令并显式释放终端资源。
- **GitHub Actions 策略**：普通 branch push、PR 和 merge queue 不再自动触发 Actions；CI、Relay、Nix、Nix hash、release notes 改为手动触发，只有显式授权发布时运行。桌面/Android/App 构建仅保留版本 tag 触发；Dependabot 定时更新已关闭。后续优化默认只做本地提交。
- **状态**：进行中，直接在 `cn-main` 执行，不创建额外分支或 worktree。

### 2026-07-12 深度架构/安全/产品/代码质量审查批次（完成）

- **审查报告**：[deep-code-audit-2026-07-12.md](deep-code-audit-2026-07-12.md)
- **安全修复**：relay server socket 认证增加签发时间与 Durable Object 持久化 nonce 消费记录；默认拒绝过期、未来和重复凭证，且在关闭既有 socket 前完成校验。补重放/过期单测与真实 Wrangler E2E。
- **产品兼容修复**：`ProviderHandler` 拆分时遗留的 `LEGACY_PROVIDER_IDS.has(provider) || true` 永真逻辑已删除，重新委托 Session 版本兼容策略；旧客户端不会收到未知 provider id。
- **代码质量**：Knip CI 收敛为高信号依赖/未声明依赖/unresolved/binary 门禁并清零现有问题；修复失效 import、依赖归属、relay E2E hoist 偶合、异步测试竞态，以及 125 个锁文件镜像来源漂移。
- **依赖安全**：Vitest Browser 升至 4.1.10，Wrangler 升至 4.110.0；CI 与 app/relay 发布工作流统一阻断 critical advisories。剩余 high/moderate 主要来自 AI SDK 与 Expo/EAS 工具链，major migration 单独追踪，不使用错误的自动降级建议。
- **架构证据**：dependency-cruiser 807 modules / 1888 dependencies / 0 violations。边界健康，但 4k-5k 行责任中心仍是主要扣分项。
- **状态**：完成。本地精确验证通过；推送后由远端 CI 持续复验。

### 综合审查 CI 门禁收尾（2026-07-12 完成）

- **问题**：`scripts/test-audit-baseline.json` 早于默认分支既有测试债，导致基线提交本身无法通过 `npm run test:audit`；`package-lock.json` 同时保留 42 个 npm 镜像 tarball URL，与 CI 的 npmjs-only host 策略冲突。
- **影响范围**：`scripts/test-audit-baseline.json`、`package-lock.json`、`.github/workflows/ci.yml` 的 test-audit 与 lockfile-lint 门禁。
- **解决**：使用仓库审计脚本按默认分支真实计数重新校准 no-new-debt 基线；以 JSON/URL 结构化转换把 42 个 `registry.npmmirror.com` hostname 规范化为 `registry.npmjs.org`，保持包版本、路径和 integrity 不变。CI allowlist 未放宽。
- **后续**：当前基线仍包含 moduleMock 303、conditionalSkip 105、weakAssertion 349、processEnvMutation 151 等历史债；后续改动不得增加，并应按包拆成独立减债批次逐步下调基线。
- **远端复核**：首次实际触发 `cn-main` CI 后发现 npm 11 生成的 lockfile 删除了 desktop 精确依赖 `@types/node@24.6.0` / `undici-types@7.13.0`，导致 Node 22/npm 10 的所有 `npm ci` job 在测试前失败；同时 TruffleHog 重复传入 `--no-update`，Nix hash workflow 在 GitHub App secret 缺失时直接失败。
- **解决补充**：使用 CI 同代 npm 10 重新生成完整跨平台 lockfile；移除重复 TruffleHog 参数；Nix workflow 在 App secret 未配置时回退到具备最小 `contents: write` 权限的 `GITHUB_TOKEN`。
- **状态**：修复中；本地 npm 10 `ci --dry-run`、test-audit、lockfile-lint 和 workflow YAML 解析均退出 0，等待远端 CI 复验后关闭。

### 全项目代码审查修复批次（2026-07-05 起执行）

**背景**：对整个 monorepo 做三方向并行审查（安全敏感面 / 性能 bug / 测试覆盖），发现 2 CRITICAL + 7 HIGH + 12 MEDIUM（含 9 测试覆盖）+ 8 LOW。本批次逐项走完整周期：审查分析→计划→执行→测试→文档→提交归档，防止"修了又回滚"（根因 A/D：wildcard 硬语义曾被 `d1dcd2d3c fix(release): preserve patch compatibility` 有意撤回，测试同步降级为 `not.toThrow()`，绿测试掩护回归）。

**根因诊断**：

- **根因 A**：硬性安全修复被"patch 兼容"有意回滚（`95400d5bf` 真修 → `d1dcd2d3c` 撤回），名实不符（`assertWildcardAuth` 不再 assert）。
- **根因 B**：单点修复未触及通用代码路径（docker-compose 端口映射修了，daemon bootstrap.ts body limit / wildcard / loop verify-check 从未修）。
- **根因 C**：声称修复范畴与实际代码不匹配（`bf0a8e9a1` "2 CRITICAL" 指的是 E2EE 重放 + serverId 字符集，非 relay 路由鉴权）。
- **根因 D**：安全测试被改成断言不安全行为（`bootstrap-auth.test.ts` 从 `toThrow` 改 `not.toThrow`），CI 绿反而掩盖回归。

**进度**：

- [x] CRITICAL #2: relay v1 生产禁用 — `resolveRelayVersion` 缺省改 v2，显式 `v=1` 需 `RELAY_ALLOW_V1=1` opt-in（commit 待提交）
- [x] CRITICAL 根因 A/D: wildcard 硬语义恢复 — `assertWildcardAuth` 改回 fail-closed，`CHISACODE_ALLOW_WILDCARD_NO_AUTH=1` opt-in 兼容，测试恢复双语义（commit 待提交）
- [x] CRITICAL #1: relay v2 role=server 无鉴权 — daemon key bundle 增加持久化 Ed25519 relay-auth signing key；server-control/server-data URL 带 `relayAuthPublicKeyB64`/nonce/signature；relay 默认拒绝无签名 server socket，并在同一 DO 内把已验签 public key 绑定到 serverId，后续不同 key 不能替换既有 server socket。`RELAY_ALLOW_UNSIGNED_SERVER_AUTH=1` 为显式兼容逃生舱。覆盖 `cloudflare-adapter.test.ts`、`relay-transport.test.ts`、`connection-offer.test.ts`
- [x] 审查批次 A（2026-07-05）— HIGH #1: 每 IP 限流可被 `X-Forwarded-For` 伪造击穿。默认不信任 XFF（直连 daemon 无可信前置代理），新增 `CHISACODE_TRUST_FORWARD_HEADERS=1` opt-in 逃生舱供反向代理部署用。`bootstrap.ts:rateLimitKey`
- [x] 审查批次 A（2026-07-05）— HIGH #2: `handleFileDownload` 的 `Content-Disposition` 文件名注入残留。改 RFC 6266 `filename*=UTF-8''<percent-encoded>` 主形 + ASCII fallback 剥 `"`/`\`/控制字符/`;`，消除头注入/解析歧义。`bootstrap.ts:handleFileDownload`
- [x] 审查批次 A（2026-07-05）— MEDIUM #1: `extractWsBearerToken` 对 `chisacode.bearer.` 后段无长度/字符校验直接进 bcrypt `compare`。判空 + 长度上限 1024，避免空 token 触发 bcrypt CPU 放大。`auth.ts:extractWsBearerToken`
- [x] 审查批次 A（2026-07-05）— MEDIUM #2: `shouldBypassBearerAuth` 路由匹配用字符串全等而非前缀，未来子路径会误拒。改 `path === X || path.startsWith(X+"/")` 前缀匹配。`auth.ts:shouldBypassBearerAuth`
- [x] 审查批次 A（2026-07-05）— MEDIUM #3: `isBearerTokenValidSync` 与 async 版并存，sync 版 export 但无 caller，误在请求路径用会阻塞事件循环。补 JSDoc 标注「仅限启动期/CLI，禁用于请求处理」。`auth.ts`
- [x] 审查批次 A（2026-07-05）— LOW #2: `SECURITY.md` 第 47 行仍称「replay protection is not yet implemented」，与 `bf0a8e9a1` 的 salt+seq 单调计数器 + fatal close 语义矛盾。更新文档对齐代码现状。
- [x] 审查批次 A（2026-07-05）— LOW #1 复核: `DOWNLOAD_OPEN_FLAGS` 在 POSIX 含 `O_NOFOLLOW`，Windows 仅 `O_RDONLY`（Windows 不支持 `O_NOFOLLOW`，路径已由 realpath 规范化），无 bug，归档不再追踪。
- [x] 审查批次 A 遗留: MEDIUM #4（relay `webSocketMessage` 抢占无抖动退避，DoS 放大）— server-control/server-data 替换路径已先验签再 close 旧 socket，错误/无签名 server socket 不能再抢占既有 daemon socket
- [ ] 审查批次 A 遗留: LOW #3（`hostnames.ts` IP 字面量默认放行 = DNS rebinding 到公网 IP 可绕过 Host 检查）属 Vite 原始语义取舍，非 ChisaCode 引入，待在 SECURITY.md 注明取舍，后续专项
- [ ] HIGH #3/#5/#6/#7/#8/#9/#10/#11 + MEDIUM #12-#20 + 测试覆盖 M-TC1-9 + LOW #1-8（归档批次历史编号，未在本批次执行）

**防回滚机制**：每项修复提交时在 commit message 引用根因诊断；安全测试不得改 `not.toThrow`，硬语义降级必须经 opt-in flag 而非默认。

### CLI fallback stop 的 PID verify-to-signal 残余竞态（pending）

- **问题**：`packages/cli/src/commands/daemon/local-daemon.ts` 的 fallback stop 只能按数值 PID
  发送进程信号。PID owner 校验完成后、SIGTERM 或 SIGKILL 发出前，目标进程仍可能退出且 PID
  被复用，因此 identity verification 与 tree signaling 之间存在无法原子绑定的 TOCTOU 窗口。
- **当前缓解**：CLI 在 SIGTERM 前校验一次 `getPidLockOwnerStatus`，进入 force fallback
  SIGKILL 前再校验一次；`mismatch`、`unknown`、`not_running` 均 fail closed，不发送对应信号。
  这两次 verifier 会缩小误杀窗口，但不能消除 verify-to-signal 竞态。
- **候选方案**：评估跨平台 stable process-handle 抽象（Linux pidfd、Windows process handle、其他
  POSIX 等价机制），或把 fallback termination 收口到持有稳定 owner identity 的 supervisor control
  通道。不得以新增 native 依赖或删除既有 fallback stop 行为作为未经专项设计的临时修复。
- **状态**：pending，等待最终审查分流为独立架构任务。

### Server 进程树 ownership / query / deadline 编排拆分（pending）

- **问题**：`packages/server/src/utils/tree-kill.ts` 当前在同一实现中承担 Windows CIM
  ownership 查询与 CreationDate 复核、POSIX/Linux 进程身份跟踪、child-first signaling，及
  cleanup absolute deadline / cancellation 编排。Task 4 已补齐 fail-closed、snapshot churn 和
  deadline 语义，但继续在单文件内扩展会放大跨平台状态机的审查与回归成本。
- **影响范围**：`packages/server/src/utils/tree-kill.ts`、`packages/server/src/utils/spawn.ts`，以及
  server 内所有通过 `terminateWithTreeKill` 清理 provider / shell 命令树的调用点。
- **建议方案**：在不改变现有 public entry point `terminateWithTreeKill` 的前提下，提取私有
  Windows ownership/query adapter、POSIX identity tracker、以及共享 cleanup-deadline
  orchestrator；由现有入口组合这些模块并继续统一返回
  `already-exited | terminated | killed | kill-timeout`。专项迁移必须保留当前 typed operations
  tests、CreationDate/starttime signal-time identity revalidation、保守 polling 与严格 signaling
  的错误语义区分、fail-closed fallback 与单一 absolute deadline。
- **状态**：pending。Task 4 仅加固既有入口与私有 typed seams，不在本轮执行高风险结构拆分。

### Task 4 第九次规范复审加固（2026-07-11 完成）

- **背景**：第八次修复后的复审发现三个边界问题：Linux/通用 POSIX 在真正发信号前的身份读取
  失败仍可能沿保守 polling 语义继续；`maxBuffer` 清理启动后分片多字节字符无法补全且 retained
  slice 与大源 Buffer 共用 backing allocation；exact deadline 会覆盖更严重的命令树清理超时。
  最终质量复审又确认通用 POSIX parser 会静默跳过 malformed/empty `ps` 输出，把不完整表中缺失
  的 tracked PID 误判为已退出。
- **已修复**：
  - Linux 与通用 POSIX 分离“保守存活轮询”和“严格 signal authorization”。真实消失的 PID
    继续跳过，读取错误或 identity 变化在任何 PID/process-group signal 前 fail closed；轮询阶段
    仍把不可读记录视为存活，避免误报已终止。
  - 通用 POSIX process-table read 现在携带 private completeness 标记。malformed/invalid/empty
    `ps` 输出不能确认 PID 消失：严格 snapshot/signal 路径 fail closed，polling 保留 stale survivor；
    只有 complete table 明确缺失 PID 时才允许判定旧 identity 已退出。
  - 有界输出在首次 raw overflow 时只启动一次清理，并仅继续接收完成边界字符所需的最多三
    个字节；retained slice 复制到独立 Buffer。`hex`/`base64`/`base64url` overflow 前缀与当前
    Node 行为对齐，非 overflow 保留完整编码；未知 encoding 在 spawn 前以
    `ERR_UNKNOWN_ENCODING` 拒绝。
  - Loop verifier 在 exact deadline 同时收到 `ExecCommandKillTimeoutError` 时保留清理超时为 fatal
    根因，不转换为普通 max-time 错误。
- **边界**：未改 relay、未新增 public API，仍保留现有 process-group signaling、bounded cleanup
  deadline 与跨平台 fallback 策略。
- **状态**：已完成；精确 RED/GREEN 与最终验证记录见 Task 4 本地报告第九次及最终质量复审章节。

### 对抗性自审与接线验证（2026-07-05 完成）

- **背景**：对两批改动强制"调用点验证 + 端到端冒烟 + 对抗审查"作为完成标准，主动报告未接线项并修复。
- **调用点验证**（逐项 grep 真实消费）：
  - `writeFileAtomic`：5 处真接线（agent-storage/chat-service/loop-service/pid-lock/usage-store）✅
  - C1 relay `enforceReplayProtection` 在 handleMessage 调用，`sendSalt` 在 setState("open") 初始化，`send` 用 sendSeq++ ✅
  - L3 `cleanupStaleCodexImageAttachments` 在 close() 接线 ✅
  - C3/C4 `resolvePathInsideBase` 三处接线（read/write/createTerminal）✅
  - M11 `setCurrentAssistantMessage` 在重连 effect 接线 ✅
  - L9 三处 i18n t() key 与资源 key 精确匹配 ✅
  - M3/M4 logger.warn 4 处接线 ✅
- **端到端冒烟**（真实 fs/协议，绕过 mock）：
  - atomic-write：真实写盘/读回/覆盖/临时文件清理/mode 0o600 全验证 ✅
  - ACP 路径边界：接受 base 内、拒绝 `..` 越界、拒绝 base 外绝对路径、接受 base 本身 ✅
  - relay 加密往返 + 重放拒绝：既有 8 单测覆盖 ✅
- **对抗审查发现并修复的未接线项**：
  - **L9 new-workspace-screen.tsx 4 处硬编码未补**：`customValuePrefix`/`customValueDescription`/`searchPlaceholder`/`title`（line 384-388）+ `开始使用ChisaCode`（line 1470）。新建 `workspace.directoryPicker.*` + `workspace.startUsingChisaCode` 命名空间（zh+en），全部补 `t()`。这是上一批"留作后续"但用户要求"全部"的遗漏，本轮补齐。
  - **C3/C4 探针路径未接线**：`buildProbeClient` 的 readTextFile/writeTextFile（line 859-866）原本也应加边界检查，但探针路径是死代码占位（探针不发 fs 请求），且 `ACPAgentClient` 无 `config` 字段。尝试加边界检查导致 `this.config` 类型错误。回退探针路径并加注释说明：边界检查只在真实会话路径（ACPAgentSession）接线，探针占位不加。
  - **SEQ_LENGTH 冗余导出**：index.ts/e2ee.ts 导出 SEQ_LENGTH 无外部消费，但保留作协议常量公共 API（与 SALT_LENGTH 配对），非未接线。
- **跨平台对抗**：
  - Windows `path.relative` 大小写不敏感：`C:/Proj/MyRepo` vs `c:/proj/myrepo/src` 返回 `src\file.ts`（不含 `..`），正确接受 ✅
  - Windows 跨盘符 C→D：`path.relative` 返回绝对路径 `D:\evil\file.ts`，`path.isAbsolute` 捕获并拒绝 ✅
  - `fs.open` + `datasync` 在 Windows 工作 ✅
- **验证**：typecheck 9 包全绿 / lint 0 错误 / 59 单测全过。
- **状态**：已完成。

### MEDIUM/LOW 缺陷批量修复（2026-07-05 完成）

- **背景**：在两轮 CRITICAL/HIGH 修复后，清理审查报告中剩余的 11 MEDIUM + 9 LOW + 1 降级 LOW，共 21 项系统性缺陷。
- **已修复**：
  - **M5/M6/M7/L1 原子写统一**：新建 `packages/server/src/utils/atomic-write.ts` 提供 `writeFileAtomic`（临时文件 + fsync + rename，crash-safe）。pid-lock `updatePidLock`、usage-store `replace`/`clear`、loop-service `persist` 三处非原子写改用它；agent-storage、chat-service 两处已有原子写也统一收口并补 fsync；private-files `writePrivateFileAtomicSync` 补 fsync。一次改动修 4 项 + 补 3 处 fsync。
  - **M1** desktop webview `will-attach` 加 `disableDialogs=true`，与 AGENTS.md 声明对齐，阻止恶意页面弹原生 alert/confirm 钓鱼。
  - **M2** lefthook：全量 typecheck 从 pre-commit 移至 pre-push，避免 worktree 并发 commit 的 `tsc --incremental` 竞态与 `--no-verify` 绕过。
  - **M3** client `ensureConnected` 的 `void this.connect()` 加 `.catch` 转发到 logger，避免 unhandled rejection 被静默吞没。
  - **M4** relay e2ee transport `send` 在 channel 未就绪时除 throw 外也记 logger.warn + emitError；fire-and-forget 的 send 失败补 logger.warn，提升可观察性。
  - **M8** `agent-list.tsx` `formatStatusLabel` 的中文兜底改英文，避免 i18n key 缺失时英文环境回退显示中文。
  - **M9** client `attemptConnect` catch 在调 `rejectConnect` 前判空 `connectReject`，消除双重 reject 混乱控制流。
  - **M10** relay `createClientChannel` 把 `setInterval` + return 包进 try/catch，确保任何同步异常都 `clearRetry`，避免握手重试定时器泄漏。
  - **M11** `session-context.tsx` 重连 effect 在"刚断连"分支清空 `currentAssistantMessage`，避免半截流式消息跨重连残留。
  - **L2** skills-management GitHub 归档下载改流式 + `AbortSignal.timeout(60s)` + 256MB 字节上限，防 OOM/挂起。
  - **L3** codex 图像附件：新增 `cleanupStaleCodexImageAttachments`（1 小时 TTL），会话 close 时调用，防 tmpdir 磁盘泄漏。
  - **L4** pi `cli-runtime` stdoutBuffer 加 1MB 上限，与 stderrBuffer 对齐，防异常进程无 `\n` 输出致无界增长。
  - **L5** desktop `chisacode://` 协议 `decodeURIComponent` 包 try/catch，畸形 `%` 序列返回 404 而非抛 URIError。
  - **L6** cli `loadOutputSchema` 加 JSDoc 文档化"任意路径读取"行为（CLI 同用户权限，daemon 侧 Zod 复校验）。
  - **L7** tsconfig.base.json 加 `noFallthroughCasesInSwitch`；`noUnusedLocals`/`noUnusedParameters` 留作单独立项避免大范围破坏。
  - **L8** vitest.config.ts 加 v8 coverage provider 配置（不强制阈值，留作后续调优）。
  - **L9** app 3 处直接 UI 硬编码中文补 i18n：`projects-screen` HostErrorsBanner（`workspace.hostProjectLoadError`）、`split-container` 加载中（`common.loading`）、`sidebar-agent-list-skeleton` a11y label（`sidebar.agentListLoading`）。剩余 5 处（new-workspace 已有 t 的硬编码、question-form-card、archive-subagent、use-built-in-daemon、generative-ui/errors 纯函数）因结构复杂或纯函数性质留作后续 i18n 收尾专项。
  - **C3/C4（降级 LOW）** ACP `readTextFile`/`writeTextFile`/`createTerminal` 加 `resolvePathInsideBase` 边界检查（意图约束，非安全边界——agent 同用户同权限无沙箱）。防 agent 笔误写到项目目录外。
- **验证**：typecheck 9 包全绿 / lint 0 错误 / relay 33 + desktop 30 + cli 3 + pid-lock/usage-store 单测全过。loop-service.test.ts 一项失败（`vi is not defined`）经 git stash 确认为预存测试缺陷，与本批改动无关。
- **遗留**：L9 剩余 5 处 i18n、L7 的 `noUnusedLocals`/`noUnusedParameters`、loop-service.test.ts 的 `vi` import 缺陷，记入后续专项。
- **状态**：已完成。

### 对抗性代码审查修复（2026-07-04 完成）

- **背景**：在上一轮 34 项修复（commit `f673a88bc`）基础上做对抗性重判，确认 2 CRITICAL + 5 HIGH + 2 LOW 真实缺陷并修复。
- **对抗性修正**：上一轮初判的「relay 无认证」「ACP 路径穿越」两项 CRITICAL 经威胁模型复核后**降级**——`serverId` 是 72-bit bearer credential 带外分发，relay 作为无状态转发中继无需额外 HMAC；ACP agent 与 daemon 同用户同权限无沙箱，fs/terminal 边界检查非安全边界。真实 CRITICAL 收敛为 2 项。
- **已修复**：
  - **C1（CRITICAL）** relay 加密消息无重放保护：`crypto.ts` 的 nonce 改为 `salt(16)+seq(8)` 计数器派生（tweetnacl `box.after` 不支持 AAD，序列号必须编码进 nonce），`encrypted-channel.ts` 维护 per-direction send/recv 计数器 + salt，严格单调校验，违反时 fatal close 1011。帧格式不变。新增 8 个重放保护单测。
  - **C2（LOW）** relay serverId 未校验长度/字符集：`cloudflare-adapter.ts` 两个 fetch 入口加 `^[A-Za-z0-9_-]{1,128}$` 校验。纵深防御。
  - **C5（CRITICAL）** CI secret-scan 用 `trufflehog@main`：pin 到 v3.95.8 SHA；`reactivecircus/android-emulator-runner@v2` pin 到 v2.37.0 SHA。
  - **H1** `host-page.tsx` 872 行零 i18n：新建 `settings.hostPage.*` 命名空间（zh+en），覆盖全部硬编码中文。
  - **H2** `open-project-screen.tsx` 4 个 HomeTile 硬编码：新建 `openProject.*` 命名空间。
  - **H4** desktop `isProcessRunning` EPERM 返回 false：改为 true（与 CLI 侧对齐），避免误报 daemon 已死触发重复启动。
  - **H5** desktop 写命令未入特权集：`patch_desktop_settings`/`migrate_legacy_desktop_settings`/`check_app_update` 加入 `PRIVILEGED_COMMANDS`，补测试断言。
  - **H6** CLI 无全局 rejection 处理：`index.ts` 包 try/catch + `process.on(unhandledRejection/uncaughtException)`，用 `getErrorMessage` 过滤输出。
- **验证**：typecheck 9 包全绿 / lint 0 错误 / relay 33 单测 + desktop 30 单测 + cli 3 单测全过。
- **状态**：已完成。

### 错误提示机制统一设计（草案，2026-07-03 起草）

- **计划**：[error-handling-unification-plan.md](error-handling-unification-plan.md)
- **背景**：app 包存在五套错误展示机制并存，无明确边界规则，是 P2 粗糙点。
- **状态**：草案，本批次未执行代码改动，仅设计文档。
- **后续**：待排期执行。

### Provider God-File 拆分（草案 + 部分执行，2026-07-03 起草）

- **计划**：[provider-god-file-decomposition-plan.md](provider-god-file-decomposition-plan.md)
- **背景**：codex/claude/opencode 三个 provider agent 实现仍是 god-file（5000+ 行），无共享基类。
- **已完成的子步骤**：
  - opencode 常量提取到 `opencode/constants.ts`（`OPENCODE_BUILD_MODE_ID` 等）
  - `ProductionOpenCodeRuntime` 类从 `opencode-agent.ts` 迁移到 `opencode/runtime.ts`
  - `opencode/helpers.ts` 提取（含 `OpencodeToolPartToTimelineItemSchema`）
  - `providers/base/` 基类目录已创建（`BaseAgentClient`/`BaseAgentSession`/`index.ts`）——**尚未接入**，待各 provider 继承
- **状态**：草案，基类下沉与各 provider 迁移待排期。

---

## 归档批次（2026-06-28）

以下为已归档的执行记录摘要，详细见 [archive/comprehensive-improvement-roadmap-2026-06-28.md](archive/comprehensive-improvement-roadmap-2026-06-28.md)。

---

## 最终评分

| 维度       |     起始 |     最终 |     提升 |
| :--------- | -------: | -------: | -------: |
| 代码质量   |      7.0 |      8.5 |     +1.5 |
| 测试体系   |      7.0 |      8.0 |     +1.0 |
| 安全设计   |      8.0 |      8.5 |     +0.5 |
| 文档质量   |      8.0 |      8.5 |     +0.5 |
| 开发者体验 |      7.0 |      7.5 |     +0.5 |
| 架构设计   |      9.0 |      9.3 |     +0.3 |
| **综合**   | **~7.5** | **~8.5** | **+1.0** |

---

## 核心成果

### 架构改进

- **session.ts 拆分** — 9728 → ~2.8k 行 (-71%)，god-file 彻底瓦解
- **SessionContext 领域拆分** — 8 个领域子接口，7 个 handler 使用精确 `Pick<T>` 交叉类型
- **辅助模块提取** — `workspace-core.ts` (233 行) · `agent-session-helpers.ts` (400 行)

### 测试质量

- **消除固定等待** — 4 轮提交覆盖 19 个文件，~90 处 `setTimeout`/`sleep` → `vi.waitFor` / 事件驱动
- **覆盖率基线** — v8 provider，thresholds 设定（branches 30% / functions 35% / lines 40% / statements 40%）
- **依赖审计** — `.dependency-cruiser.js`，5 条禁止规则，0 violations（743 模块 · 1777 依赖）

### 开发者体验

- **Windows DX** — `dev.ps1` 端口冲突自动退避 (6767–6776) · `setup-dev.ps1` 一键设置

### 安全

- Electron 四层防御 · E2E 加密 relay · CI 安全扫描 · AppImage 沙箱决策文档化

---

## 路线图决策

以下 P1/P2 任务经评估后决定不予推进：

| 任务             | 理由                                           |
| ---------------- | ---------------------------------------------- |
| handler E2E 测试 | 已有 session.test.ts 和 dispatch-seam 间接覆盖 |
| vi.mock 替换     | 现有用法稳定，替换仅为哲学一致性               |
| Windows portless | 需上游工具支持，端口退避方案已满足需求         |
| 事件驱动解耦     | checkout→workspace 直接调用零 bug 零性能问题   |

边际收益不足以支撑投入。按现状归档。

---

## 后续维护

新改进点通过 Issue 或 PR 跟踪，不再维护统一路线图。

归档后完成的独立改进（例如 Android 端专项优化）不回填为路线图任务，也不重新打开本路线图；相关背景、验收结果与后续事项以对应 Issue、PR 或提交记录为准。

---

_最后更新 2026-06-28 · 版本 v2.0 — 已归档_
