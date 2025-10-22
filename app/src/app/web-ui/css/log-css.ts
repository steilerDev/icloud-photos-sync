export const logCSS = `
.log-viewer {
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;

    border-top-left-radius: 1rem;
    border-top-right-radius: 1rem;
    box-shadow: 0 0 1rem rgba(0, 0, 0, 0.1);

    background: #f8f8f8;

    transition: height 0.3s ease;
    z-index: 1000;
}

.log-viewer.collapsed {
    height: 50px;
}

.log-viewer.expanded {
    height: 400px;
}

.log-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 12px 20px;
    border-bottom: 1px solid #d0d0d0;
}

.log-header-left {
    display: flex;
    align-items: center;
    gap: 15px;
    cursor: pointer;
    user-select: none;
}

.log-header-left:hover .log-title {
    opacity: 0.8;
}

.log-title {
    color: #1a1a1a;
    font-size: 14px;
    font-weight: 600;
    display: flex;
    align-items: center;
    gap: 10px;
}

.pause-btn {
    padding: 4px 10px;
    border: 1px solid #d0d0d0;
    background: #ffffff;
    color: #555;
    border-radius: 4px;
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s ease;
    display: flex;
    align-items: center;
    gap: 5px;
}

.pause-btn:hover {
    border-color: #007acc;
    background: #f0f8ff;
}

.pause-btn.paused {
    background: #fef3c7;
    border-color: #f59e0b;
    color: #92400e;
}

.pause-btn.paused:hover {
    background: #fde68a;
}

.log-viewer.collapsed .pause-btn {
    display: none;
}

.log-viewer.collapsed .pause-btn {
    display: none;             /* Hide when collapsed */
}

.filter-buttons {
    display: flex;
    gap: 8px;
    align-items: center;
}

.filter-btn {
    padding: 4px 10px;
    border: 1px solid #d0d0d0;
    background: #ffffff;
    color: #555;
    border-radius: 4px;
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s ease;
    text-transform: uppercase;
    letter-spacing: 0.5px;
}

.filter-btn[disabled] {
    opacity: 0.5;
    cursor: not-allowed;
    pointer-events: none;
}

.filter-btn[disabled]:hover {
    border-color: #d0d0d0;
    background: #ffffff;
}

.filter-btn:hover {
    border-color: #007acc;
    background: #f0f8ff;
}

.filter-btn.active {
    border-color: transparent;
    color: #fff;
}

.filter-btn.info.active {
    background: #008060;
}

.filter-btn.warning.active {
    background: #d97706;
}

.filter-btn.error.active {
    background: #dc2626;
}

.filter-btn.debug.active {
    background: #666;
}

.log-header-right {
    display: flex;
    align-items: center;
    gap: 10px;
}

.log-viewer.collapsed .filter-buttons {
    display: none;
}

.expand-btn {
    color: #1a1a1a;
    font-size: 18px;
    transition: transform 0.3s ease;
    cursor: pointer;
    user-select: none;
}

.expand-btn:hover {
    opacity: 0.7;
}

.log-viewer.expanded .expand-btn {
    transform: rotate(180deg);
}

.log-content {
    height: calc(100% - 50px);
    overflow-y: auto;
    padding: 15px 20px;
    font-family: 'Courier New', monospace;
    font-size: 13px;
    background: #ffffff;
}

.log-entry {
    padding: 6px 10px;
    margin-bottom: 4px;
    border-radius: 4px;
    display: flex;
    gap: 10px;
}

.log-entry:hover {
    background: #f5f5f5;
}

.log-source {
    color: #888;
}

.log-timestamp {
    color: #888;
    flex-shrink: 0;
}

.log-level {
    flex-shrink: 0;
    font-weight: bold;
    width: 50px;
}

.log-level.info {
    color: #008060;
}

.log-level.warning {
    color: #d97706;
}

.log-level.error {
    color: #dc2626;
}

.log-level.debug {
    color: #888;
}

.log-message {
    color: #1a1a1a;
    flex: 1;
}

.log-content::-webkit-scrollbar {
    width: 8px;
}

.log-content::-webkit-scrollbar-track {
    background: #f0f0f0;
}

.log-content::-webkit-scrollbar-thumb {
    background: #c0c0c0;
    border-radius: 4px;
}

.log-content::-webkit-scrollbar-thumb:hover {
    background: #a0a0a0;
}
`

export const logCSSDark = `
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
`