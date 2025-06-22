import {logoBase64} from "../logo.js";

export abstract class View {
    public asHtml(): string {
        return `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <title>ICPS Web UI</title>
            <link rel="manifest" href="./manifest.json" />
            <script>
                if(navigator.serviceWorker) {
                    navigator.serviceWorker
                        .register("./service-worker.js", { scope: "./" })
                        .then(function () {
                            console.log("Service Worker Registered");
                        });
                } else {
                    console.warn("Service Worker not supported in this browser.");
                }

                function navigate(path) {
                    window.location.href = window.location.href + "/../" + path;
                }
            </script>
            <style>
                body {
                    font-family: Arial, sans-serif;
                    margin: 0;
                    padding: 0;
                    background-color: #f0f0f0;
                }
                .container {
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    height: 100vh;
                    overflow-y: scroll;
                    overflow-x: hidden;
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
                button {
                    width: 80%;
                    padding: 0.5rem;
                    background-color:rgb(66, 129, 255);
                    color: #fff;
                    border: none;
                    border-radius: 0.5rem;
                    cursor: pointer;
                    margin-top: 1rem;
                    font-size: 1rem;
                    box-sizing: border-box;
                }
                button.inverted {
                    background-color: #fff;
                    color: rgb(66, 129, 255);
                    border: 1px solid rgb(66, 129, 255);
                }
                input::-webkit-outer-spin-button,
                input::-webkit-inner-spin-button {
                    -webkit-appearance: none;
                    margin: 0;
                }
                input[type="number"] {
                    -moz-appearance: textfield;
                }

                @media only screen and (orientation: portrait) {
                    html {
                        font-size: 250%;
                    }
                }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="content">
                    <img src="data:image/png;base64,${logoBase64}" class="logo" alt="ICPS Logo">
                    <div class="innerContent">
                        ${this.content}
                    </div>
                </div>
            </div>
        </body>
        </html>
        `;
    }

    protected abstract get content(): string;
}
