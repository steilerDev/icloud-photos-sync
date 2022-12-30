/**
 * Thype definition for this classe's severity level
 */
export type Severity = `WARN` | `FATAL`

/**
 * Base class for this tools common error type
 */
export class iCPSError extends Error {
    /**
     * Optional message of this error
     */
    message: string;

    /**
     * Optional cause of this error
     */
    cause?: Error;

    /**
     * Additional 'free form' context
     */
    context: any = {};

    /**
     * The severity of this error
     */
    sev: Severity;

    constructor(errorClass: Function, message: string, sev: Severity) {
        super(message);

        // Maintains proper stack trace for where our error was thrown (only available on V8)
        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, errorClass);
        }

        this.name = errorClass.name;
        this.message = message;
        this.sev = sev;
    }

    /**
     * Adds the provided error as cause of this error
     * @param err - The cause of this error
     * @returns This object for chaining convenience
     */
    addCause(err: Error): iCPSError {
        this.cause = err;
        return this;
    }

    /**
     * Adds a random object to this error as context for error reporting
     * @param key - The key to store the object
     * @param ctx - The context
     * @returns This object for chaining convenience
     */
    addContext(key: string, ctx: any): iCPSError {
        this.context[key] = ctx;
        return this;
    }

    /**
     *
     * @returns A description for this error, containing its cause chain
     */
    getDescription(): string {
        let desc = `${this.name} (${this.sev}): ${this.message}`;
        if (this.cause) {
            desc += ` caused by `;
            if (this.cause instanceof iCPSError) {
                desc += this.cause.getDescription();
            } else {
                desc += this.cause.message;
            }
        }

        return desc;
    }

    /**
     *
     * @returns The context for this object, including the context of optional causing errors
     */
    getContext(): any {
        if (this.cause && this.cause instanceof iCPSError) {
            return {...this.context, ...this.cause.getContext()};
        }

        return this.context;
    }

    /**
     * Checks if the provided Error is iCPS & sev.fatal
     * @param err - An unknown object
     * @returns True if the provided error is an iCPS error with severity FATAL or any object
     */
    static fatalError(err: unknown): boolean {
        return !(err instanceof iCPSError && err.sev === `WARN`);
    }

    static toiCPSError(err: unknown): iCPSError {
        if (err instanceof iCPSError) {
            return err;
        }

        const _err = new iCPSError(iCPSError, `Unknown error`, `FATAL`);

        if (err instanceof Error) {
            return _err.addCause(err);
        }

        return _err.addContext(`unknownErrorObject`, err);
    }
}

/**
 * Error class for user interrupted errors
 */
export class InterruptError extends iCPSError {
    constructor(message: string) {
        super(InterruptError, `Operation interrupted: ${message}`, `FATAL`);
    }
}

/**
 * Error class for iCloud related errors
 */
export class iCloudError extends iCPSError {
    constructor(cause: string, sev: Severity) {
        super(iCloudError, cause, sev);
    }
}

/**
 * Error class for iCloud Auth related errors
 */
export class iCloudAuthError extends iCPSError {
    constructor(cause: string, sev: Severity) {
        super(iCloudAuthError, cause, sev);
    }
}

/**
 * Error class for the local Librarie's related errors
 */
export class LibraryError extends iCPSError {
    constructor(cause: string, sev: Severity) {
        super(LibraryError, cause, sev);
    }
}

/**
 * Error class for the MFA server's related errors
 */
export class MFAError extends iCPSError {
    constructor(cause: string, sev: Severity) {
        super(MFAError, cause, sev);
    }
}

/**
 * Error class for errors related to the token program
 */
export class TokenError extends iCPSError {
    constructor(cause: string, sev: Severity) {
        super(TokenError, cause, sev);
    }
}

/**
 * Error class for errors related to the sync program
 */
export class SyncError extends iCPSError {
    constructor(cause: string, sev: Severity) {
        super(SyncError, cause, sev);
    }
}

/**
 * Error class for errors related to the archive program
 */
export class ArchiveError extends iCPSError {
    constructor(cause: string, sev: Severity) {
        super(SyncError, cause, sev);
    }
}