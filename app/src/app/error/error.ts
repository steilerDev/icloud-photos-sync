import {ErrorStruct, ERR_UNKNOWN} from "./error-codes.js";

/**
 * Base class for this tool's error type
 */
export class iCPSError extends Error {
    /**
     * Message of this error
     */
    message: string;

    /**
     * The error code of this error
     */
    code: string;

    /**
     * Optional cause of this error
     */
    cause?: Error;

    /**
     * Additional 'free form' context - to be uploaded to error reporting solution
     */
    context: any = {};

    /**
     * Additional message, to be presented to the user
     */
    messages: string[] = [];

    /**
     * If this error was reported, it will receive a UUID for future reference
     */
    btUUID?: string = undefined;

    /**
     * Creates an application specific error using the provided
     * @param err - The error structure
     */
    constructor(err: ErrorStruct = ERR_UNKNOWN) {
        super(err.message);

        this.name = err.name;
        this.message = err.message;
        this.code = err.code;

        // Maintains proper stack trace for where our error was thrown (only available on V8)
        Error.captureStackTrace(this, iCPSError);
    }

    /**
     * Adds the provided error as cause of this error and applies the causing error's stack trace to maintain fingerprinting capabilities
     * @param err - The cause of this error
     * @returns This object for chaining convenience
     */
    addCause(err: Error): iCPSError {
        if (err) {
            this.cause = err;
            if (err instanceof iCPSError) {
                // Applying the causing's error stack and classifier only for the underlying iCPSError, in order to properly fingerprint the error
                this.stack = err.stack;
                this.name = err.name;
            }
        }

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
     * Adds an additional message to this error's message to provide the user with more information
     * @param msg - The message to be added
     * @returns This object for chaining convenience
     */
    addMessage(msg: string): iCPSError {
        this.messages.push(msg);
        return this;
    }

    /**
     *
     * @returns A description for this error, containing its cause chain's description
     */
    getDescription(): string {
        let desc = `${this.code}: ${this.message}`;

        if (this.messages.length > 0) {
            desc += ` (${this.messages.join(`, `)})`;
        }

        if (this.cause) {
            desc += ` caused by `;
            if (this.cause instanceof iCPSError) {
                desc += this.cause.getDescription();
            } else {
                desc += this.cause.message;
            }
        }

        if (this.btUUID) {
            desc += ` (error code: ${this.btUUID})`;
        }

        return desc;
    }

    /**
     * Returns the root error code for this error.
     * @param onlyICPSError - If set to true, will only take iCPS Errors into consideration
     * @returns the error code for the first thrown error
     */
    getRootErrorCode(onlyICPSError: boolean = false): string {
        // getErrorCodeStack returns at least one item
        return this.getErrorCodeStack(onlyICPSError).pop()!;
    }

    /**
     * Returns the list of error codes associated to this error.
     * @param onlyICPSError - If set to true, will only take iCPS Errors into consideration
     * @returns The stack of thrown errors, where 'last()' is the root cause
     */
    getErrorCodeStack(onlyICPSError: boolean = false): string[] {
        const errorCodeStack = [this.code];
        if (!this.cause) {
            return errorCodeStack;
        }

        if (this.cause instanceof iCPSError) {
            errorCodeStack.push(...this.cause.getErrorCodeStack(onlyICPSError));
            return errorCodeStack;
        }

        // If we only want to get iCPSError codes, at this point the root cause is non-iCPS - therefore returning only this error's code
        if (onlyICPSError) {
            return errorCodeStack;
        }

        if (Object.hasOwn(this.cause, `code`)) {
            errorCodeStack.push(`EXT#${(this.cause as any).code}`);
            return errorCodeStack;
        }

        errorCodeStack.push(`NO_ROOT_ERROR_CODE`);
        return errorCodeStack;
    }

    /**
     * Makes sure that the provided err is an iCPSError
     * @param err - The error that should be in iCPSError format
     * @returns The error (if it already is an iCPSError), or a new iCPSError that attached the provided error as cause or context (depending on type)
     */
    static toiCPSError(err: unknown): iCPSError {
        if (err instanceof iCPSError) {
            return err;
        }

        const _err = new iCPSError();

        if (err instanceof Error) {
            return _err.addCause(err);
        }

        return _err.addContext(`unknownErrorObject`, err);
    }
}