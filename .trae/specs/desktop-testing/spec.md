# 桌面端全面测试与修复 Spec

## Why

桌面端（Electron wrapper）是 ChisaCode 的重要入口，用户通过桌面应用启动 daemon、管理窗口、接收通知、自动更新等。当前代码审查发现了多个潜在的 bug、竞态条件、资源泄漏和安全隐患，需要系统性地测试并修复，以确保桌面端稳定可靠。

## What Changes

- **修复 daemon-manager.ts 中的 PID 文件名重复和类型安全问题**
- **修复 local-transport.ts 中的 WebSocket session 泄漏和事件不一致问题**
- **修复 auto-updater.ts 中的并发竞态和 rollout 稳定性问题**
- **修复 login-shell-env.ts 中的 shell 注入风险和阻塞问题**
- **修复 notifications.ts 中的通知泄漏问题**
- **修复 dialogs.ts 中的窗口空引用崩溃问题**
- **修复 cli-install 中的特殊字符转义问题**
- **修复 skills sync 中的符号链接循环和文件残留问题**
- **补充缺失的测试用例**

## Impact

- Affected specs: daemon lifecycle, WebSocket transport, auto-update, notifications, dialogs, CLI installation, skills sync
- Affected code: `packages/desktop/src/daemon/*`, `packages/desktop/src/features/*`, `packages/desktop/src/integrations/*`, `packages/desktop/src/settings/*`, `packages/desktop/src/window/*`

## ADDED Requirements

### Requirement: Daemon Manager 可靠性

The system SHALL 正确管理 daemon 的 PID 文件查找，避免无意义的重复查找。

#### Scenario: PID 文件查找

- **WHEN** daemon 启动后写入 PID 文件
- **THEN** 桌面端应能正确找到 PID 文件，而不是在两个相同的文件名之间无意义地重复查找

### Requirement: WebSocket Transport 可靠性

The system SHALL 在 WebSocket CONNECTING 状态下被强制终止时，正确通知 renderer session 已关闭。

#### Scenario: 快速连接关闭

- **WHEN** transport session 在 CONNECTING 状态下被 close
- **THEN** renderer 应收到 close 事件，而不是 session 悬空

### Requirement: Auto Updater 并发安全

The system SHALL 防止并发调用 `downloadUpdate()` 导致的竞态条件。

#### Scenario: 重复更新检查

- **WHEN** 用户快速多次触发更新检查
- **THEN** 系统应只执行一次下载，而不是重复触发

### Requirement: Login Shell 环境安全

THE system SHALL 安全地解析 shell 环境变量，避免 shell 注入风险。

#### Scenario: 特殊路径

- **WHEN** 应用安装在包含单引号或特殊字符的路径下
- **THEN** `resolveShellEnv` 应正确工作，不会导致 shell 语法错误

## MODIFIED Requirements

### Requirement: Notification 资源管理

**修改前**: `activeNotifications` Set 可能永久泄漏未显示的通知实例。
**修改后**: 通知实例在 show 失败或异常时应从 `activeNotifications` 中移除。

### Requirement: Dialog 窗口安全

**修改前**: `getFocusedWindow()!` 使用非空断言，可能在无边框/托盘模式下崩溃。
**修改后**: 安全地获取窗口，找不到时优雅降级。

## REMOVED Requirements

无
