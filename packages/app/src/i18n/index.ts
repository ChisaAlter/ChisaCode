import { createInstance, type i18n, type Resource } from "i18next";
import { initReactI18next } from "react-i18next";
import type { AppLanguage } from "@/hooks/use-settings";

export type { AppLanguage };

export const resources = {
  "zh-CN": {
    translation: {
      common: {
        cancel: "取消",
        confirm: "确认",
        close: "关闭",
        copy: "复制",
        copied: "已复制",
        retry: "重试",
        loading: "加载中...",
        search: "搜索",
        save: "保存",
        delete: "删除",
      },
      onboarding: {
        welcome: "欢迎使用芙露德莉斯",
        connectToStart: "连接你的电脑即可开始",
        directConnection: "直接连接",
        scanQr: "扫描二维码",
        pastePairingLink: "粘贴配对链接",
      },
      workspace: {
        newWorkspace: "新工作区",
        newAgent: "新建智能体",
        setup: "设置",
        browser: "浏览器",
        closeOtherTabs: "关闭其他标签页",
      },
      session: {
        agent: "智能体",
        importSession: "导入会话",
        archived: "已归档",
      },
      composer: {
        placeholder: "输入消息...",
        send: "发送",
        queue: "排队",
        dictation: "听写",
        addAttachment: "添加附件",
      },
      terminal: {
        title: "终端",
        workspaceDirectoryMissing: "找不到工作区执行目录。",
      },
      files: {
        open: "打开",
        remove: "移除",
        imageAttachment: "图片附件",
      },
      providers: {
        title: "Provider",
        search: "搜索 Provider",
        loadingModels: "正在加载模型...",
      },
      errors: {
        generic: "出了点问题。",
        hostDisconnected: "主机未连接。",
        pairFailed: "配对失败",
      },
      settings: {
        title: "设置",
        loading: "正在加载设置...",
        back: "返回",
        projects: "项目",
        addHost: "添加主机",
        local: "本机",
        sections: {
          general: "通用",
          shortcuts: "快捷键",
          integrations: "集成",
          permissions: "权限",
          diagnostics: "诊断",
          about: "关于",
        },
        general: {
          title: "通用",
          theme: {
            title: "主题",
            options: {
              light: "浅色",
              dark: "深色",
              zinc: "锌灰",
              midnight: "午夜",
              claude: "Claude",
              ghostty: "Ghostty",
              auto: "跟随系统",
            },
          },
          language: {
            title: "语言",
            description: "选择客户端界面语言",
            options: {
              "zh-CN": "简体中文",
              en: "English",
            },
          },
          defaultSend: {
            title: "默认发送",
            description: "智能体运行时按 Enter 的行为",
            options: {
              interrupt: "打断",
              queue: "排队",
            },
          },
          serviceUrls: {
            title: "服务 URL",
            description: "运行脚本打开 URL 时使用的位置",
            options: {
              ask: "询问",
              "in-app": "在芙露德莉斯中打开",
              external: "外部浏览器",
            },
          },
          terminalScrollback: {
            title: "终端回滚",
            description: "内置终端缓冲区保留的行数",
            accessibilityLabel: "终端回滚行数",
          },
        },
        diagnostics: {
          title: "诊断",
          testAudio: "测试音频",
          playing: "播放中...",
          playTest: "播放测试",
          playbackFailed: "播放失败：{{message}}",
        },
        about: {
          title: "关于",
          appVersion: "应用版本",
          thisDevice: "此设备",
          connectedHosts: "已连接主机",
          offline: "离线",
        },
      },
    },
  },
  en: {
    translation: {
      common: {
        cancel: "Cancel",
        confirm: "Confirm",
        close: "Close",
        copy: "Copy",
        copied: "Copied",
        retry: "Retry",
        loading: "Loading...",
        search: "Search",
        save: "Save",
        delete: "Delete",
      },
      onboarding: {
        welcome: "Welcome to Fleurdelys",
        connectToStart: "Connect your computer to get started",
        directConnection: "Direct connection",
        scanQr: "Scan QR code",
        pastePairingLink: "Paste pairing link",
      },
      workspace: {
        newWorkspace: "New workspace",
        newAgent: "New Agent",
        setup: "Setup",
        browser: "Browser",
        closeOtherTabs: "Close other tabs",
      },
      session: {
        agent: "Agent",
        importSession: "Import session",
        archived: "Archived",
      },
      composer: {
        placeholder: "Message...",
        send: "Send",
        queue: "Queue",
        dictation: "Dictation",
        addAttachment: "Add attachment",
      },
      terminal: {
        title: "Terminal",
        workspaceDirectoryMissing: "Workspace execution directory not found.",
      },
      files: {
        open: "Open",
        remove: "Remove",
        imageAttachment: "Image attachment",
      },
      providers: {
        title: "Providers",
        search: "Search providers",
        loadingModels: "Loading models...",
      },
      errors: {
        generic: "Something went wrong.",
        hostDisconnected: "Host is not connected.",
        pairFailed: "Pairing failed",
      },
      settings: {
        title: "Settings",
        loading: "Loading settings...",
        back: "Back",
        projects: "Projects",
        addHost: "Add host",
        local: "Local",
        sections: {
          general: "General",
          shortcuts: "Shortcuts",
          integrations: "Integrations",
          permissions: "Permissions",
          diagnostics: "Diagnostics",
          about: "About",
        },
        general: {
          title: "General",
          theme: {
            title: "Theme",
            options: {
              light: "Light",
              dark: "Dark",
              zinc: "Zinc",
              midnight: "Midnight",
              claude: "Claude",
              ghostty: "Ghostty",
              auto: "System",
            },
          },
          language: {
            title: "Language",
            description: "Choose the client interface language",
            options: {
              "zh-CN": "简体中文",
              en: "English",
            },
          },
          defaultSend: {
            title: "Default send",
            description: "What happens when you press Enter while the agent is running",
            options: {
              interrupt: "Interrupt",
              queue: "Queue",
            },
          },
          serviceUrls: {
            title: "Service URLs",
            description: "Where to open URLs from running scripts",
            options: {
              ask: "Ask",
              "in-app": "In Fleurdelys",
              external: "External browser",
            },
          },
          terminalScrollback: {
            title: "Terminal scrollback",
            description: "Lines kept in the built-in terminal buffer",
            accessibilityLabel: "Terminal scrollback lines",
          },
        },
        diagnostics: {
          title: "Diagnostics",
          testAudio: "Test audio",
          playing: "Playing...",
          playTest: "Play test",
          playbackFailed: "Playback failed: {{message}}",
        },
        about: {
          title: "About",
          appVersion: "App version",
          thisDevice: "This device",
          connectedHosts: "Connected hosts",
          offline: "Offline",
        },
      },
    },
  },
} satisfies Resource;

export function createAppI18n(
  language: AppLanguage,
  resourceOverrides: Resource = resources,
): i18n {
  const instance = createInstance();
  void instance.use(initReactI18next).init({
    resources: resourceOverrides,
    lng: language,
    fallbackLng: "en",
    interpolation: {
      escapeValue: false,
    },
    returnNull: false,
  });
  return instance;
}

export const appI18n = createAppI18n("zh-CN");
