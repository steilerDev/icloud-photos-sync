import {logoBase64} from "../logo.js";

export abstract class View {
    public asHtml(): string {
        return `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <title>ICPS Web UI</title>
            <script>
                function navigate(path) {
                    if(window.location.pathname.endsWith("/")) {
                        window.location.href = window.location.pathname + path;
                        return;
                    }
                    window.location.href = window.location.pathname + "/" + path;
                }
            </script>
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
