export const logScript = (basePath: string) => `
// The currently selected log filter
let currentLogFilter = 'none';
// Stores the reference to the timeout for the log refresh loop
let currentLogLoop;
// Stores the paused state
let isPaused = true
// The number of log lines currently rendered
let renderedLogCount = 0
// The timestamp of the first rendered log line - used to detect a log reset on the server (e.g. upon a new sync)
let renderedLogStart;

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
    const filter = currentLogFilter
    const logs = await fetchLog()
    if(isPaused) {
        return
    }
    // Discarding responses for a filter that is no longer selected
    if(filter === currentLogFilter) {
        setLog(logs)
    }
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

// Function renders the provided log - only new log lines are appended, the view is rebuilt if the log on the server was reset
function setLog(log) {
    if(!log) {
        return
    }
    const logContent = document.getElementById('logContent');
    if(log.length === 0) {
        setLogPlaceholder('No logs to display')
        return
    }
    if(log.length < renderedLogCount || log[0].time !== renderedLogStart) {
        logContent.replaceChildren()
        renderedLogCount = 0
        renderedLogStart = log[0].time
    }
    if(log.length === renderedLogCount) {
        return
    }
    const newLines = document.createDocumentFragment()
    for (const logLine of log.slice(renderedLogCount)) {
        newLines.appendChild(addLogLine(logLine.level, logLine.source, logLine.message, logLine.time))
    }
    logContent.appendChild(newLines)
    renderedLogCount = log.length
    logContent.scrollTop = logContent.scrollHeight;
}

// Creates a single log line element
function addLogLine(level, source, message, time) {
    const logEntry = document.createElement('div');
    logEntry.className = 'log-entry';
    logEntry.dataset.level = level.toLowerCase();
    
    const logEntryTime = document.createElement('span');
    logEntryTime.className = 'log-timestamp';
    logEntryTime.textContent = formatDate(time);
    logEntry.appendChild(logEntryTime);

    const logLevel = document.createElement('span');
    logLevel.className = 'log-level ' + level;
    logLevel.textContent = level.toUpperCase();
    logEntry.appendChild(logLevel);

    const logSource = document.createElement('span');
    logSource.className = 'log-source';
    logSource.textContent = source
    logEntry.appendChild(logSource)

    const logMessage = document.createElement('span');
    logMessage.className = 'log-message';
    logMessage.textContent = message
    logEntry.appendChild(logMessage)
    
    return logEntry
}

// Replaces the log content with a loading indicator
function setLogLoading() {
    setLogPlaceholder('Loading logs...')
}

// Replaces the log content with a placeholder message
function setLogPlaceholder(text) {
    renderedLogCount = 0
    renderedLogStart = undefined
    document.getElementById('logContent').innerHTML = '<div style="color: #888; text-align: center; padding: 20px;">' + text + '</div>';
}
`