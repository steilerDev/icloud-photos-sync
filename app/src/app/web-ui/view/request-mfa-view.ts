import {Resources} from "../../../lib/resources/main.js";
import {TrustedPhoneNumber} from "../../../lib/resources/network-types.js";
import {requestMfaCSS, requestMfaCSSDark} from "../css/request-mfa-css.js";
import {requestMfaScript} from "../scripts/request-mfa-scripts.js";
import {View} from "./base.js";

export class RequestMfaView extends View {
    protected override get content(): string {
        const trustedPhoneNumbers = Array.isArray(Resources.state().trustedPhoneNumbers) && Resources.state().trustedPhoneNumbers.length > 0 ?
            Resources.state().trustedPhoneNumbers :
            [
                {
                    id: undefined,
                    numberWithDialCode: `Default`
                }
            ] as TrustedPhoneNumber[]
        return `
            <!-- Options are sms, voice, device -->
            <h2>Choose MFA Method</h2>

            <!-- Device button -->
            <button class="request-buttons" onclick="requestMfaWithMethod('device')" id="device-button">
                Send to My Devices
            </button>

            <!-- SMS button with expandable phone options -->
            <button class="request-buttons" onclick="togglePhoneOptions('sms')" id="sms-button">
                Send SMS
            </button>
            <div class="phone-options" id="sms-options">
                ${trustedPhoneNumbers.map((value => `
                    <div id="sms-option-${value.id}" class="request-buttons phone-option" onclick="requestMfaWithMethod('sms', ${value.id})">
                        <span class="phone-display">${value.numberWithDialCode}</span>
                    </div>
                `))}
            </div>

            <!-- Voice button with expandable phone options -->
            <button class="request-buttons" onclick="togglePhoneOptions('voice')" id="voice-button">
                Receive a Call
            </button>
            <div class="phone-options" id="voice-options">
                ${trustedPhoneNumbers.map((value => `
                    <div id="voice-option-${value.id}" class="request-buttons phone-option" onclick="requestMfaWithMethod('voice', ${value.id})">
                        <span class="phone-display">${value.numberWithDialCode}</span>
                    </div>
                `))}
            </div>

            <button class="inverted" onclick="navigate('${Resources.manager().webBasePath}/submit-mfa')" id="cancel-button">Cancel</button>
        `;
    }

    get scripts() {
        return [...super.scripts, requestMfaScript]
    }

    get css() {
        return [...super.css, requestMfaCSS]
    }

    get cssDark() {
        return [...super.cssDark, requestMfaCSSDark]
    }
}
