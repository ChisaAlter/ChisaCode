import { appStoreUrl, playStoreUrl, webAppUrl } from "~/downloads";
import { useWebsiteI18n } from "~/i18n";

interface SiteFooterProps {
  width?: "default" | "prose";
}

export function SiteFooter({ width = "default" }: SiteFooterProps) {
  const { t } = useWebsiteI18n();
  const widthClasses =
    width === "prose" ? "max-w-prose p-6 md:p-12 md:pt-0" : "max-w-5xl p-6 md:p-20 md:pt-0";
  return (
    <footer className={`${widthClasses} mx-auto`}>
      <div className="border-t border-white/10 pt-8 pb-4 grid grid-cols-2 sm:grid-cols-4 gap-8 text-sm">
        <div className="space-y-3">
          <p className="text-white/60 font-medium">{t("footer.product")}</p>
          <div className="space-y-2">
            <a
              href="/blog"
              className="block text-muted-foreground hover:text-foreground transition-colors"
            >
              {t("nav.blog")}
            </a>
            <a
              href="/docs"
              className="block text-muted-foreground hover:text-foreground transition-colors"
            >
              {t("nav.docs")}
            </a>
            <a
              href="/changelog"
              className="block text-muted-foreground hover:text-foreground transition-colors"
            >
              {t("nav.changelog")}
            </a>
            <a
              href="/docs/cli"
              className="block text-muted-foreground hover:text-foreground transition-colors"
            >
              CLI
            </a>
            <a
              href="/privacy"
              className="block text-muted-foreground hover:text-foreground transition-colors"
            >
              {t("footer.privacy")}
            </a>
          </div>
        </div>
        <div className="space-y-3">
          <p className="text-white/60 font-medium">{t("footer.agents")}</p>
          <div className="space-y-2">
            <a
              href="/claude-code"
              className="block text-muted-foreground hover:text-foreground transition-colors"
            >
              Claude Code
            </a>
            <a
              href="/codex"
              className="block text-muted-foreground hover:text-foreground transition-colors"
            >
              Codex
            </a>
            <a
              href="/opencode"
              className="block text-muted-foreground hover:text-foreground transition-colors"
            >
              OpenCode
            </a>
            <a
              href="/agents"
              className="block text-muted-foreground hover:text-foreground transition-colors"
            >
              {t("footer.allProviders")}
            </a>
          </div>
        </div>
        <div className="space-y-3">
          <p className="text-white/60 font-medium">{t("footer.community")}</p>
          <div className="space-y-2">
            <a
              href="https://discord.gg/jz8T2uahpH"
              target="_blank"
              rel="noopener noreferrer"
              className="block text-muted-foreground hover:text-foreground transition-colors"
            >
              Discord
            </a>
            <a
              href="https://www.reddit.com/r/ChisaCodeAI/"
              target="_blank"
              rel="noopener noreferrer"
              className="block text-muted-foreground hover:text-foreground transition-colors"
            >
              Reddit
            </a>
            <a
              href="https://github.com/getchisacode/chisacode"
              target="_blank"
              rel="noopener noreferrer"
              className="block text-muted-foreground hover:text-foreground transition-colors"
            >
              GitHub
            </a>
          </div>
        </div>
        <div className="space-y-3">
          <p className="text-white/60 font-medium">{t("footer.download")}</p>
          <div className="space-y-2">
            <a
              href={appStoreUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="block text-muted-foreground hover:text-foreground transition-colors"
            >
              App Store
            </a>
            <a
              href={playStoreUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="block text-muted-foreground hover:text-foreground transition-colors"
            >
              Google Play
            </a>
            <a
              href="https://github.com/getchisacode/chisacode/releases"
              target="_blank"
              rel="noopener noreferrer"
              className="block text-muted-foreground hover:text-foreground transition-colors"
            >
              Desktop
            </a>
            <a
              href={webAppUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="block text-muted-foreground hover:text-foreground transition-colors"
            >
              {t("footer.webApp")}
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
