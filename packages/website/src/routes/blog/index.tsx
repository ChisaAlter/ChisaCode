import { useMemo } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { getPosts, formatDate } from "~/posts";
import { pageMeta } from "~/meta";
import { useWebsiteI18n } from "~/i18n";

interface BlogSearch {
  drafts?: true;
}

export const Route = createFileRoute("/blog/")({
  validateSearch: (search: Record<string, unknown>): BlogSearch => {
    const drafts = search.drafts === true || search.drafts === "" || search.drafts === "true";
    return drafts ? { drafts: true } : {};
  },
  head: () =>
    pageMeta(
      "Blog – Updates and announcements from the ChisaCode team",
      "Product updates, technical posts, and announcements from the ChisaCode team. Notes on building a self-hosted, multi-agent dev environment for your phone.",
      "/blog",
    ),
  component: BlogIndex,
});

interface PostRowProps {
  slug: string;
  title: string;
  date: string;
  draft?: boolean;
}

function PostRow({ slug, title, date, draft }: PostRowProps) {
  const params = useMemo(() => ({ _splat: slug }), [slug]);
  const { t } = useWebsiteI18n();
  return (
    <div className="flex flex-col-reverse items-start md:flex-row md:items-center gap-x-4">
      <span className="text-lg text-muted-foreground tabular-nums">
        {formatDate(new Date(date))}
      </span>
      <Link
        to="/blog/$"
        params={params}
        className="text-lg text-foreground hover:text-primary transition-colors"
      >
        {title}
        {draft && (
          <span className="ml-2 text-xs px-2 py-1 bg-primary/20 text-primary rounded">
            {t("blog.draft")}
          </span>
        )}
      </Link>
    </div>
  );
}

function BlogIndex() {
  const { t } = useWebsiteI18n();
  const { drafts } = Route.useSearch();
  const posts = getPosts(drafts === true);

  return (
    <div>
      {drafts && (
        <div className="mb-6 p-4 bg-primary/10 rounded border-l-4 border-primary">
          <p className="text-sm text-foreground/80">{t("blog.showingDrafts")}</p>
        </div>
      )}
      <div className="space-y-2">
        {posts.map(({ slug, frontmatter }) => (
          <PostRow
            key={slug}
            slug={slug}
            title={frontmatter.title}
            date={frontmatter.date}
            draft={frontmatter.draft}
          />
        ))}
        {posts.length === 0 && <p className="text-muted-foreground">{t("blog.empty")}</p>}
      </div>
    </div>
  );
}
