export const stateViewCSS = `
.state-symbol {
    margin: 1rem;
    width: 35%;
    display: none;
    text-align: center;
    font-size: 7rem;
    color: orange;
}
.state-symbol svg {
    width: 100%;
    height: 100%;
}
#sync-symbol {
    animation: rotate 10s linear infinite;
}
@keyframes rotate {
    0% {
        transform: rotate(0deg);
    }
    100% {
        transform: rotate(360deg);
    }
}
#state-text {
    text-align: center;
    width: 75%;
    margin: auto;
    margin-top: 1rem;
    margin-bottom: 1rem;
}
#next-sync-text {
    text-align: center;
}
#enter-mfa-section {
    text-align: center;
    width: 90%;
    margin: auto;
    margin-bottom: 1rem;
    background-color: #d8d8d8;
    padding: 1rem;
    border-radius: 0.5rem;
    box-sizing: border-box;
}
#enter-mfa-section button {
    width: 100%;
}
`