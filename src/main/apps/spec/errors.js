/**
 * apps/spec Error Types
 *
 * Custom error classes for YAML parsing and spec validation failures.
 * Provides structured error information for consumers (apps/manager UI, CLI).
 */
/**
 * Thrown when the YAML string itself is malformed (syntax error).
 */
export class AppSpecParseError extends Error {
    cause;
    code = 'APP_SPEC_PARSE_ERROR';
    constructor(message, cause) {
        super(`YAML parse error: ${message}`);
        this.cause = cause;
        this.name = 'AppSpecParseError';
    }
}
/**
 * Thrown when the parsed YAML object fails Zod schema validation.
 * Contains structured issue list for UI rendering.
 */
export class AppSpecValidationError extends Error {
    issues;
    code = 'APP_SPEC_VALIDATION_ERROR';
    constructor(message, issues) {
        super(message);
        this.issues = issues;
        this.name = 'AppSpecValidationError';
    }
}
//# sourceMappingURL=errors.js.map