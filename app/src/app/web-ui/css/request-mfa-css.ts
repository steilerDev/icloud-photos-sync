export const requestMfaCSS = `
button.expanded {
    border-bottom-left-radius: 0;
    border-bottom-right-radius: 0;
    transform: none;
}

button.expanded:hover {
    transform: none;
}

.phone-options {
    max-height: 0;
    width: 80%;
    overflow: hidden;
    transition: max-height 0.3s ease;
    background-color: #f8f9fa;
    border: 2px solid rgb(66, 129, 255);
    border-top: none;
    border-bottom-left-radius: 0.5rem;
    border-bottom-right-radius: 0.5rem;
    margin-top: -2px;
    opacity: 0;
    transition: max-height 0.3s ease, opacity 0.3s ease;
}

.phone-options.show {
    max-height: 200px;
    opacity: 1;
    width: 80%;
}

.phone-option {
    padding: 0.75rem 1rem;
    cursor: pointer;
    transition: background-color 0.2s ease;
    border-bottom: 1px solid #dee2e6;
    display: flex;
    align-items: center;
    justify-content: space-between;
}

.phone-option:last-child {
    border-bottom: none;
}

.phone-option:hover {
    background-color: #e3f2fd;
}

.phone-option.default {
    background-color: #f0f7ff;
}

.phone-display {
    color: #333;
    font-size: 0.95rem;
}
`

export const requestMfaCSSDark = `
.phone-options {
    background-color: #3a3a3a;
    border-color: rgb(66, 129, 255);
}

.phone-option {
    border-bottom-color: #555;
}

.phone-option:hover {
    background-color: #1e3a5f;
}

.phone-display {
    color: #e0e0e0;
}
`