import {View} from "./view.js";

export class RequestMfaView extends View {
    protected override get content(): string {
        return `
            <!-- Options are sms, voice, device -->
            <h2>Choose MFA Method</h2>
            <button onclick="requestMfaWithMethod('sms')">SMS</button>
            <button onclick="requestMfaWithMethod('voice')">Voice</button>
            <button onclick="requestMfaWithMethod('device')">Device</button>
            <script>
                async function requestMfaWithMethod(method) {
                    try {
                        const response = await fetch("../resend_mfa?method=" + method, {method: "POST"});
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
