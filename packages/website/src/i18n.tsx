import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type WebsiteLanguage = "zh-CN" | "en";

const STORAGE_KEY = "chisacode.website.language";
const DEFAULT_LANGUAGE: WebsiteLanguage = "zh-CN";

const translations = {
  "zh-CN": {
    nav: {
      blog: "博客",
      docs: "文档",
      changelog: "更新日志",
      download: "下载",
      language: "语言",
    },
    footer: {
      product: "产品",
      agents: "智能体",
      community: "社区",
      download: "下载",
      allProviders: "全部 provider",
      privacy: "隐私",
      webApp: "Web App",
    },
    home: {
      titleLine1: "在桌面和手机上",
      titleLine2: "编排 coding agents",
      subtitle: "从手机、桌面端或终端运行任意 coding agent。自托管、多 provider、开源。",
    },
    landing: {
      bestAgent: "为任务选择最合适的 agent",
      bestAgentDescription:
        "在同一个界面运行多个 provider。ChisaCode 按你平时的方式启动原生 agent，并保留你的 skills、配置和 MCP server。",
      more: "+{{count}} 更多",
      fullyScriptable: "完全可脚本化",
      fullyScriptableDescription: "App 里能做的事情，也可以从终端完成。",
      faq: "常见问题",
    },
    agents: {
      title: "ChisaCode 支持的 coding agents",
      subtitle:
        "从手机、桌面端或终端驱动 Claude Code、Codex、Copilot、OpenCode、Cursor、Gemini CLI 等 provider。",
      agentTitle: "{{name}} 的开源 App",
      agentSubtitle: "在你的机器上运行 {{name}}，并通过手机或桌面端驱动它。自托管，代码留在本机。",
      customProvidersPrefix: "也可以通过",
      customProvidersLink: "自定义 provider",
      customProvidersSuffix: "在 ~/.chisacode/config.json 中添加自己的 agent。",
    },
    download: {
      title: "下载",
      desktop: "桌面端",
      desktopDescription: "推荐安装，内置所需组件",
      mobile: "移动端",
      web: "Web",
      webDescription: "从任意浏览器连接到 server",
      webApp: "Web App",
      open: "打开",
      server: "Server",
      serverDescription: "在任意位置运行 ChisaCode server，再从任意客户端连接",
      download: "下载",
      allReleasesPrefix: "所有版本都可以在",
      allReleasesSuffix: "获取。",
    },
    privacy: {
      title: "隐私政策",
      intro: "ChisaCode 是自托管的 coding agent 管理工具。你的代码和数据留在你的机器上。",
      collectTitle: "我们收集什么",
      collectBody: "不收集。ChisaCode 在你的机器上运行，不会把任何数据发送给我们。",
      relayTitle: "relay server",
      relayIntro: "如果你使用可选的加密 relay 连接手机和 daemon，relay 会看到：",
      relayIp: "IP 地址和连接时间",
      relaySizes: "消息大小",
      relaySessionIds: "会话 ID",
      relayBody:
        "手机和 daemon 之间的所有消息都使用 XSalsa20-Poly1305 端到端加密。relay 无法读取消息、查看代码或解密流量。",
      analyticsTitle: "分析与跟踪",
      analyticsBody: "我们不使用分析、跟踪像素、cookie 或广告。App 不会主动回传数据。",
      thirdPartyTitle: "第三方服务",
      thirdPartyBody1:
        "ChisaCode 包装 Claude Code、Codex、OpenCode 等 agent provider。这些工具会使用你的凭据与各自 API 通信。ChisaCode 不管理也不拦截这些 API 调用。",
      thirdPartyBody2:
        "如果你通过云 provider 使用语音功能（例如 OpenAI speech），语音数据会按对应服务的隐私政策发送给它们。",
      noSellTitle: "我们不出售你的数据",
      noSellBody: "我们没有你的数据可出售。ChisaCode 是自托管、local-first 的。",
      questionsTitle: "问题",
      questionsBodyPrefix: "如果你有隐私相关问题，请在",
      questionsBodySuffix: "提交 issue。",
      updated: "最后更新：2025 年 2 月",
    },
    cloud: {
      title: "ChisaCode Cloud",
      subtitle: "面向跨机器、团队或公司使用 ChisaCode 的场景。我们正在招募设计合作伙伴。",
      email: "邮箱",
      name: "姓名",
      company: "公司",
      role: "角色",
      message: "留言",
      messagePlaceholder: "简单介绍你，以及你希望 ChisaCode Cloud 提供什么。",
      successPrefix: "收到了。我会联系你。如果一周内没收到回复，可以在",
      successSuffix: "提醒我。",
      formNotConfigured: "表单还没接好。现在可以先去 Discord 联系。",
      formError: "出了点问题。请重试，或在 Discord 私信我。",
      sending: "发送中...",
      send: "发送",
      or: "或者",
      dmDiscord: "在 Discord 私信我",
      faq: "常见问题",
      whatQuestion: "ChisaCode Cloud 是什么？",
      whatAnswer:
        "它是 ChisaCode 之上的可选层，用于跨机器运行 daemon、同步配置，并让团队或公司协作使用 ChisaCode。可以把它理解为共享 runner、权限、审计、托管 daemon 和组织控制。",
      openSourceQuestion: "ChisaCode 会继续免费开源吗？",
      openSourceAnswer:
        "会。App、daemon、CLI、协议和 Cloud 控制平面都会保持免费开源。托管 Cloud 是给不想自托管的用户准备的可选付费层。",
      hostedQuestion: "自托管还是托管？",
      hostedAnswer:
        "两者都有。控制平面会放在 ChisaCode monorepo 中，你可以自己托管。托管版适合不想维护基础设施的个人和团队。",
      codeQuestion: "我的代码会经过 ChisaCode 吗？",
      codeAnswer:
        "不会。daemon 在你的机器上运行，并直接与 agent provider 通信。Cloud 负责注册、配置同步、权限和编排。代码与 model 流量都留在你的机器上。",
      availableQuestion: "什么时候可用？",
      availableAnswer:
        "现在面向设计合作伙伴开放早期访问。暂时没有公开发布日期。App 和 daemon 会优先。",
      pricingQuestion: "价格怎么定？",
      pricingAnswer: "还没确定。设计合作伙伴会一起塑造它。",
    },
    docs: {
      alternatives: "替代方案",
      openMenu: "打开菜单",
      closeMenu: "关闭菜单",
      notFound: "未找到文档。",
    },
    blog: {
      draft: "草稿",
      showingDrafts: "正在显示草稿文章",
      empty: "还没有文章。",
      notFound: "未找到文章。",
      metaTitle: "博客 - ChisaCode 团队更新与公告",
      metaDescription:
        "ChisaCode 团队的产品更新、技术文章和公告，记录如何构建自托管、多 agent 的手机开发环境。",
      notFoundMetaTitle: "未找到 - ChisaCode",
      author: "Mo Boudra",
    },
  },
  en: {
    nav: {
      blog: "Blog",
      docs: "Docs",
      changelog: "Changelog",
      download: "Download",
      language: "Language",
    },
    footer: {
      product: "Product",
      agents: "Agents",
      community: "Community",
      download: "Download",
      allProviders: "All providers",
      privacy: "Privacy",
      webApp: "Web App",
    },
    home: {
      titleLine1: "Orchestrate coding agents",
      titleLine2: "from your desk and your phone",
      subtitle:
        "Run any coding agent from your phone, desktop, or terminal. Self-hosted, multi-provider, open source.",
    },
    landing: {
      bestAgent: "Use the best agent for the job",
      bestAgentDescription:
        "Run multiple providers from a single interface. ChisaCode runs the native agent harness as you'd normally run it, with your skills, config and MCP servers intact.",
      more: "+{{count}} more",
      fullyScriptable: "Fully scriptable",
      fullyScriptableDescription: "Everything you can do in the app, you can do from the terminal.",
      faq: "FAQ",
    },
    agents: {
      title: "Supported agents",
      subtitle:
        "Run Claude Code, Codex, Copilot, OpenCode, Cursor CLI, Gemini CLI, and dozens more coding agents from your phone.",
      agentTitle: "Open source app for {{name}}",
      agentSubtitle:
        "Run {{name}} on your machine, drive it from your phone or desktop. Self-hosted, your code stays local.",
      customProvidersPrefix: "You can also add your own agents with",
      customProvidersLink: "custom providers",
      customProvidersSuffix: "in ~/.chisacode/config.json.",
    },
    download: {
      title: "Download",
      desktop: "Desktop",
      desktopDescription: "Recommended, bundles everything you need",
      mobile: "Mobile",
      web: "Web",
      webDescription: "Connect to a server from any browser",
      webApp: "Web App",
      open: "Open",
      server: "Server",
      serverDescription: "Run the ChisaCode server anywhere, connect from any client",
      download: "Download",
      allReleasesPrefix: "All releases are available on",
      allReleasesSuffix: ".",
    },
    privacy: {
      title: "Privacy Policy",
      intro:
        "ChisaCode is a self-hosted tool for managing coding agents. Your code and data stay on your machine.",
      collectTitle: "What we collect",
      collectBody: "Nothing. ChisaCode runs on your machine and doesn't send us any data.",
      relayTitle: "The relay server",
      relayIntro:
        "If you use the optional encrypted relay to connect your phone to your daemon, the relay sees:",
      relayIp: "IP addresses and connection timing",
      relaySizes: "Message sizes",
      relaySessionIds: "Session IDs",
      relayBody:
        "All messages between your phone and daemon are end-to-end encrypted with XSalsa20-Poly1305. The relay cannot read your messages, see your code, or decrypt your traffic.",
      analyticsTitle: "Analytics and tracking",
      analyticsBody:
        "We don't use analytics, tracking pixels, cookies, or ads. The app doesn't phone home.",
      thirdPartyTitle: "Third-party services",
      thirdPartyBody1:
        "ChisaCode wraps agent providers like Claude Code, Codex, and OpenCode. Those tools communicate with their own APIs (Anthropic, OpenAI, etc.) using your credentials. ChisaCode doesn't manage or intercept those API calls.",
      thirdPartyBody2:
        "If you use voice features with cloud providers (OpenAI speech), your voice data is sent to those services according to their privacy policies.",
      noSellTitle: "We don't sell your data",
      noSellBody: "We don't have your data to sell. ChisaCode is self-hosted and local-first.",
      questionsTitle: "Questions",
      questionsBodyPrefix: "If you have questions about privacy, open an issue on",
      questionsBodySuffix: ".",
      updated: "Last updated: February 2025",
    },
    cloud: {
      title: "ChisaCode Cloud",
      subtitle:
        "For using ChisaCode across machines, with a team, or inside a company. Looking for design partners.",
      email: "Email",
      name: "Name",
      company: "Company",
      role: "Role",
      message: "Message",
      messagePlaceholder: "A bit about you and what you'd want from ChisaCode Cloud.",
      successPrefix: "Got it. I'll be in touch. If you don't hear back within a week, ping me on",
      successSuffix: ".",
      formNotConfigured: "The form isn't wired up yet. Try Discord for now.",
      formError: "Something went wrong. Try again or DM me on Discord.",
      sending: "Sending...",
      send: "Send",
      or: "Or",
      dmDiscord: "DM me on Discord",
      faq: "FAQ",
      whatQuestion: "What is ChisaCode Cloud?",
      whatAnswer:
        "An optional layer on top of ChisaCode for running daemons across machines, syncing config between them, and using ChisaCode with a team or company. Think shared runners, permissions, audit, managed daemons, and org controls.",
      openSourceQuestion: "Will ChisaCode stay free and open source?",
      openSourceAnswer:
        "Yes. The whole stack stays free and open source: app, daemon, CLI, protocols, and the Cloud control plane. Managed Cloud is the optional paid layer for people who don't want to host it themselves.",
      hostedQuestion: "Self-hosted or managed?",
      hostedAnswer:
        "Both. The control plane will live in the ChisaCode monorepo so you can host it yourself. Managed is for people and teams who don't want to.",
      codeQuestion: "Does my code go through ChisaCode?",
      codeAnswer:
        "No. Daemons run on your machines and talk to agent providers directly. Cloud handles registration, config sync, permissions, and orchestration. Code and model traffic stay on your machines.",
      availableQuestion: "When will it be available?",
      availableAnswer:
        "Early access for design partners now. No public date. The app and daemon come first.",
      pricingQuestion: "How does pricing work?",
      pricingAnswer: "Not set yet. Design partners help shape it.",
    },
    docs: {
      alternatives: "Alternatives",
      openMenu: "Open menu",
      closeMenu: "Close menu",
      notFound: "Doc not found.",
    },
    blog: {
      draft: "DRAFT",
      showingDrafts: "Showing draft posts",
      empty: "No posts yet.",
      notFound: "Post not found.",
      metaTitle: "Blog - Updates and announcements from the ChisaCode team",
      metaDescription:
        "Product updates, technical posts, and announcements from the ChisaCode team. Notes on building a self-hosted, multi-agent dev environment for your phone.",
      notFoundMetaTitle: "Not Found - ChisaCode",
      author: "Mo Boudra",
    },
  },
} as const;

