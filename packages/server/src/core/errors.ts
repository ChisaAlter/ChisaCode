/**
 * Standardized Error Handling System
 *
 * Provides consistent error types, logging, and recovery patterns.
 * Inspired by T3code's typed Effect errors.
 *
 * Benefits:
 * - Type-safe error handling
 * - Consistent error responses
 * - Better debugging with error context
 * - Centralized error logging
 *
 * Usage:
 *
 * ```typescript
 * // Throw typed errors
 * throw new NotFoundError('Agent', agentId)
 * throw new ValidationError('Invalid prompt', { prompt })
 *
 * // Catch and handle
 * try {
 *   await agentManager.getAgent(id)
 * } catch (error) {
 *   if (error instanceof NotFoundError) {
 *     return { status: 404, error: error.toJSON() }
 *   }
 *   throw error
 * }
 *
 * // With error context
 * throw new OperationError('Failed to create agent', {
 *   cause: originalError,
 *   context: { providerId, config }
 * })
 * ```
 */

/**
 * Base error class with context
 */
export abstract class ChisaCodeError extends Error {
  abstract readonly code: string;
  abstract readonly statusCode: number;

  constructor(
    message: string,
    public readonly context?: Record<string, any>,
    public readonly cause?: Error,
  ) {
    super(message);
    this.name = this.constructor.name;

    // Capture stack trace
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  /**
   * Serialize error for logging/API response
   */
  toJSON() {
    return {
      code: this.code,
      message: this.message,
      context: this.context,
      ...(this.cause && { cause: this.cause.message }),
    };
  }

  /**
   * Check if error is recoverable
   */
  isRecoverable(): boolean {
    return false;
  }
}

/**
 * Resource not found (404)
 */
export class NotFoundError extends ChisaCodeError {
  readonly code = "NOT_FOUND";
  readonly statusCode = 404;

  constructor(
    public readonly resourceType: string,
    public readonly resourceId: string,
    context?: Record<string, any>,
  ) {
    super(`${resourceType} not found: ${resourceId}`, context);
  }

  toJSON() {
    return {
      ...super.toJSON(),
      resourceType: this.resourceType,
      resourceId: this.resourceId,
    };
  }
}

/**
 * Validation error (400)
 */
export class ValidationError extends ChisaCodeError {
  readonly code = "VALIDATION_ERROR";
  readonly statusCode = 400;

  constructor(
    message: string,
    public readonly fields?: Record<string, string[]>,
    context?: Record<string, any>,
  ) {
    super(message, context);
  }

  toJSON() {
    return {
      ...super.toJSON(),
      fields: this.fields,
    };
  }
}

/**
 * Authentication/Authorization error (401/403)
 */
export class AuthError extends ChisaCodeError {
  readonly code = "AUTH_ERROR";
  readonly statusCode: number;

  constructor(message: string, statusCode: 401 | 403 = 401, context?: Record<string, any>) {
    super(message, context);
    this.statusCode = statusCode;
  }
}

/**
 * Operation failed (500)
 */
export class OperationError extends ChisaCodeError {
  readonly code = "OPERATION_ERROR";
  readonly statusCode = 500;

  constructor(message: string, options?: { cause?: Error; context?: Record<string, any> }) {
    super(message, options?.context, options?.cause);
  }

  isRecoverable(): boolean {
    // Some operation errors are transient (network, timeouts)
    return this.code === "TIMEOUT_ERROR" || this.code === "NETWORK_ERROR";
  }
}

/**
 * Timeout error (408)
 */
export class TimeoutError extends ChisaCodeError {
  readonly code = "TIMEOUT_ERROR";
  readonly statusCode = 408;

  constructor(operation: string, timeoutMs: number, context?: Record<string, any>) {
    super(`Operation timed out: ${operation} (${timeoutMs}ms)`, context);
  }

  isRecoverable(): boolean {
    return true; // Timeouts are often transient
  }
}

/**
 * Conflict error (409) - resource already exists, concurrent modification, etc.
 */
export class ConflictError extends ChisaCodeError {
  readonly code = "CONFLICT_ERROR";
  readonly statusCode = 409;

  constructor(message: string, context?: Record<string, any>) {
    super(message, context);
  }
}

/**
 * Rate limit error (429)
 */
export class RateLimitError extends ChisaCodeError {
  readonly code = "RATE_LIMIT_ERROR";
  readonly statusCode = 429;

  constructor(
    public readonly retryAfterSeconds: number,
    context?: Record<string, any>,
  ) {
    super(`Rate limit exceeded. Retry after ${retryAfterSeconds}s`, context);
  }

  toJSON() {
    return {
      ...super.toJSON(),
      retryAfter: this.retryAfterSeconds,
    };
  }

  isRecoverable(): boolean {
    return true;
  }
}

/**
 * Provider-specific error
 */
export class ProviderError extends ChisaCodeError {
  readonly code = "PROVIDER_ERROR";
  readonly statusCode = 500;

  constructor(
    public readonly providerId: string,
    message: string,
    options?: { cause?: Error; context?: Record<string, any> },
  ) {
    super(`Provider ${providerId}: ${message}`, options?.context, options?.cause);
  }

