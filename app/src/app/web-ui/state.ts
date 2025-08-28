import {MFA_ERR, AUTH_ERR, WEB_SERVER_ERR} from "../error/error-codes.js";
import {iCPSError} from "../error/error.js";

export enum StateType {
    Unknown = `unknown`,
    Ok = `ok`,
    Authenticating = `authenticating`,
    Syncing = `syncing`,
    Error = `error`,
    ReauthSuccess = `reauthSuccess`,
    ReauthError = `reauthError`
}

export class State {
    protected constructor(public readonly type: StateType) {}

    public isWaitingForMfa(): boolean {
        return false;
    }

    public setWaitingForMfa(_isWaiting: boolean): void {
        // No-op in base class
    }

    public isError(): this is ErrorState {
        return this instanceof ErrorState;
    }

    public isSettled(): this is SettledState {
        return this instanceof SettledState;
    }

    public isActive(): this is ActiveState {
        return this instanceof ActiveState;
    }

    public getDto() {
        return {
            state: this.type,
            waitingForMfa: this.isWaitingForMfa()
        }
    }

    public static unknown(): State {
        return new State(StateType.Unknown);
    }
}

export class ActiveState extends State {
    private _isWaitingForMfa = false;

    public constructor(stateType: StateType.Syncing | StateType.Authenticating) {
        super(stateType);
    }

    public isWaitingForMfa(): boolean {
        return this._isWaitingForMfa;
    }

    public setWaitingForMfa(isWaiting: boolean): void {
        this._isWaitingForMfa = isWaiting;
    }

    public static syncing(): State {
        return new ActiveState(StateType.Syncing);
    }

    public static authenticating(): State {
        return new ActiveState(StateType.Authenticating);
    }
}

export class SettledState extends State {
    public readonly timestamp: number = Date.now();

    constructor(public readonly type: StateType.Ok | StateType.ReauthSuccess | StateType.Error | StateType.ReauthError) {
        super(type);
    }

    public getDto() {
        return {
            ...super.getDto(),
            stateTimestamp: this.isSettled() ? this.timestamp : null,
        }
        
    }

    public static ok(): State {
        return new SettledState(StateType.Ok);
    }

    public static reauthSuccess(): State {
        return new SettledState(StateType.ReauthSuccess);
    }
}

export class ErrorState extends SettledState {
    constructor(
        public readonly type: StateType.Error | StateType.ReauthError,
        public readonly errorMessage: string
    ) {
        super(type);
    }

    public getDto() {
        return {
            ...super.getDto(),
            errorMessage: this.errorMessage
        };
    }

    public static error(error: iCPSError | string): ErrorState {
        if (typeof error === `string`) {
            return new ErrorState(StateType.Error, error);
        }
        return new ErrorState(StateType.Error, this.getMessageFrom(error));
    }

    public static reauthError(error: iCPSError | string): ErrorState {
        if (typeof error === `string`) {
            return new ErrorState(StateType.ReauthError, error);
        }
        return new ErrorState(StateType.ReauthError, this.getMessageFrom(error));
    }

    private static getMessageFrom(error: iCPSError): string {
        let cause = error
        while (cause.cause && cause.cause instanceof iCPSError) {
            cause = cause.cause;
        }
        switch (cause.code) {
        case MFA_ERR.FAIL_ON_MFA.code:
            return `Multifactor authentication code required. Use the 'Renew Authentication' button to request and enter a new code.`;
        case AUTH_ERR.UNAUTHORIZED.code:
            return `Your credentials seem to be invalid. Please check your iCloud credentials and try again.`;
        case WEB_SERVER_ERR.MFA_CODE_NOT_PROVIDED.code:
            return `Multifactor authentication code not provided within timeout period. Use the 'Renew Authentication' button to request and enter a new code.`;
        default:
            return cause.message;
        }
    }
}