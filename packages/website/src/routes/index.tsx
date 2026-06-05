import { createFileRoute } from "@tanstack/react-router";
import { LandingPage } from "~/components/landing-page";
import { useWebsiteI18n } from "~/i18n";
import { pageMeta } from "~/meta";

export const Route = createFileRoute("/")({
  head: () =>
    pageMeta(
      "ChisaCode – Run Claude Code, Codex, Copilot, OpenCode from anywhere",
      "Self-hosted daemon for Claude Code, Codex, Copilot, OpenCode, and Pi. Agents run on your machine with your full dev environment. Connect from phone, desktop, or web.",
      "/",
    ),
  component: Home,
});

function Home() {
  const { t } = useWebsiteI18n();
  return (
    <LandingPage
      title={
        <>
          {t("home.titleLine1")}
          <br />
          {t("home.titleLine2")}
        </>
      }
      subtitle={t("home.subtitle")}
    />
  );
}
