export const darkCSS = `
@media (prefers-color-scheme: dark) {
    body {
        background-color: #1a1a1a;
        color: #e0e0e0;
    }

    .content {
        background-color: #2d2d2d;
        box-shadow: 0 0 1rem rgba(255, 255, 255, 0.1);
    }

    button {
        background-color: rgb(66, 129, 255);
        color: #fff;
    }

    button.inverted {
        background-color: #2d2d2d;
        color: rgb(66, 129, 255);
        border: 1px solid rgb(66, 129, 255);
    }

    #notificationButton {
        background-color: rgb(66, 129, 255);
        box-shadow: 0 0 0.5rem rgba(255, 255, 255, 0.2);
    }

    #enter-mfa-section {
        background-color: #3a3a3a;
    }

    /* Log Viewer Dark Mode */
    .log-viewer {
        background: #2d2d2d;
        box-shadow: 0 0 1rem rgba(255, 255, 255, 0.1);
    }

    .log-header {
        border-bottom: 1px solid #444;
    }

    .log-title {
        color: #e0e0e0;
    }

    .pause-btn {
        border: 1px solid #555;
        background: #3a3a3a;
        color: #e0e0e0;
    }

    .pause-btn:hover {
        border-color: #4281ff;
        background: #2d3a4d;
    }

    .pause-btn.paused {
        background: #4d3a1f;
        border-color: #f59e0b;
        color: #fde68a;
    }

    .pause-btn.paused:hover {
        background: #5c4625;
    }

    .filter-btn {
        border: 1px solid #555;
        background: #3a3a3a;
        color: #e0e0e0;
    }

    .filter-btn:hover {
        border-color: #4281ff;
        background: #2d3a4d;
    }

    .filter-btn:disabled {
        opacity: 0.4;
    }
    
    .filter-btn:disabled:hover {
        border-color: #555;
        background: #3a3a3a;
    }

    .filter-btn.active {
        border-color: transparent;
        color: #fff;
    }

    .log-count {
        background: #4281ff;
    }

    .expand-btn {
        color: #e0e0e0;
    }

    .log-content {
        background: #1a1a1a;
    }

    .log-entry:hover {
        background: #2d2d2d;
    }

    .log-source {
        color: #999;
    }

    .log-timestamp {
        color: #999;
    }

    .log-message {
        color: #e0e0e0;
    }

    .log-content::-webkit-scrollbar-track {
        background: #2d2d2d;
    }

    .log-content::-webkit-scrollbar-thumb {
        background: #555;
    }

    .log-content::-webkit-scrollbar-thumb:hover {
        background: #666;
    }

    #progress-container {
        border: 1px solid #555;
    }

    #state-text {
        color: #e0e0e0;
    }

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
}
`