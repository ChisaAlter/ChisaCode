/**
 * Error Handling Tests
 */

import { describe, it, expect, vi } from "vitest";
import {
  NotFoundError,
  ValidationError,
  AuthError,
  OperationError,
  TimeoutError,
  ConflictError,
  RateLimitError,
  ProviderError,
  ErrorHandler,
  withRetry,
  isChisaCodeError,
  isNotFoundError,
} from "./errors";

describe("Error Classes", () => {
  describe("NotFoundError", () => {
    it("should create with resource info", () => {
      const error = new NotFoundError("Agent", "agent-123");

      expect(error.code).toBe("NOT_FOUND");
      expect(error.statusCode).toBe(404);
      expect(error.resourceType).toBe("Agent");
      expect(error.resourceId).toBe("agent-123");
      expect(error.message).toBe("Agent not found: agent-123");
    });

    it("should serialize to JSON", () => {
      const error = new NotFoundError("Agent", "agent-123", { workspace: "default" });
      const json = error.toJSON();

      expect(json).toMatchObject({
        code: "NOT_FOUND",
        message: "Agent not found: agent-123",
        resourceType: "Agent",
        resourceId: "agent-123",
        context: { workspace: "default" },
      });
    });
  });

  describe("ValidationError", () => {
    it("should include field errors", () => {
      const error = new ValidationError("Validation failed", {
        prompt: ["Prompt is required", "Prompt must be < 1000 chars"],
        provider: ["Invalid provider"],
      });

      expect(error.code).toBe("VALIDATION_ERROR");
      expect(error.statusCode).toBe(400);
      expect(error.fields).toHaveProperty("prompt");
    });
  });

  describe("TimeoutError", () => {
    it("should be recoverable", () => {
      const error = new TimeoutError("agent_run", 30000);

      expect(error.isRecoverable()).toBe(true);
      expect(error.statusCode).toBe(408);
    });
  });

  describe("RateLimitError", () => {
    it("should include retry after", () => {
      const error = new RateLimitError(60);
      const json = error.toJSON();

      expect(json.retryAfter).toBe(60);
      expect(error.isRecoverable()).toBe(true);
    });
  });

  describe("ProviderError", () => {
    it("should include provider ID", () => {
      const error = new ProviderError("claude", "Authentication failed", {
        cause: new Error("API key invalid"),
      });

      expect(error.providerId).toBe("claude");
      expect(error.message).toContain("Provider claude");
      expect(error.cause?.message).toBe("API key invalid");
    });
  });
});

describe("ErrorHandler", () => {
  describe("toHTTPResponse", () => {
    it("should convert ChisaCodeError to HTTP response", () => {
      const error = new NotFoundError("Agent", "agent-123");
      const response = ErrorHandler.toHTTPResponse(error);

      expect(response.statusCode).toBe(404);
      expect(response.body.error.code).toBe("NOT_FOUND");
    });

    it("should sanitize unknown errors", () => {
      const error = new Error("Database connection failed");
      const response = ErrorHandler.toHTTPResponse(error);

      expect(response.statusCode).toBe(500);
      expect(response.body.error.code).toBe("INTERNAL_ERROR");
      expect(response.body.error.message).not.toContain("Database");
    });
  });

  describe("shouldRetry", () => {
    it("should retry recoverable errors", () => {
      const error = new TimeoutError("operation", 5000);
      expect(ErrorHandler.shouldRetry(error, 0, 3)).toBe(true);
      expect(ErrorHandler.shouldRetry(error, 2, 3)).toBe(true);
      expect(ErrorHandler.shouldRetry(error, 3, 3)).toBe(false);
    });

    it("should not retry non-recoverable errors", () => {
      const error = new ValidationError("Invalid input");
      expect(ErrorHandler.shouldRetry(error, 0, 3)).toBe(false);
    });

    it("should not retry unknown errors", () => {
      const error = new Error("Unknown");
      expect(ErrorHandler.shouldRetry(error, 0, 3)).toBe(false);
    });
  });

  describe("getRetryDelay", () => {
    it("should use exponential backoff", () => {
      const delay0 = ErrorHandler.getRetryDelay(0, 1000);
      const delay1 = ErrorHandler.getRetryDelay(1, 1000);
      const delay2 = ErrorHandler.getRetryDelay(2, 1000);

      // With jitter, approximate ranges
      expect(delay0).toBeGreaterThan(800);
      expect(delay0).toBeLessThan(1200);

      expect(delay1).toBeGreaterThan(1600);
      expect(delay1).toBeLessThan(2400);

      expect(delay2).toBeGreaterThan(3200);
      expect(delay2).toBeLessThan(4800);
    });
  });

  describe("log", () => {
    it("should log with appropriate level", () => {
      const logger = {
        warn: vi.fn(),
        error: vi.fn(),
      };

      // Recoverable error -> warn
      const timeoutError = new TimeoutError("operation", 5000);
      ErrorHandler.log(timeoutError, logger);
      expect(logger.warn).toHaveBeenCalled();

      // Non-recoverable error -> error
      const validationError = new ValidationError("Invalid");
      ErrorHandler.log(validationError, logger);
      expect(logger.error).toHaveBeenCalled();
    });
  });
});

