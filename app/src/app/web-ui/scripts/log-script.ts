export const logScript = (basePath: string) => `
// The currently selected log filter
let currentLogFilter = 'none';
// Stores the reference to the timeout for the log refresh loop
let currentLogLoop;
// Stores the paused state
let isPaused = true

// Listener for the pause button - will toggle the pause button UI and stop or continue the log refresh loop
function togglePause() {
    isPaused = !isPaused;
    const pauseBtn = document.getElementById('pauseBtn');
    const pauseIcon = document.getElementById('pauseIcon');
    const pauseText = document.getElementById('pauseText');
    
    if (isPaused) {
        pauseBtn.classList.add('paused');
        pauseIcon.textContent = '▶';
        pauseText.textContent = 'Resume';

        document.querySelectorAll('.filter-btn').forEach(btn => {
            btn.setAttribute('disabled', 'disabled');;
        });

        // Stop auto-refresh
        clearTimeout(currentLogLoop);
    } else {
        pauseBtn.classList.remove('paused');
        pauseIcon.textContent = '⏸';
        pauseText.textContent = 'Pause';

        document.querySelectorAll('.filter-btn').forEach(btn => {
            btn.removeAttribute('disabled');;
        });

        // Resume auto-refresh
        setLogLoading()
        refreshLog();
    }
}

// Listener for the Toggle Log button
function toggleLog() {
    const viewer = document.getElementById('logViewer');
    viewer.classList.toggle('collapsed');
    let visible = viewer.classList.toggle('expanded');
    if(visible) {
        document.getElementById('logContent').style.display = "block"
        currentLogFilter = 'info'
        isPaused = false
        setLogLoading()
        refreshLog()
    } else {
        document.getElementById('logContent').style.display = "none"
        currentLogFilter = 'none'
        isPaused = true
        clearTimeout(currentLogLoop)
    }
}

// This function refreshes the log by fetching it from the server and updating the DOM
async function refreshLog() {
    const logs = await fetchLog()
    setLog(logs)
    currentLogLoop = setTimeout(() => refreshLog(), 500);
}

// This function returns the fetched log from the server
async function fetchLog() {
    try{
        const fetchedState = await fetch("${basePath}/api/log?loglevel=" + currentLogFilter, { 
            headers: {
                "Accept": "application/json"
            }
        })

        if(!fetchedState.ok) {
            throw new Error('Response not ok!')
        }
        
        return fetchedState.json();
    } catch (err) {
        return [{
            level: 'error',
            time: Date.now(),
            source: "",
            message: "Unable to fetch logs: " + err.message
        }];
    }
}

// Listener for the filter buttons
function selectFilter(level) {
    
    // Remove active class from all buttons
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    
    // Add active class to clicked button
    event.target.classList.add('active');
    
    // Update current filter and reload logs from server
    currentLogFilter = level;
    setLogLoading()
}

// Function removes all logs from screen and puts new log lines onto the screen
function setLog(log) {
    if(!log) {
        return
    }
    if(log.length === 0) {
        document.getElementById('logContent').innerHTML = '<div style="color: #888; text-align: center; padding: 20px;">No logs to display</div>';
        return
    }
    document.getElementById('logContent').innerHTML = '';
    for (const logLine of log) {
        addLogLine(logLine.level, logLine.source, logLine.message, logLine.time)
    }
}

// Adds a single log line to the screen
function addLogLine(level, source, message, time) {
    const logContent = document.getElementById('logContent');
    
    const logEntry = document.createElement('div');
    logEntry.className = 'log-entry';
    logEntry.dataset.level = level.toLowerCase();
    
    const logEntryTime = document.createElement('span');
    logEntryTime.className = 'log-timestamp';
    logEntryTime.innerHTML = formatDate(time);
    logEntry.appendChild(logEntryTime);

    const logLevel = document.createElement('span');
    logLevel.className = 'log-level ' + level;
    logLevel.innerHTML = level.toUpperCase();
    logEntry.appendChild(logLevel);

    const logSource = document.createElement('span');
    logSource.className = 'log-source';
    logSource.innerHTML = source
    logEntry.appendChild(logSource)

    const logMessage = document.createElement('span');
    logMessage.className = 'log-message';
    logMessage.innerHTML = message
    logEntry.appendChild(logMessage)
    
    logContent.appendChild(logEntry);
    logContent.scrollTop = logContent.scrollHeight;
}

// Replaces the log content with a loading indicator
function setLogLoading() {
    document.getElementById('logContent').innerHTML = '<div style="color: #888; text-align: center; padding: 20px;">Loading logs...</div>';
}
`