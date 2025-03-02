export const checkSymbol = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" version="1.1" id="Layer_1" x="0px" y="0px" width="122.88px" height="122.88px" viewBox="0 0 122.88 122.88" enable-background="new 0 0 122.88 122.88" xml:space="preserve"><g><path fill="#6BBE66" d="M34.388,67.984c-0.286-0.308-0.542-0.638-0.762-0.981c-0.221-0.345-0.414-0.714-0.573-1.097 c-0.531-1.265-0.675-2.631-0.451-3.934c0.224-1.294,0.812-2.531,1.744-3.548l0.34-0.35c2.293-2.185,5.771-2.592,8.499-0.951 c0.39,0.233,0.762,0.51,1.109,0.827l0.034,0.031c1.931,1.852,5.198,4.881,7.343,6.79l1.841,1.651l22.532-23.635 c0.317-0.327,0.666-0.62,1.035-0.876c0.378-0.261,0.775-0.482,1.185-0.661c0.414-0.181,0.852-0.323,1.3-0.421 c0.447-0.099,0.903-0.155,1.356-0.165h0.026c0.451-0.005,0.893,0.027,1.341,0.103c0.437,0.074,0.876,0.193,1.333,0.369 c0.421,0.161,0.825,0.363,1.207,0.604c0.365,0.231,0.721,0.506,1.056,0.822l0.162,0.147c0.316,0.313,0.601,0.653,0.85,1.014 c0.256,0.369,0.475,0.766,0.652,1.178c0.183,0.414,0.325,0.852,0.424,1.299c0.1,0.439,0.154,0.895,0.165,1.36v0.23 c-0.004,0.399-0.042,0.804-0.114,1.204c-0.079,0.435-0.198,0.863-0.356,1.271c-0.16,0.418-0.365,0.825-0.607,1.21 c-0.238,0.377-0.518,0.739-0.832,1.07l-27.219,28.56c-0.32,0.342-0.663,0.642-1.022,0.898c-0.369,0.264-0.767,0.491-1.183,0.681 c-0.417,0.188-0.851,0.337-1.288,0.44c-0.435,0.104-0.889,0.166-1.35,0.187l-0.125,0.003c-0.423,0.009-0.84-0.016-1.241-0.078 l-0.102-0.02c-0.415-0.07-0.819-0.174-1.205-0.31c-0.421-0.15-0.833-0.343-1.226-0.575l-0.063-0.04 c-0.371-0.224-0.717-0.477-1.032-0.754l-0.063-0.06c-1.58-1.466-3.297-2.958-5.033-4.466c-3.007-2.613-7.178-6.382-9.678-9.02 L34.388,67.984L34.388,67.984z M61.44,0c16.96,0,32.328,6.883,43.453,17.987c11.104,11.125,17.986,26.493,17.986,43.453 c0,16.961-6.883,32.329-17.986,43.454C93.769,115.998,78.4,122.88,61.44,122.88c-16.961,0-32.329-6.882-43.454-17.986 C6.882,93.769,0,78.4,0,61.439C0,44.48,6.882,29.112,17.986,17.987C29.112,6.883,44.479,0,61.44,0L61.44,0z M96.899,25.981 C87.826,16.907,75.29,11.296,61.44,11.296c-13.851,0-26.387,5.611-35.46,14.685c-9.073,9.073-14.684,21.609-14.684,35.458 c0,13.851,5.611,26.387,14.684,35.46s21.609,14.685,35.46,14.685c13.85,0,26.386-5.611,35.459-14.685s14.684-21.609,14.684-35.46 C111.583,47.59,105.973,35.054,96.899,25.981L96.899,25.981z"/></g></svg>`;

export const webUi = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>ICPS Web UI</title>
    <style>
        body {
            font-family: Arial, sans-serif;
            margin: 0;
            padding: 0;
            background-color: #f0f0f0;
            font-size: large;
        }
        .container {
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            overflow-y: scroll;
            flex-wrap: wrap;
        }
        .content {
            background-color: #fff;
            width: 26rem;
            margin: 1rem;
            overflow: hidden;
            border-radius: 1rem;
            box-shadow: 0 0 1rem rgba(0, 0, 0, 0.1);
        }
        .logo {
            width: 100%;
            margin: 0 auto;
        }
        .innerContent {
            padding: 2rem 1rem;
            display: flex;
            flex-direction: column;
            align-items: center;
        }
        .info {
            width: 100%;
            border-collapse: collapse;
        }
        .info tr td {
            padding-bottom: 1rem;
        }
        .info tr td:last-child {
            text-align: right;
        }
        .state-symbol {
            margin: 1rem;
            width: 35%;
        }
        .state-symbol svg {
            width: 100%;
            height: 100%;
        }
        .state-text {
            text-align: center;
            width: 75%;
            margin: auto;
            margin-bottom: 1rem;
        }
        button {
            width: 80%;
            padding: 0.5rem;
            background-color:rgb(66, 129, 255);
            color: #fff;
            border: none;
            border-radius: 0.5rem;
            cursor: pointer;
            margin-top: 1rem;
            font-size: large;
            box-sizing: border-box;
        }
        button.inverted {
            background-color: #fff;
            color: rgb(66, 129, 255);
            border: 1px solid rgb(66, 129, 255);
        }
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
</head>
<body>
    <div class="container">
        <div class="content">
            <img src="https://icps.steiler.dev/assets/icloud-photos-sync-open-graph.png" class="logo" alt="ICPS Logo">
            <div class="innerContent" style="display: none">
                <br/>
                <div class="state-symbol">${checkSymbol}</div>
                <p class="state-text">
                    Last Sync Successful<br>
                    Sunday, 12th September 2021<br>
                    Synced 12 photos
                </p>
                <br/>
                <button>Sync Now</button>
            </div>
            <div class="innerContent">
                <label for="mfaCode">Enter MFA Code</label>
                <div id="mfaInput">
                <input type="text" id="firstDigit" maxlength="1" size="1" pattern="[0-9]" required>
                <input type="text" id="secondDigit" maxlength="1" size="1" pattern="[0-9]" required>
                <input type="text" id="thirdDigit" maxlength="1" size="1" pattern="[0-9]" required>
                <input type="text" id="fourthDigit" maxlength="1" size="1" pattern="[0-9]" required>
                <input type="text" id="fifthDigit" maxlength="1" size="1" pattern="[0-9]" required>
                <input type="text" id="sixthDigit" maxlength="1" size="1" pattern="[0-9]" required>
                </div>
                <button>Submit</button>
                <button class="inverted">Resend Code</button>
                <button class="inverted">Cancel</button>
                <script type="text/javascript">
                    console.log("Setting up event listeners.")
                    const mfaInputs = document.querySelectorAll("#mfaInput input");
                    mfaInputs.forEach((input, index) => {
                        input.addEventListener("keyup", (e) => {
                            console.log("Key pressed: ", e.key);
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
            </div>
        </div>
    </div>
</body>
</html>
`;