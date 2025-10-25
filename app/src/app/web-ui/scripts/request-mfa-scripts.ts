/**
 * This script exposes the requestMfaWithMethod(method: string) function, which will send an API request to resend the MFA code
 */
export const requestMfaScript = (basePath: string) => `
// Track expanded state
const expandedStates = {
    sms: false,
    voice: false
};

function togglePhoneOptions(method) {
    const optionsDiv = document.getElementById(method + '-options');
    const button = document.getElementById(method + '-button');
    
    // If already expanded, send request with default number
    if (expandedStates[method]) {
        // Close the options
        button.classList.remove('expanded');
        optionsDiv.classList.remove('show');
        expandedStates[method] = false;
    } else {
        // Expand the options
        optionsDiv.classList.add('show');
        button.classList.add('expanded');
        expandedStates[method] = true;
    }
}

async function requestMfaWithMethod(method, id) {
    try {
        document.querySelectorAll('.request-buttons').forEach((el) => {
            el.disabled = true
            el.style['background-color'] = 'rgb(147 157 179)'
        });

        const url = id ?
            '${basePath}/api/resend_mfa?method=' + method + '&phoneNumberId=' + id :
            '${basePath}/api/resend_mfa?method=' + method

        const response = await fetch(url, {method: 'POST'});
        if (!response.ok) {
            throw new Error("MFA resend request failed: " + response.statusText);
        }
        navigate('${basePath}/submit-mfa');
    } catch (e) {
        alert('Failed to request MFA code: ' + e.message);
    }
    navigate('${basePath}/state');
}
`