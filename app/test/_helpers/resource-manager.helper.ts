import * as CONFIG from './_config';

export const appOptions = {
    username: CONFIG.username,
    password: CONFIG.password,
    trustToken: ``,
    dataDir: CONFIG.appDataDir,
    port: 80,
    maxRetries: Infinity,
    downloadThreads: 5,
    schedule: `0 2 * * *`,
    enableCrashReporting: false,
    failOnMfa: false,
    force: false,
    refreshToken: false,
    remoteDelete: true,
    logLevel: `DEBUG`,
    silent: false,
    logToCli: false,
    suppressWarnings: false,
    exportMetrics: false,
    metadataRate: [Infinity, 0] as [number, number],
};