import {View} from "./view.js";

export class SubmitMfaView extends View {
    protected override get content(): string {
        return `
            <style>
                div#mfaInput {
                    display: flex;
                    justify-content: space-between;
                    width: 80%;
                    margin: 1rem 0;
                }
                div#mfaInput input {
                    box-sizing: border-box;
                    font-size: xxx-large;
                    width: 15%;
                    padding: 0.5rem;
                    margin-top: 1rem;
                    border-radius: 0.5rem;
                    border: 1px solid #ccc;
                    text-align: center;
                }
            </style>
            <h2>Enter MFA Code</h2>
            <div id="mfaInput">
            <input type="text" id="firstDigit" maxlength="1" size="1" pattern="[0-9]" required>
            <input type="text" id="secondDigit" maxlength="1" size="1" pattern="[0-9]" required>
            <input type="text" id="thirdDigit" maxlength="1" size="1" pattern="[0-9]" required>
            <input type="text" id="fourthDigit" maxlength="1" size="1" pattern="[0-9]" required>
            <input type="text" id="fifthDigit" maxlength="1" size="1" pattern="[0-9]" required>
            <input type="text" id="sixthDigit" maxlength="1" size="1" pattern="[0-9]" required>
            </div>
            <button onclick="submitMfa()">Submit</button>
            <script>
                async function submitMfa() {
                    const mfaCode = document
                        .querySelectorAll("#mfaInput input")
                        .reduce((acc, input) => acc + input.value, "");
                    const response = await fetch("../mfa?code=" + mfaCode, {method: "POST"});
                    if (!response.ok) {
                        alert("MFA submission failed: " + response.statusText);
                        return;
                    }
                    navigate("../state");
                }
            </script>
            <button class="inverted" onclick="navigate('../request-mfa')">Resend Code</button>
            <button class="inverted" onclick="navigate('..')">Cancel</button>
            <script type="text/javascript">
                const mfaInputs = document.querySelectorAll("#mfaInput input");
                mfaInputs.forEach((input, index) => {
                    input.addEventListener("input", (e) => {
                        if (e.target.value.length == 0) {
                            return;
                        }
                        if (index === mfaInputs.length - 1) {
                            return
                        }
                        mfaInputs[index + 1].focus();
                    });
                });
            </script>
        `;
    }
}