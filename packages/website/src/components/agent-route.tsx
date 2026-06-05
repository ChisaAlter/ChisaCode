import { LandingPage } from "~/components/landing-page";
import { getAgentPage } from "~/data/agent-pages";
import { useWebsiteI18n } from "~/i18n";
import { pageMeta } from "~/meta";

export function agentRouteOptions(slug: string) {
  const page = getAgentPage(slug);
  return {
    head: () => pageMeta(page.metaTitle, page.metaDescription, `/${slug}`),
    component: function AgentLandingPage() {
      const { language, t } = useWebsiteI18n();
      const title = language === "zh-CN" ? t("agents.agentTitle", { name: page.name }) : page.title;
      const subtitle =
        language === "zh-CN" ? t("agents.agentSubtitle", { name: page.name }) : page.subtitle;
      return <LandingPage title={title} subtitle={subtitle} />;
    },
  };
}
