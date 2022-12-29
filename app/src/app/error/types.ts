import { inspect } from "util"

export type Severity = "WARN" | "FATAL"

export class iCPSError extends Error {
    cause?: Error
    // Additional 'free form' context
    context: any = {}
    // The severity of the error
    sev: Severity

    constructor(errorClass: Function, cause: string, sev: Severity)  {
        super(cause)

        // Maintains proper stack trace for where our error was thrown (only available on V8)
        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, errorClass);
        }
  
        this.name = errorClass.name;

        this.sev = sev
    }

    addCause(err: Error): iCPSError {
        this.cause = err
        return this
    }

    addContext(key: string, ctx: any): iCPSError {
        this.context[key] = ctx
        return this
    }

    getDescription(): string {
        var desc = `${this.sev}: ${this.name}: ${this.message}`
        if(this.cause) {
            desc += ` caused by `
            if(this.cause instanceof iCPSError) {
                desc += this.cause.getDescription()
            } else {
                desc += this.cause.message
            }
        }
        return desc
    }

    getContext(): any {
        if(this.cause && this.cause instanceof iCPSError) {
            return {...this.context, ...this.cause.getContext()}
        }
        return this.context
    }

    /**
     * Checks if the provided Error is iCPS & sev.fatal
     * @param err - An unknown object
     * @returns True if the provided error is an iCPS error with severity FATAL or any object
     */
    static fatalError(err: unknown): boolean {
        return !(err instanceof iCPSError && err.sev === "WARN")
    }
}

/**
 * Error class for user interrupted errors
 */
export class InterruptError extends iCPSError {
    constructor(message: string) {
        super(InterruptError, `Operation interrupted: ${message}`, "FATAL")
    }
}

export class TokenError extends iCPSError {
    constructor(cause: string, sev: Severity) {
        super(TokenError, cause, sev)
    }
}

export class iCloudError extends iCPSError {
    constructor(cause: string, sev: Severity) {
        super(iCloudError, cause, sev)
    }
}

export class LibraryError extends iCPSError {
    constructor(cause: string, sev: Severity) {
        super(LibraryError, cause, sev)
    }
}


export class iCloudAuthError extends iCPSError {
    constructor(cause: string, sev: Severity) {
        super(iCloudAuthError, cause, sev)
    }
}

export class MFAError extends iCPSError {
    constructor(cause: string, sev: Severity) {
        super(MFAError, cause, sev)
    }
}


export class SyncError extends iCPSError {
    constructor(cause: string, sev: Severity) {
        super(SyncError, cause, sev)
    }
}

export class ArchiveError extends iCPSError {
    constructor(cause: string, sev: Severity) {
        super(SyncError, cause, sev)
    }
}