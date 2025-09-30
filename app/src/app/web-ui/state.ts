import {iCPSError} from "../error/error.js";
import {MFA_ERR, AUTH_ERR, WEB_SERVER_ERR} from "../error/error-codes.js";

export enum StateType {
    READY = `ready`,
    AUTH = `authenticating`,
    MFA = `mfa_required`,
    SYNC = `syncing`,
}

export enum StateTrigger {
    SYNC = `sync`,
    AUTH = `auth`,
}

export class State {
    /**
     * Keeps track when the next scheduled sync should happen
     */
    nextSync?: number;
    /**
     * If error is present, previous state ended in error
     */
    prevError?: iCPSError
    /**
     * What triggered the current state initially (if applicable)
     */
    prevTrigger?: StateTrigger
    /**
     * The timestamp when the state was last changed
     */
    timestamp: number = Date.now();

    /**
     * Current state of the application
     */
    state: StateType = StateType.READY;

    updateState(newState: StateType, ctx? : {error?: iCPSError, nextSync?: number}) {
        this.timestamp = Date.now();
        this.state = newState;
        if(ctx) {
            if(ctx.nextSync) {
                this.nextSync = ctx.nextSync;
            }
            if(ctx.error) {
                this.prevError = iCPSError.toiCPSError(ctx.error);
            }
        }
        
    }

    /**
     * Indicates that the current state was changed due to a trigger (such as sync or auth).
     * This will clear any previous error.
     * @param trigger - The trigger that caused the state change
     */
    triggerSync(trigger: StateTrigger) {
        // First step is always to go to AUTH state
        this.updateState(StateType.AUTH);
        this.prevTrigger = trigger;
        this.prevError = undefined;
    }

    serialize() {

        let error = undefined
        if(this.prevError) {
            error = {
                message: this.prevError.getDescription(),
                code: this.prevError.getRootErrorCode(),
            }

            /**
             * If possible, this will try to convert known error codes into user-friendly messages
             */
            switch (error.code) {
            case MFA_ERR.FAIL_ON_MFA.code:
                error.message = `MFA code required. Use the 'Renew Authentication' button to request and enter a new code.`;
                break;
            case AUTH_ERR.UNAUTHORIZED.code:
                error.message = `Your credentials seem to be invalid. Please check your iCloud credentials and try again.`;
                break;
            case WEB_SERVER_ERR.MFA_CODE_NOT_PROVIDED.code:
                error.message = `MFA code not provided within timeout period. Use the 'Renew Authentication' button to request and enter a new code.`;
                break;
            }
        }

        return {
            state: this.state,
            nextSync: this.nextSync,
            prevError: error,
            prevTrigger: this.prevTrigger,
            timestamp: this.timestamp,
        };
    }
}