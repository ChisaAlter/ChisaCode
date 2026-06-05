import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useState, type FormEvent } from "react";
import { submitCloudSignup, type CloudSignupInput } from "~/cloud-signup";
import { FAQItem } from "~/components/faq-item";
import { SiteShell } from "~/components/site-shell";
import { useWebsiteI18n } from "~/i18n";
import { pageMeta } from "~/meta";

export const Route = createFileRoute("/cloud")({
  head: () =>
    pageMeta(
      "ChisaCode Cloud - Design Partners",
      "Run ChisaCode across machines, with a team, or inside a company. We're onboarding design partners for the hosted, multi-machine, multi-user version of ChisaCode.",
      "/cloud",
    ),
  component: Cloud,
});

const INPUT_CLASS =
  "block w-full rounded-md bg-white/5 border border-white/10 px-3.5 py-2.5 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-white/30 transition-colors";

type Status = "idle" | "submitting" | "success" | "error";

function Cloud() {
  const { t } = useWebsiteI18n();

  return (
    <SiteShell>
      <h1 className="text-3xl font-medium mb-3">{t("cloud.title")}</h1>
      <p className="text-white/70 leading-relaxed mb-10">{t("cloud.subtitle")}</p>

      <div className="space-y-20">
        <SignupForm />
        <FaqSection />
      </div>
    </SiteShell>
  );
}

function SignupForm() {
  const { t } = useWebsiteI18n();
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      setStatus("submitting");
      setError(null);

      const form = new FormData(event.currentTarget);
      const data: CloudSignupInput = {
        email: String(form.get("email") ?? ""),
        name: form.get("name") ? String(form.get("name")) : undefined,
        company: form.get("company") ? String(form.get("company")) : undefined,
        role: form.get("role") ? String(form.get("role")) : undefined,
        message: String(form.get("message") ?? ""),
        honeypot: form.get("website") ? String(form.get("website")) : "",
      };

      try {
        await submitCloudSignup({ data });
        setStatus("success");
      } catch (err) {
        setStatus("error");
        setError(err instanceof Error ? err.message : t("cloud.formError"));
      }
    },
    [t],
  );

  if (status === "success") {
    return (
      <section className="space-y-3">
        <p className="text-white/70">
          {t("cloud.successPrefix")}{" "}
          <a
            href="https://discord.gg/jz8T2uahpH"
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-white/80"
          >
            Discord
          </a>
          {t("cloud.successSuffix")}
        </p>
      </section>
    );
  }

  const submitting = status === "submitting";

  return (
    <form onSubmit={handleSubmit} className="space-y-6" noValidate>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        <Field label={t("cloud.email")} required>
          <input type="email" name="email" required autoComplete="email" className={INPUT_CLASS} />
        </Field>
        <Field label={t("cloud.name")}>
          <input type="text" name="name" autoComplete="name" className={INPUT_CLASS} />
        </Field>
        <Field label={t("cloud.company")}>
          <input type="text" name="company" autoComplete="organization" className={INPUT_CLASS} />
        </Field>
        <Field label={t("cloud.role")}>
          <input
            type="text"
            name="role"
            autoComplete="organization-title"
            className={INPUT_CLASS}
          />
        </Field>
      </div>

      <Field label={t("cloud.message")} required>
        <textarea
          name="message"
          required
          rows={5}
          placeholder={t("cloud.messagePlaceholder")}
          className={`${INPUT_CLASS} resize-y`}
        />
      </Field>

      <input
        type="text"
        name="website"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        className="absolute left-[-9999px] w-px h-px opacity-0"
      />

      {error && (
        <p className="text-sm text-red-400">
          {error === "webhook not configured" ? t("cloud.formNotConfigured") : t("cloud.formError")}
        </p>
      )}

      <div className="flex items-center gap-4 pt-4">
        <button
          type="submit"
          disabled={submitting}
          className="rounded-md bg-white text-black px-4 py-2 text-sm font-medium hover:bg-white/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {submitting ? t("cloud.sending") : t("cloud.send")}
        </button>
        <p className="text-sm text-white/50">
          {t("cloud.or")}{" "}
          <a
            href="https://discord.gg/jz8T2uahpH"
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-white/80"
          >
            {t("cloud.dmDiscord")}
          </a>
          .
        </p>
      </div>
    </form>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="block text-sm font-medium text-white/80 pb-2">
        {label}
        {required && <span className="text-white/40"> *</span>}
      </span>
      {children}
    </label>
  );
}

function FaqSection() {
  const { t } = useWebsiteI18n();

  return (
    <section className="space-y-6">
      <h2 className="text-3xl font-medium">{t("cloud.faq")}</h2>
      <div className="space-y-6">
        <FAQItem question={t("cloud.whatQuestion")}>{t("cloud.whatAnswer")}</FAQItem>
        <FAQItem question={t("cloud.openSourceQuestion")}>{t("cloud.openSourceAnswer")}</FAQItem>
        <FAQItem question={t("cloud.hostedQuestion")}>{t("cloud.hostedAnswer")}</FAQItem>
        <FAQItem question={t("cloud.codeQuestion")}>{t("cloud.codeAnswer")}</FAQItem>
        <FAQItem question={t("cloud.availableQuestion")}>{t("cloud.availableAnswer")}</FAQItem>
        <FAQItem question={t("cloud.pricingQuestion")}>{t("cloud.pricingAnswer")}</FAQItem>
      </div>
    </section>
  );
}