  toJSON() {
    return {
      ...super.toJSON(),
      providerId: this.providerId,
    };
  }
}

/**
 * Logger interface for error logging
 */
export interface Logger {
  warn(data: unknown, message: string): void;
  error(data: unknown, message: string): void;
  info(data: unknown, message: string): void;
  debug(data: unknown, message: string): void;
}

/**
 * Error handler utility
 */
export class ErrorHandler {
  private static readonly SENSITIVE_KEYS = [
    "password",
    "token",
    "secret",
    "apiKey",
    "accessToken",
    "refreshToken",
  ];

  /**
   * Sanitize error context to remove sensitive information
   */
  private static sanitizeContext(
    context?: Record<string, unknown>,
  ): Record<string, unknown> | undefined {
    if (!context) return undefined;

    const sanitized: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(context)) {
      const lowerKey = key.toLowerCase();
      const isSensitive = this.SENSITIVE_KEYS.some((sensitive) =>
        lowerKey.includes(sensitive.toLowerCase()),
      );

      if (isSensitive) {
        sanitized[key] = "[REDACTED]";
      } else if (typeof value === "object" && value !== null && !Array.isArray(value)) {
        sanitized[key] = this.sanitizeContext(value as Record<string, unknown>);
      } else {
        sanitized[key] = value;
      }
    }

    return sanitized;
  }

  /**
   * Sanitize error for HTTP response
   */
  private static sanitizeError(errorJson: ReturnType<ChisaCodeError["toJSON"]>): {
    code: string;
    message: string;
    context?: Record<string, unknown>;
  } {
    return {
      code: errorJson.code,
      message: errorJson.message,
      context: this.sanitizeContext(errorJson.context),
    };
  }

  /**
   * Log error with appropriate level
   */
  static log(error: Error, logger: Logger): void {
    if (error instanceof ChisaCodeError) {
      const logData = {
        code: error.code,
        message: error.message,
        context: error.context,
        cause: error.cause?.message,
      };

      // Warn for recoverable errors, error for others
      if (error.isRecoverable()) {
        logger.warn(logData, "Recoverable error");
      } else {
        logger.error(logData, "Error");
      }
    } else {
      // Unknown error - always error level
      logger.error({ error }, "Unexpected error");
    }
  }

  /**
   * Convert error to HTTP response
   */
  static toHTTPResponse(error: Error): {
    statusCode: number;
    body: {
      error: {
        code: string;
        message: string;
        context?: Record<string, unknown>;
      };
    };
  } {
    if (error instanceof ChisaCodeError) {
      return {
        statusCode: error.statusCode,
        body: {
          error: this.sanitizeError(error.toJSON()),
        },
      };
    }

    // Unknown error - don't leak details
    return {
      statusCode: 500,
      body: {
        error: {
          code: "INTERNAL_ERROR",
          message: "An unexpected error occurred",
        },
      },
    };
  }

  /**
   * Retry predicate - should this error trigger a retry?
   */
  static shouldRetry(error: Error, attempt: number, maxAttempts: number): boolean {
    if (attempt >= maxAttempts) {
      return false;
    }

    if (error instanceof ChisaCodeError) {
      return error.isRecoverable();
    }

    // Unknown errors - don't retry by default
    return false;
  }

  /**
   * Calculate retry delay with exponential backoff
   */
  static getRetryDelay(attempt: number, baseDelayMs = 1000): number {
    // Exponential backoff: 1s, 2s, 4s, 8s, ...
    const delay = baseDelayMs * Math.pow(2, attempt);
    // Add jitter (±20%)
    const jitter = delay * 0.2 * (Math.random() - 0.5);
    return Math.round(delay + jitter);
  }
}

/**
 * Retry wrapper with error handling
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options?: {
    maxAttempts?: number;
    baseDelayMs?: number;
    logger?: Logger;
  },
): Promise<T> {
  const maxAttempts = options?.maxAttempts ?? 3;
  const baseDelayMs = options?.baseDelayMs ?? 1000;
  const logger = options?.logger;

  let lastError: Error;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;

      if (logger) {
        ErrorHandler.log(lastError, logger);
      }

      const shouldRetry = ErrorHandler.shouldRetry(lastError, attempt, maxAttempts);

      if (!shouldRetry) {
        throw lastError;
      }

      const delay = ErrorHandler.getRetryDelay(attempt, baseDelayMs);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError!;
}

/**
 * Type guard utilities
 */
export function isChisaCodeError(error: unknown): error is ChisaCodeError {
  return error instanceof ChisaCodeError;
}

export function isNotFoundError(error: unknown): error is NotFoundError {
  return error instanceof NotFoundError;
}

export function isValidationError(error: unknown): error is ValidationError {
  return error instanceof ValidationError;
}

export function isAuthError(error: unknown): error is AuthError {
  return error instanceof AuthError;
}

export function isTimeoutError(error: unknown): error is TimeoutError {
  return error instanceof TimeoutError;
}

export function isProviderError(error: unknown): error is ProviderError {
  return error instanceof ProviderError;
}
