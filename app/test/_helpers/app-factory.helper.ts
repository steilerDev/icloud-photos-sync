import EventEmitter from "events";
import { EventHandler } from "../../src/app/event/event-handler";
import {iCloudApp} from "../../src/app/icloud-app";
import {iCloud} from "../../src/lib/icloud/icloud";
import {PhotosLibrary} from "../../src/lib/photos-library/photos-library";
import { spyOnEvent } from "./_general";

/**
 * Creates an iCloudApp object populated for testing
 * @param options - CLI options
 * @param photosLibrary - an initiated photosLibrary for handoff
 * @param icloud  - an initiated icloud object for handoff
 * @returns The iCloudApp object
 */
export function appWithOptions<T extends iCloudApp>(options: any, photosLibrary?: PhotosLibrary, icloud?: iCloud): T {
    const app = {
        options,
    };

    if (photosLibrary) {
        const photosLibraryVarName = `photosLibrary`;
        app[photosLibraryVarName] = photosLibrary;
    }

    if (icloud) {
        const icloudVarName = `icloud`;
        app[icloudVarName] = icloud;
    }

    return app as T;
}

export const rejectOptions = [
    {
        "options": [],
        "_desc": `No options`,
        "expected": `error: required option '-u, --username <email>' not specified\n`
    }, {
        "options": [
            `/usr/bin/node`,
            `/home/icloud-photos-sync/main.js`,
            `--fail-on-mfa`,
            `-d`,
            `/opt/icloud-photos-library`,
            `-P`,
            `80`,
            `-l`,
            `info`,
            `--log-to-cli`,
            `-s`,
            `-t`,
            `5`,
            `-r`,
            `-1`,
            `--refresh-token`,
            `token`,
        ],
        "_desc": `Missing username & password`,
        "expected": `error: required option '-u, --username <email>' not specified\n`
    }, {
        "options": [
            `/usr/bin/node`,
            `/home/icloud-photos-sync/main.js`,
            `-u`,
            `test@icloud.com`,
            `--fail-on-mfa`,
            `-d`,
            `/opt/icloud-photos-library`,
            `-P`,
            `80`,
            `-l`,
            `info`,
            `--log-to-cli`,
            `-s`,
            `-t`,
            `5`,
            `-r`,
            `-1`,
            `--refresh-token`,
            `token`,
        ],
        "_desc": `Missing password`,
        "expected": `error: required option '-p, --password <password>' not specified\n`
    }, {
        "options": [
            `/usr/bin/node`,
            `/home/icloud-photos-sync/main.js`,
            `-u`,
            `test@icloud.com`,
            `-p`,
            `testPass`,
            `--fail-on-mfa`,
            `-d`,
            `/opt/icloud-photos-library`,
            `-P`,
            `eight`,
            `-l`,
            `info`,
            `--log-to-cli`,
            `-s`,
            `-t`,
            `5`,
            `-r`,
            `-1`,
            `--refresh-token`,
            `token`,
        ],
        "_desc": `Invalid port`,
        "expected": `error: option '-P, --port <number>' argument 'eight' is invalid. Not a number.\n`
    }, {
        "options": [
            `/usr/bin/node`,
            `/home/icloud-photos-sync/main.js`,
            `-u`,
            `test@icloud.com`,
            `-p`,
            `testPass`,
            `--fail-on-mfa`,
            `-d`,
            `/opt/icloud-photos-library`,
            `-P`,
            `80`,
            `-l`,
            `superInfo`,
            `--log-to-cli`,
            `-s`,
            `-t`,
            `5`,
            `-r`,
            `-1`,
            `--refresh-token`,
            `token`,
        ],
        "_desc": `Invalid log level`,
        "expected": `error: option '-l, --log-level <level>' argument 'superInfo' is invalid. Allowed choices are trace, debug, info, warn, error.\n`
    }, {
        "options": [
            `/usr/bin/node`,
            `/home/icloud-photos-sync/main.js`,
            `-u`,
            `test@icloud.com`,
            `-p`,
            `testPass`,
            `--fail-on-mfa`,
            `-d`,
            `/opt/icloud-photos-library`,
            `-P`,
            `80`,
            `-l`,
            `info`,
            `--log-to-cli`,
            `-s`,
            `-t`,
            `five`,
            `-r`,
            `-1`,
            `--refresh-token`,
            `token`,
        ],
        "_desc": `Invalid download threads`,
        "expected": `error: option '-t, --download-threads <number>' argument 'five' is invalid. Not a number.\n`
    }, {
        "options": [
            `/usr/bin/node`,
            `/home/icloud-photos-sync/main.js`,
            `-u`,
            `test@icloud.com`,
            `-p`,
            `testPass`,
            `--fail-on-mfa`,
            `-d`,
            `/opt/icloud-photos-library`,
            `-P`,
            `80`,
            `-l`,
            `info`,
            `--log-to-cli`,
            `-s`,
            `-t`,
            `5`,
            `-r`,
            `inf`,
            `--refresh-token`,
            `token`,
        ],
        "_desc": `Invalid retries`,
        "expected": `error: option '-r, --max-retries <number>' argument 'inf' is invalid. Not a number.\n`
    }, {
        "options": [
            `/usr/bin/node`,
            `/home/icloud-photos-sync/main.js`,
            `-u`,
            `test@icloud.com`,
            `-p`,
            `testPass`,
            `--fail-on-mfa`,
            `-d`,
            `/opt/icloud-photos-library`,
            `-P`,
            `80`,
            `-l`,
            `info`,
            `--log-to-cli`,
            `-s`,
            `-t`,
            `5`,
            `--refresh-token`,
            `archive`,
        ],
        "_desc": `Missing archive path`,
        "expected": `error: missing required argument 'path'\n`
    },{
        "options": [
            `/usr/bin/node`,
            `/home/icloud-photos-sync/main.js`,
            `-u`,
            `test@icloud.com`,
            `-p`,
            `testPass`,
            `--fail-on-mfa`,
            `-d`,
            `/opt/icloud-photos-library`,
            `-P`,
            `80`,
            `-l`,
            `info`,
            `--log-to-cli`,
            `-s`,
            `-t`,
            `5`,
            `--refresh-token`,
            `--schedule`,
            `asdf`,
            `daemon`,
        ],
        "_desc": `Missformatted schedule`,
        "expected": `error: option '-S, --schedule <cron-string>' argument 'asdf' is invalid. Not a valid cron pattern. See https://crontab.guru (or for more information on the underlying implementation https://github.com/hexagon/croner#pattern)\n`
    }
];

