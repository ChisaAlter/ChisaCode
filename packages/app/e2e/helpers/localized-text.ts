import { escapeRegex } from "./regex";

// The app renders zh-CN by default (createAppI18n("zh-CN") in
// packages/app/src/i18n/index.ts), so every copy assertion must accept both
// the English and the Chinese variant of the string it targets. Keep this
// table sorted by feature area; every entry must correspond to real strings
// in packages/app/src/i18n/index.ts (or hard-coded zh copy in the component).
export const LOCALIZED_TEXT = {
  // Settings shell
  General: ["General", "通用"],
  // The detail header reuses the sidebar section label ("用量"), while the
  // usage page body title is "用量统计" — accept both.
  Usage: ["Usage", "用量统计", "用量"],
  Diagnostics: ["Diagnostics", "诊断"],
  About: ["About", "关于"],
  Theme: ["Theme", "主题"],
  "Play test": ["Play test", "播放测试"],
  "GitHub releases": ["GitHub releases", "GitHub 版本"],
  Connections: ["Connections", "连接"],
  "Add connection": ["Add connection", "添加连接"],
  "Direct connection": ["Direct connection", "直接连接"],
  "Paste pairing link": ["Paste pairing link", "粘贴配对链接"],
  "Inject ChisaCode tools": ["Inject ChisaCode tools", "注入ChisaCode工具"],
  Back: ["Back", "返回"],
  "Open menu": ["Open menu", "打开菜单"],
  Hosts: ["Hosts", "主机"],
  Providers: ["Providers", "提供商"],
  "Pair device": ["Pair device", "配对设备"],
  Daemon: ["Daemon", "守护进程"],
  // Desktop updates + daemon management (desktop-updates.spec.ts)
  "Install & restart": ["Install & restart", "安装并重启"],
  "Installing...": ["Installing...", "安装中..."],
  "Manage built-in daemon": ["Manage built-in daemon", "管理内置主机服务"],
} as const;

export function localizedAlternatives(text: string): string[] {
  return [...(LOCALIZED_TEXT[text as keyof typeof LOCALIZED_TEXT] ?? [text])];
}

/**
 * Builds an exact-match regex accepting every localized variant of the given
 * English source string. Unknown strings fall back to matching themselves so
 * callers can use this unconditionally.
 */
export function localizedRegex(text: string): RegExp {
  return new RegExp(`^(${localizedAlternatives(text).map(escapeRegex).join("|")})$`);
}