type TranslationKey = string;

interface WebsiteI18nContextValue {
  language: WebsiteLanguage;
  setLanguage: (language: WebsiteLanguage) => void;
  t: (key: TranslationKey, vars?: Record<string, string | number>) => string;
}

const WebsiteI18nContext = createContext<WebsiteI18nContextValue | null>(null);

function readInitialLanguage(): WebsiteLanguage {
  if (typeof window === "undefined") {
    return DEFAULT_LANGUAGE;
  }
  const stored = window.localStorage.getItem(STORAGE_KEY);
  return stored === "en" || stored === "zh-CN" ? stored : DEFAULT_LANGUAGE;
}

function readPath(tree: unknown, key: TranslationKey): string {
  const value = key.split(".").reduce<unknown>((current, segment) => {
    if (current && typeof current === "object" && segment in current) {
      return (current as Record<string, unknown>)[segment];
    }
    return undefined;
  }, tree);
  return typeof value === "string" ? value : key;
}

function interpolate(text: string, vars: Record<string, string | number> = {}): string {
  return text.replace(/\{\{(\w+)\}\}/g, (match, name) => String(vars[name] ?? match));
}

export function WebsiteI18nProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<WebsiteLanguage>(readInitialLanguage);

  useEffect(() => {
    document.documentElement.lang = language;
    window.localStorage.setItem(STORAGE_KEY, language);
  }, [language]);

  const setLanguage = useCallback((nextLanguage: WebsiteLanguage) => {
    setLanguageState(nextLanguage);
  }, []);

  const t = useCallback(
    (key: TranslationKey, vars?: Record<string, string | number>) =>
      interpolate(readPath(translations[language], key), vars),
    [language],
  );

  const value = useMemo(() => ({ language, setLanguage, t }), [language, setLanguage, t]);

  return <WebsiteI18nContext.Provider value={value}>{children}</WebsiteI18nContext.Provider>;
}

export function useWebsiteI18n(): WebsiteI18nContextValue {
  const context = useContext(WebsiteI18nContext);
  if (!context) {
    throw new Error("useWebsiteI18n must be used within WebsiteI18nProvider");
  }
  return context;
}
