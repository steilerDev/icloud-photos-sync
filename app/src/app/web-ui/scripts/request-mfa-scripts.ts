/**
 * This script exposes the requestMfaWithMethod(method: string) function, which will send an API request to resend the MFA code
 */
export const requestMfaScript = (basePath: string) => `
async function requestMfaWithMethod(method) {
    try {
        document.querySelectorAll('.request-buttons').forEach((el) => {
            el.disabled = true
            el.style['background-color'] = 'rgb(147 157 179)'
        });

        const response = await fetch('${basePath}/api/resend_mfa?method=' + method, {method: 'POST'});
        if (!response.ok) {
            throw new Error("MFA trigger request failed: " + response.statusText);
        }
        navigate('${basePath}/submit-mfa');
    } catch (e) {
        alert('Failed to request MFA code: ' + e.message);
    }
    navigate('${basePath}/state');
}
`