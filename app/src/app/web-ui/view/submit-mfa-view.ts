import {Resources} from "../../../lib/resources/main.js";
import {submitMfaCSS} from "../css/submit-mfa-css.js";
import {submitMfaScript} from "../scripts/submit-mfa-scripts.js";
import {View} from "./base.js";

export class SubmitMfaView extends View {
    protected override get content(): string {
        return `
            <h2>Enter MFA Code</h2>
            <div id="mfaInput">
                <input type="number" id="firstDigit" maxlength="1" size="1" pattern="[0-9]" required autofocus>
                <input type="number" id="secondDigit" maxlength="1" size="1" pattern="[0-9]" required>
                <input type="number" id="thirdDigit" maxlength="1" size="1" pattern="[0-9]" required>
                <input type="number" id="fourthDigit" maxlength="1" size="1" pattern="[0-9]" required>
                <input type="number" id="fifthDigit" maxlength="1" size="1" pattern="[0-9]" required>
                <input type="number" id="sixthDigit" maxlength="1" size="1" pattern="[0-9]" required>
            </div>
            <button id="submitButton" onclick="submitMfa()">Submit</button>
            <button id="resendButton" class="inverted" onclick="navigate('${Resources.manager().webBasePath}/request-mfa')">Resend Code/Change Method</button>
            <button id="cancelButton" class="inverted" onclick="navigate('${Resources.manager().webBasePath}/state')">Cancel</button>
        `;
    }

    get scripts() {
        return [...super.scripts, submitMfaScript]
    }

    get css() {
        return [...super.css, submitMfaCSS]
    }
}