describe("withRetry", () => {
  it("should succeed on first attempt", async () => {
    const fn = vi.fn().mockResolvedValue("success");
    const result = await withRetry(fn);

    expect(result).toBe("success");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("should retry on recoverable error", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new TimeoutError("op", 1000))
      .mockResolvedValueOnce("success");

    const result = await withRetry(fn, { maxAttempts: 3, baseDelayMs: 10 });

    expect(result).toBe("success");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("should not retry on non-recoverable error", async () => {
    const fn = vi.fn().mockRejectedValue(new ValidationError("Invalid"));

    await expect(withRetry(fn, { maxAttempts: 3 })).rejects.toThrow(ValidationError);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("should exhaust retries and throw", async () => {
    const fn = vi.fn().mockRejectedValue(new TimeoutError("op", 1000));

    await expect(withRetry(fn, { maxAttempts: 3, baseDelayMs: 10 })).rejects.toThrow(TimeoutError);
    expect(fn).toHaveBeenCalledTimes(3);
  });
});

describe("Type guards", () => {
  it("should identify ChisaCodeError", () => {
    const error1 = new NotFoundError("Agent", "123");
    const error2 = new Error("Generic");

    expect(isChisaCodeError(error1)).toBe(true);
    expect(isChisaCodeError(error2)).toBe(false);
  });

  it("should identify specific error types", () => {
    const error = new NotFoundError("Agent", "123");

    expect(isNotFoundError(error)).toBe(true);
    expect(isNotFoundError(new ValidationError("Invalid"))).toBe(false);
  });
});

/**
 * Integration example: Agent service with error handling
 */
describe("Agent service integration", () => {
  it("should handle errors in agent operations", async () => {
    class AgentService {
      async getAgent(id: string) {
        // Simulate agent not found
        if (id === "nonexistent") {
          throw new NotFoundError("Agent", id);
        }

        // Simulate timeout
        if (id === "timeout") {
          throw new TimeoutError("get_agent", 5000);
        }

        return { id, status: "idle" };
      }
    }

    const service = new AgentService();

    // NotFoundError
    await expect(service.getAgent("nonexistent")).rejects.toThrow(NotFoundError);

    // Retry on timeout
    let attempts = 0;
    const getWithRetry = async () => {
      attempts++;
      if (attempts < 3) {
        throw new TimeoutError("get_agent", 5000);
      }
      return { id: "success", status: "idle" };
    };

    const result = await withRetry(getWithRetry, { maxAttempts: 5, baseDelayMs: 10 });
    expect(result.id).toBe("success");
    expect(attempts).toBe(3);
  });
});