export const validOptions = {
    "token": [
        `/usr/bin/node`,
        `/home/icloud-photos-sync/main.js`,
        `-u`,
        `test@icloud.com`,
        `-p`,
        `testPass`,
        `--fail-on-mfa`,
        `-d`,
        `/opt/icloud-photos-library`,
        `-P`,
        `80`,
        `-l`,
        `info`,
        `--log-to-cli`,
        `-s`,
        `-t`,
        `5`,
        `-r`,
        `-1`,
        `--refresh-token`,
        `token`,
    ],
    "tokenWithForce": [
        `/usr/bin/node`,
        `/home/icloud-photos-sync/main.js`,
        `-u`,
        `test@icloud.com`,
        `-p`,
        `testPass`,
        `--fail-on-mfa`,
        `-d`,
        `/opt/icloud-photos-library`,
        `-P`,
        `80`,
        `-l`,
        `info`,
        `--log-to-cli`,
        `-s`,
        `-t`,
        `5`,
        `-r`,
        `-1`,
        `--refresh-token`,
        `--force`,
        `token`,
    ],
    "sync": [
        `/usr/bin/node`,
        `/home/icloud-photos-sync/main.js`,
        `-u`,
        `test@icloud.com`,
        `-p`,
        `testPass`,
        `--fail-on-mfa`,
        `-d`,
        `/opt/icloud-photos-library`,
        `-P`,
        `80`,
        `-l`,
        `info`,
        `--log-to-cli`,
        `-s`,
        `-t`,
        `5`,
        `-r`,
        `-1`,
        `--refresh-token`,
        `sync`,
    ],
    "archive": [
        `/usr/bin/node`,
        `/home/icloud-photos-sync/main.js`,
        `-u`,
        `test@icloud.com`,
        `-p`,
        `password`,
        `--fail-on-mfa`,
        `-d`,
        `/opt/icloud-photos-library`,
        `-P`,
        `80`,
        `-l`,
        `info`,
        `--log-to-cli`,
        `-s`,
        `-t`,
        `5`,
        `-r`,
        `-1`,
        `--refresh-token`,
        `--remote-delete`,
        `archive`,
        `/root/someTestDir/`,
    ],
    "daemon": [
        `/usr/bin/node`,
        `/home/icloud-photos-sync/main.js`,
        `-u`,
        `test@icloud.com`,
        `-p`,
        `password`,
        `--fail-on-mfa`,
        `-d`,
        `/opt/icloud-photos-library`,
        `-P`,
        `80`,
        `-l`,
        `info`,
        `--log-to-cli`,
        `-s`,
        `-t`,
        `5`,
        `-r`,
        `-1`,
        `--refresh-token`,
        `--remote-delete`,
        `daemon`,
    ],
    "default": [
        `/usr/bin/node`,
        `/home/icloud-photos-sync/main.js`,
        `-u`,
        `test@icloud.com`,
        `-p`,
        `password`,
        `--fail-on-mfa`,
        `-d`,
        `/opt/icloud-photos-library`,
        `-P`,
        `80`,
        `-l`,
        `info`,
        `--log-to-cli`,
        `-s`,
        `-t`,
        `5`,
        `-r`,
        `-1`,
        `--refresh-token`,
        `--remote-delete`,
    ],
};

export class MockedEventHandler implements EventHandler {
    events: string[]
    listeners: any = {}

    constructor(...events: string[]) {
        this.events = events
    }

    // Automatically creating listener functions for the desired events and puts them into the listener object
    registerObjects(...objects: EventEmitter[]): void {
        objects.forEach((obj) => {
            if(!this.listeners[obj.constructor.name]) {
                this.listeners[obj.constructor.name] = {}
            }
            this.events.forEach((event) => {
                this.listeners[obj.constructor.name][event] = spyOnEvent(obj, event)
            })
        })
        throw new Error("Method not implemented.");
    }
    
}