import { describe, expect, it } from "vitest";
import { createAppI18n, resources } from "./index";

describe("createAppI18n", () => {
  it("defaults to Simplified Chinese", () => {
    const i18n = createAppI18n("zh-CN");

    expect(i18n.t("settings.general.language.title")).toBe("语言");
  });

  it("switches to English resources", () => {
    const i18n = createAppI18n("en");

    expect(i18n.t("settings.general.language.title")).toBe("Language");
  });

  it("falls back to English when a key is missing from the selected language", () => {
    const i18n = createAppI18n("zh-CN", {
      "zh-CN": {},
      en: {
        translation: {
          onlyEnglish: "English fallback",
        },
      },
    });

    expect(i18n.t("onlyEnglish")).toBe("English fallback");
  });

  it("keeps shared app translation domains available", () => {
    const zh = resources["zh-CN"].translation;
    const en = resources.en.translation;

    for (const domain of [
      "common",
      "onboarding",
      "workspace",
      "session",
      "composer",
      "terminal",
      "files",
      "providers",
      "settings",
      "errors",
    ]) {
      expect(zh).toHaveProperty(domain);
      expect(en).toHaveProperty(domain);
    }
  });
});
