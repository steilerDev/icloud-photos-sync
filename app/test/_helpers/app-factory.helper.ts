export const rejectOptions = [
    {
        options: [
            `/usr/bin/node`,
            `/home/icloud-photos-sync/main.js`,
            `-u`,
            `test@icloud.com`,
            `-p`,
            `testPass`,
            `-P`,
            `eight`,
            `token`,
        ],
        _desc: `Invalid port`,
        expected: `error: option '-P, --port <number>' argument 'eight' is invalid. Not a number.`,
    }, {
        options: [
            `/usr/bin/node`,
            `/home/icloud-photos-sync/main.js`,
            `-u`,
            `test@icloud.com`,
            `-p`,
            `testPass`,
            `-P`,
            `-5`,
            `token`,
        ],
        _desc: `Negative port`,
        expected: `error: option '-P, --port <number>' argument '-5' is invalid. Not a positive number.`,
    }, {
        options: [
            `/usr/bin/node`,
            `/home/icloud-photos-sync/main.js`,
            `-u`,
            `test@icloud.com`,
            `-p`,
            `testPass`,
            `-l`,
            `superInfo`,
            `token`,
        ],
        _desc: `Invalid log level`,
        expected: `error: option '-l, --log-level <level>' argument 'superInfo' is invalid. Allowed choices are debug, info, warn, error.`,
    }, {
        options: [
            `/usr/bin/node`,
            `/home/icloud-photos-sync/main.js`,
            `-u`,
            `test@icloud.com`,
            `-p`,
            `testPass`,
            `-t`,
            `five`,
            `token`,
        ],
        _desc: `Invalid download threads`,
        expected: `error: option '-t, --download-threads <number>' argument 'five' is invalid. Not a number.`,
    }, {
        options: [
            `/usr/bin/node`,
            `/home/icloud-photos-sync/main.js`,
            `-u`,
            `test@icloud.com`,
            `-p`,
            `testPass`,
            `-t`,
            `-1`,
            `token`,
        ],
        _desc: `Negative download threads`,
        expected: `error: option '-t, --download-threads <number>' argument '-1' is invalid. Not a positive number.`,
    }, {
        options: [
            `/usr/bin/node`,
            `/home/icloud-photos-sync/main.js`,
            `-u`,
            `test@icloud.com`,
            `-p`,
            `testPass`,
            `--download-timeout`,
            `eight`,
            `token`,
        ],
        _desc: `Invalid download timeout`,
        expected: `error: option '--download-timeout <number>' argument 'eight' is invalid. Not a number.`,
    }, {
        options: [
            `/usr/bin/node`,
            `/home/icloud-photos-sync/main.js`,
            `-u`,
            `test@icloud.com`,
            `-p`,
            `testPass`,
            `--download-timeout`,
            `-5`,
            `token`,
        ],
        _desc: `Negative download timeout`,
        expected: `error: option '--download-timeout <number>' argument '-5' is invalid. Not a positive number.`,
    }, {
        options: [
            `/usr/bin/node`,
            `/home/icloud-photos-sync/main.js`,
            `-u`,
            `test@icloud.com`,
            `-r`,
            `inf`,
            `token`,
        ],
        _desc: `Invalid retries`,
        expected: `error: option '-r, --max-retries <number>' argument 'inf' is invalid. Not a number.`,
    }, {
        options: [
            `/usr/bin/node`,
            `/home/icloud-photos-sync/main.js`,
            `-u`,
            `test@icloud.com`,
            `-p`,
            `testPass`,
            `-r`,
            `-5`,
            `token`,
        ],
        _desc: `Negative retries`,
        expected: `error: option '-r, --max-retries <number>' argument '-5' is invalid. Not a positive number.`,
    }, {
        options: [
            `/usr/bin/node`,
            `/home/icloud-photos-sync/main.js`,
            `-u`,
            `test@icloud.com`,
            `-p`,
            `testPass`,
            `--metadata-rate`,
            `1s`,
            `token`,
        ],
        _desc: `Invalid metadata rate format`,
        expected: `error: option '--metadata-rate <interval>' argument '1s' is invalid. Not a valid interval pattern. Expects the format '<numberOfRequests|Infinity>/<timeInMs>', e.g. '1/20' to limit requests to one in 20ms.`,
    }, {
        options: [
            `/usr/bin/node`,
            `/home/icloud-photos-sync/main.js`,
            `-u`,
            `test@icloud.com`,
            `-p`,
            `testPass`,
            `--metadata-rate`,
            `1/Infinity`,
            `token`,
        ],
        _desc: `Invalid metadata rate - Infinite times`,
        expected: `error: option '--metadata-rate <interval>' argument '1/Infinity' is invalid. Not a valid interval pattern. Expects the format '<numberOfRequests|Infinity>/<timeInMs>', e.g. '1/20' to limit requests to one in 20ms.`,
    }, {
        options: [
            `/usr/bin/node`,
            `/home/icloud-photos-sync/main.js`,
            `-u`,
            `test@icloud.com`,
            `-p`,
            `testPass`,
            `--metadata-rate`,
            `0/20`,
            `token`,
        ],
        _desc: `Invalid metadata rate - No runs`,
        expected: `error: option '--metadata-rate <interval>' argument '0/20' is invalid. Not a valid interval. Number of runs needs to be >0.`,
    }, {
        options: [
            `/usr/bin/node`,
            `/home/icloud-photos-sync/main.js`,
            `-u`,
            `test@icloud.com`,
            `-p`,
            `testPass`,
            `archive`,
        ],
        _desc: `Missing archive path`,
        expected: `error: missing required argument 'path'`,
    }, {
        options: [
            `/usr/bin/node`,
            `/home/icloud-photos-sync/main.js`,
            `-u`,
            `test@icloud.com`,
            `-p`,
            `testPass`,
            `--schedule`,
            `asdf`,
            `daemon`,
        ],
        _desc: `Mis-formatted schedule`,
        expected: `error: option '-S, --schedule <cron-string>' argument 'asdf' is invalid. Not a valid cron pattern. See https://crontab.guru (or for more information on the underlying implementation https://github.com/hexagon/croner#pattern).`,
    }, {
        options: [
            `/usr/bin/node`,
            `/home/icloud-photos-sync/main.js`,
            `-u`,
            `test@icloud.com`,
            `-p`,
            `testPass`,
            `--health-check-url`,
            `asdf`,
        ],
        _desc: `Mis-formatted healthcheck ping URL`,
        expected: `error: option '--health-check-url <url>' argument 'asdf' is invalid. Not a valid URL: TypeError: Invalid URL`,
    },
];

