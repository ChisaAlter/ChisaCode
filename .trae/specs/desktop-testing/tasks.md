# Tasks

- [ ] Task 1: 修复 daemon-manager.ts 中的问题
  - [ ] SubTask 1.1: 修复 `DAEMON_PID_FILENAMES` 重复元素（两个相同的 "chisacode.pid"）
  - [ ] SubTask 1.2: 修复 `open_local_daemon_transport` / `close_local_daemon_transport` 的 `args` 类型安全问题（`unknown` 透传）
  - [ ] SubTask 1.3: 修复 `isProcessRunning` 对 `EPERM` 返回 `true` 的误判问题
  - [ ] SubTask 1.4: 补充 daemon-manager 相关测试

- [ ] Task 2: 修复 local-transport.ts 中的问题
  - [ ] SubTask 2.1: 修复 CONNECTING 状态下 terminate 后 renderer 收不到 close 事件的问题
  - [ ] SubTask 2.2: 添加 session 超时清理机制（防止 opening 状态永久挂起）
  - [ ] SubTask 2.3: 补充 local-transport 测试

- [ ] Task 3: 修复 auto-updater.ts 中的问题
  - [ ] SubTask 3.1: 添加 `downloading` 标志的锁机制，防止并发触发 `downloadUpdate()`
  - [ ] SubTask 3.2: 修复 `resolveStagingUserId` 写入失败时重复生成随机 ID 的问题
  - [ ] SubTask 3.3: 修复 `cachedUpdateInfo` 在下载出错后未重置的问题
  - [ ] SubTask 3.4: 补充 auto-updater 测试

- [ ] Task 4: 修复 login-shell-env.ts 中的问题
  - [ ] SubTask 4.1: 修复 `process.execPath` 含单引号导致的 shell 注入风险
  - [ ] SubTask 4.2: 处理 `spawnSync` 被信号终止（`status === null`）的情况，添加日志
  - [ ] SubTask 4.3: 考虑缩短 `spawnSync` timeout 或改为异步，避免阻塞主进程
  - [ ] SubTask 4.4: 补充 login-shell-env 测试

- [ ] Task 5: 修复 notifications.ts 中的问题
  - [ ] SubTask 5.1: 修复 `activeNotifications` 中未显示通知的泄漏问题
  - [ ] SubTask 5.2: 补充 notifications 测试

- [ ] Task 6: 修复 dialogs.ts 中的问题
  - [ ] SubTask 6.1: 移除 `getFocusedWindow()!` 非空断言，安全获取窗口
  - [ ] SubTask 6.2: 补充 dialogs 测试

- [ ] Task 7: 修复 integrations/cli-install/install.ts 中的问题
  - [ ] SubTask 7.1: 修复 Windows `.cmd` 脚本对 `)` 等特殊字符的转义问题
  - [ ] SubTask 7.2: 修复 `pathOrSymlinkExists` 与 `fs.unlink` 之间的 TOCTOU race
  - [ ] SubTask 7.3: 补充 cli-install 测试

- [ ] Task 8: 修复 integrations/skills/sync.ts 中的问题
  - [ ] SubTask 8.1: 添加符号链接检测，防止 `listFilesRecursive` 无限递归
  - [ ] SubTask 8.2: 修复 `syncDirectoryFiles` 不删除目标端多余文件的问题
  - [ ] SubTask 8.3: 补充 skills sync 测试

- [ ] Task 9: 运行全面验证
  - [ ] SubTask 9.1: 运行 desktop 包 typecheck
  - [ ] SubTask 9.2: 运行 desktop 包 lint
  - [ ] SubTask 9.3: 运行 desktop 包测试
  - [ ] SubTask 9.4: 运行全仓库 typecheck

# Task Dependencies

- Task 9 依赖于 Task 1-8 全部完成
- Task 1-8 之间无依赖，可并行执行
