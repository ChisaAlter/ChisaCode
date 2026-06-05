import { createFileRoute } from "@tanstack/react-router";
import { DocsMarkdown } from "~/components/docs-markdown";
import { DocsMarkdownActions } from "~/components/docs-markdown-actions";
import { DocsSourceFooter } from "~/components/docs-source-footer";
import { getDoc } from "~/docs";
import { useWebsiteI18n } from "~/i18n";
import { pageMeta } from "~/meta";

export const Route = createFileRoute("/docs/")({
  head: () => {
    const doc = getDoc("");
    if (!doc)
      return pageMeta(
        "Docs - ChisaCode",
        "Install ChisaCode and start running coding agents from your phone, desktop, and terminal.",
        "/docs",
      );
    return pageMeta(
      `${doc.frontmatter.title} - ChisaCode Docs`,
      doc.frontmatter.description,
      "/docs",
    );
  },
  component: DocsIndex,
});

function DocsIndex() {
  const { t } = useWebsiteI18n();
  const doc = getDoc("");
  if (!doc) return <p className="text-muted-foreground">{t("docs.notFound")}</p>;
  return (
    <>
      <DocsMarkdownActions content={doc.content} markdownHref="/docs.md" />
      <DocsMarkdown>{doc.content}</DocsMarkdown>
      <DocsSourceFooter doc={doc} />
    </>
  );
}
