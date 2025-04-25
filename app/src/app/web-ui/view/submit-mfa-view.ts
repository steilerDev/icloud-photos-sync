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
                <input type="text" id="firstDigit" maxlength="1" size="1" pattern="[0-9]" required autofocus>
                <input type="text" id="secondDigit" maxlength="1" size="1" pattern="[0-9]" required>
                <input type="text" id="thirdDigit" maxlength="1" size="1" pattern="[0-9]" required>
                <input type="text" id="fourthDigit" maxlength="1" size="1" pattern="[0-9]" required>
                <input type="text" id="fifthDigit" maxlength="1" size="1" pattern="[0-9]" required>
                <input type="text" id="sixthDigit" maxlength="1" size="1" pattern="[0-9]" required>
            </div>
            <button id="submitButton" onclick="submitMfa()">Submit</button>
            <script>
                async function submitMfa() {
                    const mfaCode = Array.from(document
                        .querySelectorAll("#mfaInput input"))
                        .reduce((acc, input) => acc + input.value, "");
                    const response = await fetch("../mfa?code=" + mfaCode, {method: "POST"});
                    if (!response.ok) {
                        let body;
                        try { body = await response.json(); } catch (e) { }
                        alert("MFA submission failed: " + body?.message ?? response.statusText);
                        const newLocation = body?.newLocation;
                        if (newLocation) {
                            const newUrl = new URL(newLocation, window.location.origin);
                            window.location.href = newUrl;
                        }
                        return;
                    }
                    navigate("../");
                }
            </script>
            <button class="inverted" onclick="navigate('../request-mfa')">Resend Code/Change Method</button>
            <button class="inverted" onclick="navigate('..')">Cancel</button>
            <script type="text/javascript">
                const mfaInputs = document.querySelectorAll("#mfaInput input");
                mfaInputs.forEach((input, index) => {
                    input.addEventListener("input", (e) => {
                        if (e.target.value.length == 1) {
                            if(index < mfaInputs.length - 1) {
                                mfaInputs[index + 1].focus();
                            } else {
                                document.querySelector("#submitButton").focus();
                            }
                        }
                    });

                    input.addEventListener("keydown", (e) => {
                        if (e.key === "Backspace" && index > 0) {
                            mfaInputs[index - 1].focus();
                        }
                    });

                    input.addEventListener("focus", (e) => {
                        input.value = "";
                    });
                });

                document.querySelector("#mfaInput").addEventListener("paste", (e) => {
                    e.preventDefault();
                    const pasteData = e.clipboardData.getData("text/plain").slice(0, 6);
                    if (pasteData.length === 6 && /^[0-9]+$/.test(pasteData)) {
                        pasteData.split("").forEach((digit, index) => {
                            if (index < mfaInputs.length) {
                                mfaInputs[index].value = digit;
                            }
                        });
                        submitMfa();
                    } else {
                        alert("Please paste a 6-digit numeric code.");
                    }
                });
            </script>
        `;
    }
}