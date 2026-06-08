import { describe, it, expect } from "vitest";
import { validate, truncate, buildEmbed, type CloudSignupInput } from "./cloud-signup-utils";

describe("validate", () => {
  it("accepts valid input with required fields", () => {
    const result = validate({
      email: "test@example.com",
      message: "Hello world",
    });
    expect(result.email).toBe("test@example.com");
    expect(result.message).toBe("Hello world");
    expect(result.name).toBeUndefined();
    expect(result.company).toBeUndefined();
    expect(result.role).toBeUndefined();
  });

  it("accepts valid input with all fields", () => {
    const result = validate({
      email: "user@example.com",
      message: "I want to try it",
      name: "Alice",
      company: "Acme",
      role: "Engineer",
    });
    expect(result.email).toBe("user@example.com");
    expect(result.name).toBe("Alice");
  });

  it("rejects non-object input", () => {
    expect(() => validate(null)).toThrow("invalid input");
    expect(() => validate("string")).toThrow("invalid input");
  });

  it("rejects invalid email", () => {
    expect(() => validate({ email: "not-an-email", message: "hello" })).toThrow("invalid email");
  });

  it("rejects empty message", () => {
    expect(() => validate({ email: "a@b.com", message: "" })).toThrow("message required");
  });

  it("trims whitespace from email and message", () => {
    const result = validate({
      email: "  test@example.com  ",
      message: "  hello  ",
    });
    expect(result.email).toBe("test@example.com");
    expect(result.message).toBe("hello");
  });

  it("sets optional fields to undefined when empty", () => {
    const result = validate({
      email: "test@example.com",
      message: "hello",
      name: "",
      company: "",
    });
    expect(result.name).toBeUndefined();
    expect(result.company).toBeUndefined();
  });

  it("sets honeypot from string input", () => {
    const result = validate({
      email: "test@example.com",
      message: "hello",
      honeypot: "bot-fill",
    });
    expect(result.honeypot).toBe("bot-fill");
  });

  it("sets honeypot to empty string when not provided", () => {
    const result = validate({
      email: "test@example.com",
      message: "hello",
    });
    expect(result.honeypot).toBe("");
  });

  it("rejects fields that are too long", () => {
    expect(() =>
      validate({
        email: "a@b.com",
        message: "x".repeat(4001),
      }),
    ).toThrow("field too long");
  });
});

describe("truncate", () => {
  it("returns the string unchanged when within limit", () => {
    expect(truncate("hello", 10)).toBe("hello");
  });

  it("truncates and adds ellipsis when over limit", () => {
    expect(truncate("hello world", 8)).toBe("hello w…");
  });
});

describe("buildEmbed", () => {
  it("builds embed with email and message only", () => {
    const input: CloudSignupInput = {
      email: "test@example.com",
      message: "Hello",
    };
    const embed = buildEmbed(input);
    expect(embed.title).toBe("ChisaCode Cloud signup");
    expect(embed.color).toBe(0x5865f2);
    expect(embed.fields).toHaveLength(2); // email + message
    expect(embed.fields[0].name).toBe("Email");
    expect(embed.fields[1].name).toBe("Message");
  });

  it("includes optional fields when present", () => {
    const input: CloudSignupInput = {
      email: "test@example.com",
      message: "Hello",
      name: "Alice",
      company: "Acme",
      role: "Engineer",
    };
    const embed = buildEmbed(input);
    expect(embed.fields).toHaveLength(5);
  });
});
