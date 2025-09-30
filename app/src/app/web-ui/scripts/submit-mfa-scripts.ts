/**
 * This script exposes the submitMfa() function and adds event listeners to the input to progress the cursor
 */
export const submitMfaScript = ` 
async function submitMfa() {
    document.querySelector("#submitButton").disabled = true
    document.querySelector("#submitButton").style['background-color'] = "rgb(147 157 179)"
    
    const mfaCode = Array.from(document
        .querySelectorAll("#mfaInput input"))
        .reduce((acc, input) => acc + input.value, "");
    try {
        const response = await fetch("/api/mfa?code=" + mfaCode, {method: "POST"});
        if (!response.ok) {
            const body = response.json()
            throw new Error(body?.message ?? response.statusText);
        }
    } catch (err) {
        alert("MFA submission failed: " + err.msg)
    }
    setTimeout(() => navigate("/state"), 2000);
}

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
`