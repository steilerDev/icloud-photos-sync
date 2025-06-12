import {View} from "./view.js";

export class RequestMfaView extends View {
    protected override get content(): string {
        return `
            <!-- Options are sms, voice, device -->
            <h2>Choose MFA Method</h2>
            <button onclick="requestMfaWithMethod('device')" id="device-button">Send to My Devices</button>
            <button onclick="requestMfaWithMethod('sms')" id="sms-button">Send SMS</button>
            <button onclick="requestMfaWithMethod('voice')" id="voice-button">Receive a Call</button>
            <script>
                async function requestMfaWithMethod(method) {
                    try {
                        const response = await fetch(baseUrl + "/../resend_mfa?method=" + method, {method: "POST"});
                        if (!response.ok) {
                            throw new Error("MFA trigger request failed: " + response.statusText);
                        }
                        navigate("../submit-mfa");
                    } catch (e) {
                        console.error(e);
                        alert("Failed to request MFA code: " + e.message);
                    }
                }
            </script>
            <button class="inverted" onclick="navigate('..')">Cancel</button>
        `;
    }
}
