import { createFileRoute } from "@tanstack/react-router";
import { SiteShell } from "~/components/site-shell";
import { useWebsiteI18n } from "~/i18n";
import { pageMeta } from "~/meta";

export const Route = createFileRoute("/privacy")({
  head: () =>
    pageMeta(
      "Privacy Policy - ChisaCode",
      "Privacy policy for ChisaCode, the self-hosted coding agent manager. No tracking, no analytics, no data collection. Your code stays on your machine.",
      "/privacy",
    ),
  component: Privacy,
});

function Privacy() {
  const { t } = useWebsiteI18n();

  return (
    <SiteShell>
      <h1 className="text-3xl font-medium mb-8">{t("privacy.title")}</h1>

      <div className="space-y-6 text-white/70 leading-relaxed">
        <p>{t("privacy.intro")}</p>

        <section className="space-y-3">
          <h2 className="text-xl font-medium text-white">{t("privacy.collectTitle")}</h2>
          <p>{t("privacy.collectBody")}</p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-medium text-white">{t("privacy.relayTitle")}</h2>
          <p>{t("privacy.relayIntro")}</p>
          <ul className="list-disc list-inside space-y-1 ml-4">
            <li>{t("privacy.relayIp")}</li>
            <li>{t("privacy.relaySizes")}</li>
            <li>{t("privacy.relaySessionIds")}</li>
          </ul>
          <p>{t("privacy.relayBody")}</p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-medium text-white">{t("privacy.analyticsTitle")}</h2>
          <p>{t("privacy.analyticsBody")}</p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-medium text-white">{t("privacy.thirdPartyTitle")}</h2>
          <p>{t("privacy.thirdPartyBody1")}</p>
          <p>{t("privacy.thirdPartyBody2")}</p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-medium text-white">{t("privacy.noSellTitle")}</h2>
          <p>{t("privacy.noSellBody")}</p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-medium text-white">{t("privacy.questionsTitle")}</h2>
          <p>
            {t("privacy.questionsBodyPrefix")}{" "}
            <a
              href="https://github.com/getchisacode/chisacode"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-white/90"
            >
              GitHub
            </a>
            {t("privacy.questionsBodySuffix")}
          </p>
        </section>

        <p className="text-sm text-white/50 pt-6">{t("privacy.updated")}</p>
      </div>
    </SiteShell>
  );
}
