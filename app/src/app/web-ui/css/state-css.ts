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
#running-symbol {
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

.progress-container {
    width: 80%;
    height: 0.5rem;
    background-color: #e0e0e0;
    border-radius: 0.25rem;
    overflow: hidden;
    margin: 1rem auto;
    display: block;
    position: relative;
}
.progress-bar {
    height: 100%;
    background-color: rgb(66, 129, 255);
    width: 0%;
    transition: width 0.3s ease;
    border-radius: 0.25rem;
}
.progress-bar.indeterminate {
    width: 30%;
    animation: indeterminate 1.5s ease-in-out infinite;
    transition: none;
}
@keyframes indeterminate {
    0% {
        transform: translateX(-100%);
    }
    100% {
        transform: translateX(400%);
    }
}
`

export const stateViewCSSDark = `
 #progress-container {
    border: 1px solid #555;
}

#state-text {
    color: #e0e0e0;
}
    
#enter-mfa-section {
    background-color: #3a3a3a;
}
`