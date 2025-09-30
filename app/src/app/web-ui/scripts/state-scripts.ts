/**
 * This script exposes the triggerSync() and triggerReauth() functions.
 * Additionally the refreshState() function will be executed through an interval.
 */
export const stateViewScript = `
async function triggerSync() {
    const response = await fetch("/api/sync", { method: "POST" });
    if (!response.ok) {
        alert("Unable to trigger sync: " + response.statusText);
        return;
    }
    await refreshState()
}
async function triggerReauth() {
    const response = await fetch("/api/reauthenticate", { method: "POST" });
    if (!response.ok) {
        alert("Unable to trigger re-authentication: " + response.statusText);
        return;
    }
    await refreshState()
}

async function refreshState() {
    const state = await fetchState()
    resetState()
    updateState(state)
}

async function fetchState() {
    try{
        const fetchedState = await fetch("/api/state", { 
            headers: {
                "Accept": "application/json"
            }
        })

        if(!fetchedState.ok) {
            throw new Error('Response not ok!')
        }
        
        return fetchedState.json();
    } catch (err) {

        console.log(err)
        return {
            state: 'ready',
            prevError: {
                message: 'Connection lost, please refresh!',
                code: 'CLIENT_ERR-CONNECTION_LOST'
            },
            timestamp: Date.now()
        };
    }
}

function formatDate(date) {
    if (!date) {
        return "Unknown";
    }
    return new Date(date).toLocaleString()
}

function setStateText(text) {
    document.querySelector("#state-text").innerHTML = text
}

function enableSymbol(symbolName) {
    document.querySelector("#" + symbolName + "-symbol").style.display = "block";
}

/**
 * This function resets the state and hides all dynamic elements
 */
function resetState() {
    setStateText('...')
    document.querySelectorAll(".state-symbol").forEach((el) => {
        el.style.display = "none";
    });
    document.querySelectorAll(".hidden-when-not-ready").forEach((el) => {
        el.style.display = "none";
    });
}

/**
 * This function fetches the current app state and applies changes to the view
 * @param state - expects the json object form the API or undefined (will reload page on undefined)
 */
function updateState(state) {
    if(!state) {
        window.location.reload();
    }

    resetState()

    if(state.nextSync) {
        document.querySelector("#next-sync-time").innerHTML = formatDate(state.nextSync);
    }

    switch (state.state) {
        case 'ready':
            document.querySelectorAll(".hidden-when-not-ready").forEach((el) => {
                el.style.display = "block";
            });

            // If there was an error reported, show it
            if(state.prevError) {
                setStateText("Last " + (state.prevTrigger ?? "operation") + " failed at<br/>" +
                    formatDate(state.timestamp) + 
                    "<br/><br/>" +
                    "<span style='color: red; font-weight: bold'>" +
                        state.prevError.message +
                    "</span>"
                )
                enableSymbol('error')
                return
            } 

            enableSymbol('ok')

            if(!state.prevTrigger) {
                setStateText("Application ready")
                return
            }

            setStateText("Last " + (state.prevTrigger ?? "operation") + " successful at<br/>" +
                formatDate(state.timestamp) 
            )
            return;
        case 'authenticating':
            setStateText('Authenticating...')
            enableSymbol("auth")
            return;
        case 'mfa_required': 
            navigate('/submit-mfa')
            return;
        case 'syncing':
            setStateText('Syncing...')
            enableSymbol('sync')
            return;
        default:
            setStateText('Unknown')
            enableSymbol('unknown')
            return;
    }
}

// Kick off functions and timer to update state
setTimeout(() => refreshState(), 0);
setInterval(refreshState, 5000);
`