export const nonRejectOptions = [
    {
        options: [
            `/usr/bin/node`,
            `/home/icloud-photos-sync/main.js`,
            `-u`,
            `test@icloud.com`,
            `-p`,
            `testPass`,
        ],
        _desc: `Default options`,
        expectedOptions: {},
    }, {
        options: [
            `/usr/bin/node`,
            `/home/icloud-photos-sync/main.js`,
            `-u`,
            `test@icloud.com`,
            `-p`,
            `testPass`,
            `-T`,
            `some-trust-token`,
        ],
        _desc: `Trust token set`,
        expectedOptions: {
            trustToken: `some-trust-token`,
        },
    }, {
        options: [
            `/usr/bin/node`,
            `/home/icloud-photos-sync/main.js`,
            `-u`,
            `test@icloud.com`,
            `-p`,
            `testPass`,
            `-d`,
            `/some/data/dir`,
        ],
        _desc: `Data dir set`,
        expectedOptions: {
            dataDir: `/some/data/dir`,
        },
    }, {
        options: [
            `/usr/bin/node`,
            `/home/icloud-photos-sync/main.js`,
            `-u`,
            `test@icloud.com`,
            `-p`,
            `testPass`,
            `-P`,
            `8080`,
        ],
        _desc: `Port set`,
        expectedOptions: {
            port: 8080,
        },
    }, {
        options: [
            `/usr/bin/node`,
            `/home/icloud-photos-sync/main.js`,
            `-u`,
            `test@icloud.com`,
            `-p`,
            `testPass`,
            `-r`,
            `50`,
        ],
        _desc: `Max retries set to number`,
        expectedOptions: {
            maxRetries: 50,
        },
    }, {
        options: [
            `/usr/bin/node`,
            `/home/icloud-photos-sync/main.js`,
            `-u`,
            `test@icloud.com`,
            `-p`,
            `testPass`,
            `-r`,
            `Infinity`,
        ],
        _desc: `Max retries set to Infinity`,
        expectedOptions: {
            maxRetries: Infinity,
        },
    }, {
        options: [
            `/usr/bin/node`,
            `/home/icloud-photos-sync/main.js`,
            `-u`,
            `test@icloud.com`,
            `-p`,
            `testPass`,
            `-t`,
            `50`,
        ],
        _desc: `Download threads set to number`,
        expectedOptions: {
            downloadThreads: 50,
        },
    }, {
        options: [
            `/usr/bin/node`,
            `/home/icloud-photos-sync/main.js`,
            `-u`,
            `test@icloud.com`,
            `-p`,
            `testPass`,
            `-t`,
            `Infinity`,
        ],
        _desc: `Download threads set to Infinity`,
        expectedOptions: {
            downloadThreads: Infinity,
        },
    }, {
        options: [
            `/usr/bin/node`,
            `/home/icloud-photos-sync/main.js`,
            `-u`,
            `test@icloud.com`,
            `-p`,
            `testPass`,
            `--download-timeout`,
            `10`,
        ],
        _desc: `Download timeout set to 10`,
        expectedOptions: {
            downloadTimeout: 10,
        },
    }, {
        options: [
            `/usr/bin/node`,
            `/home/icloud-photos-sync/main.js`,
            `-u`,
            `test@icloud.com`,
            `-p`,
            `testPass`,
            `--download-timeout`,
            `Infinity`,

        ],
        _desc: `Download timeout set to Infinity`,
        expectedOptions: {
            downloadTimeout: Infinity,
        },
    }, {
        options: [
            `/usr/bin/node`,
            `/home/icloud-photos-sync/main.js`,
            `-u`,
            `test@icloud.com`,
            `-p`,
            `testPass`,
            `-S`,
            `0 1 10 * *`,
        ],
        _desc: `Schedule set`,
        expectedOptions: {
            schedule: `0 1 10 * *`,
        },
    }, {
        options: [
            `/usr/bin/node`,
            `/home/icloud-photos-sync/main.js`,
            `-u`,
            `test@icloud.com`,
            `-p`,
            `testPass`,
            `--enable-crash-reporting`,
        ],
        _desc: `Crash reporting enabled`,
        expectedOptions: {
            enableCrashReporting: true,
        },
    }, {
        options: [
            `/usr/bin/node`,
            `/home/icloud-photos-sync/main.js`,
            `-u`,
            `test@icloud.com`,
            `-p`,
            `testPass`,
            `--fail-on-mfa`,
        ],
        _desc: `Fail on MFA enabled`,
        expectedOptions: {
            failOnMfa: true,
        },
    }, {
        options: [
            `/usr/bin/node`,
            `/home/icloud-photos-sync/main.js`,
            `-u`,
            `test@icloud.com`,
            `-p`,
            `testPass`,
            `--force`,
        ],
        _desc: `Force enabled`,
        expectedOptions: {
            force: true,
        },
    }, {
        options: [
            `/usr/bin/node`,
            `/home/icloud-photos-sync/main.js`,
            `-u`,
            `test@icloud.com`,
            `-p`,
            `testPass`,
            `--refresh-token`,
        ],
        _desc: `Refresh token enabled`,
        expectedOptions: {
            refreshToken: true,
        },
    }, {
        options: [
            `/usr/bin/node`,
            `/home/icloud-photos-sync/main.js`,
            `-u`,
            `test@icloud.com`,
            `-p`,
            `testPass`,
            `--remote-delete`,
        ],
        _desc: `Remote delete enabled`,
        expectedOptions: {
            remoteDelete: true,
        },
    }, {
        options: [
            `/usr/bin/node`,
            `/home/icloud-photos-sync/main.js`,
            `-u`,
            `test@icloud.com`,
            `-p`,
            `testPass`,
            `--log-level`,
            `warn`,
        ],
        _desc: `Log level set to warn`,
        expectedOptions: {
            logLevel: `warn`,
        },
    }, {
        options: [
            `/usr/bin/node`,
            `/home/icloud-photos-sync/main.js`,
            `-u`,
            `test@icloud.com`,
            `-p`,
            `testPass`,
            `--silent`,
        ],
        _desc: `Silent enabled`,
        expectedOptions: {
            silent: true,
        },
    }, {
        options: [
            `/usr/bin/node`,
            `/home/icloud-photos-sync/main.js`,
            `-u`,
            `test@icloud.com`,
            `-p`,
            `testPass`,
            `--log-to-cli`,
        ],
        _desc: `Log to cli enabled`,
        expectedOptions: {
            logToCli: true,
        },
    }, {
        options: [
            `/usr/bin/node`,
            `/home/icloud-photos-sync/main.js`,
            `-u`,
            `test@icloud.com`,
            `-p`,
            `testPass`,
            `--suppress-warnings`,
        ],
        _desc: `Suppress warnings enabled`,
        expectedOptions: {
            suppressWarnings: true,
        },
    }, {
        options: [
            `/usr/bin/node`,
            `/home/icloud-photos-sync/main.js`,
            `-u`,
            `test@icloud.com`,
            `-p`,
            `testPass`,
            `--export-metrics`,
        ],
        _desc: `Export metrics enabled`,
        expectedOptions: {
            exportMetrics: true,
        },
    }, {
        options: [
            `/usr/bin/node`,
            `/home/icloud-photos-sync/main.js`,
            `-u`,
            `test@icloud.com`,
            `-p`,
            `testPass`,
            `--metadata-rate`,
            `5/10`,
        ],
        _desc: `Metadata rate enabled`,
        expectedOptions: {
            metadataRate: [5, 10],
        },
    }, {
        options: [
            `/usr/bin/node`,
            `/home/icloud-photos-sync/main.js`,
            `-u`,
            `test@icloud.com`,
            `-p`,
            `testPass`,
            `--enable-network-capture`,
        ],
        _desc: `Network capture enabled`,
        expectedOptions: {
            enableNetworkCapture: true,
        },
    }, {
        options: [
            `/usr/bin/node`,
            `/home/icloud-photos-sync/main.js`,
            `-u`,
            `test@icloud.com`,
            `-p`,
            `testPass`,
            `--legacy-login`,
        ],
        _desc: `Legacy login enabled`,
        expectedOptions: {
            legacyLogin: true,
        },
    }, {
        options: [
            `/usr/bin/node`,
            `/home/icloud-photos-sync/main.js`,
            `-u`,
            `test@icloud.com`,
            `-p`,
            `testPass`,
            `--health-check-url`,
            `https://some.url/healthcheck-slug`,
        ],
        _desc: `Healthcheck ping URL set`,
        expectedOptions: {
            healthCheckUrl: `https://some.url/healthcheck-slug`,
        },
    },
];

export const validOptions = {
    token: [
        `/usr/bin/node`,
        `/home/icloud-photos-sync/main.js`,
        `-u`,
        `test@icloud.com`,
        `-p`,
        `testPass`,
        `token`,
    ],
    tokenWithForce: [
        `/usr/bin/node`,
        `/home/icloud-photos-sync/main.js`,
        `-u`,
        `test@icloud.com`,
        `-p`,
        `testPass`,
        `--force`,
        `token`,
    ],
    sync: [
        `/usr/bin/node`,
        `/home/icloud-photos-sync/main.js`,
        `-u`,
        `test@icloud.com`,
        `-p`,
        `testPass`,
        `sync`,
    ],
    archive: [
        `/usr/bin/node`,
        `/home/icloud-photos-sync/main.js`,
        `-u`,
        `test@icloud.com`,
        `-p`,
        `password`,
        `archive`,
        `/root/someTestDir/`,
    ],
    daemon: [
        `/usr/bin/node`,
        `/home/icloud-photos-sync/main.js`,
        `-u`,
        `test@icloud.com`,
        `-p`,
        `password`,
        `daemon`,
    ],
};