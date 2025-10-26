export const submitMfaCSS = `
div#mfaInput {
    display: flex;
    justify-content: space-between;
    width: 80%;
    margin: 1rem 0;
}
div#mfaInput input {
    box-sizing: border-box;
    font-size: 2.5rem;
    width: 15%;
    padding: 0.5rem;
    margin-top: 1rem;
    border-radius: 0.5rem;
    border: 1px solid #ccc;
    text-align: center;

    // no up/down arrows in number inputs
    -webkit-appearance: none;
    -moz-appearance: textfield;
}
`

export const submitMfaCSSDark = `
div#mfaInput input {
    background-color: #3a3a3a;
    color: #e0e0e0;
    border: 1px solid #555;
}

div#mfaInput input:focus {
    border-color: #4281ff;
    outline: none;
    background-color: #2d2d2d;
}
`