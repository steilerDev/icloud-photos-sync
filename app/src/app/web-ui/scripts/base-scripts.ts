
/**
 * This script provides general helper functions:
 *  - navigate(path: string)
 */
export const navigationHelperScript = `
function navigate(path) {
    window.location.href = path;
}

function reload() {
    window.location.reload();
}
`