/**
 * apps/manager -- Custom Error Types
 *
 * Domain-specific errors for App lifecycle operations.
 * These allow callers to distinguish between different failure modes
 * without parsing error message strings.
 */
/**
 * Thrown when an operation references an App ID that does not exist in the database.
 */
export class AppNotFoundError extends Error {
    appId;
    constructor(appId) {
        super(`App not found: ${appId}`);
        this.name = 'AppNotFoundError';
        this.appId = appId;
    }
}
/**
 * Thrown when a status transition violates the state machine rules.
 */
export class InvalidStatusTransitionError extends Error {
    appId;
    fromStatus;
    toStatus;
    constructor(appId, fromStatus, toStatus, customMessage) {
        super(customMessage ??
            `Invalid status transition for App ${appId}: ` +
                `cannot move from '${fromStatus}' to '${toStatus}'`);
        this.name = 'InvalidStatusTransitionError';
        this.appId = appId;
        this.fromStatus = fromStatus;
        this.toStatus = toStatus;
    }
}
/**
 * Thrown when attempting to install an App that is already installed
 * in the same space (same specId + spaceId combination).
 */
export class AppAlreadyInstalledError extends Error {
    specId;
    spaceId;
    constructor(specId, spaceId) {
        super(`App '${specId}' is already installed in space '${spaceId}'`);
        this.name = 'AppAlreadyInstalledError';
        this.specId = specId;
        this.spaceId = spaceId;
    }
}
/**
 * Thrown when the space referenced during install does not exist.
 */
export class SpaceNotFoundError extends Error {
    spaceId;
    constructor(spaceId) {
        super(`Space not found: ${spaceId}`);
        this.name = 'SpaceNotFoundError';
        this.spaceId = spaceId;
    }
}
//# sourceMappingURL=errors.js.map