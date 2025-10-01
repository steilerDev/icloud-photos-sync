export const viewCSS = `
* {
    box-sizing: border-box;
}
html, body {
    height: 100%;
    margin: 0;
    padding: 0;
}
body {
    font-family: Arial, sans-serif;
    background-color: #f0f0f0;
    overflow-y: scroll;
    overflow-x: hidden;
}
.container {
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    min-height: 100%;
    flex-wrap: wrap;
    padding: 1rem;
}
.content {
    max-width: 26rem;
    background-color: #fff;
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

#notificationButton {
    max-width: 26rem;
    width: 100%;
    box-shadow: 0 0 0.5rem rgba(0, 0, 0, 0.2);
    display: none; /* Initially hidden */
    align-items: center;
    justify-content: center;
    padding: 1rem;
    margin-top: 0;
    margin-bottom: 1rem;
}

#notificationButton #bellIcon {
    width: 2rem;
    height: 2rem;
    margin-right: 0.5rem;
}
#notificationButton #bellIcon svg {
    width: 100%;
    height: 100%;
}
#notificationButton span {
    font-size: 1.2rem;
}
`