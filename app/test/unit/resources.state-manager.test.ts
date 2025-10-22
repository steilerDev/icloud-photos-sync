import {beforeEach, describe, expect, jest, test} from "@jest/globals"
import {LogLevel, LogMessage, SerializedState, StateManager, StateTrigger} from "../../src/lib/resources/state-manager"
import {iCPSError} from "../../src/app/error/error"
import {AUTH_ERR, MFA_ERR, WEB_SERVER_ERR} from "../../src/app/error/error-codes"
import {MockedEventManager, prepareResources} from "../_helpers/_general"
import {iCPSEvent, iCPSEventApp, iCPSEventCloud, iCPSEventLog, iCPSEventMFA, iCPSEventPhotos, iCPSEventRuntimeError, iCPSEventRuntimeWarning, iCPSEventSyncEngine, iCPSEventWebServer, iCPSState} from "../../src/lib/resources/events-types"
import {TrustedPhoneNumber} from "../../src/lib/resources/network-types"

let mockedEventManager: MockedEventManager
let mockedState: StateManager

beforeEach(() => {
    const instances = prepareResources()
    mockedEventManager = instances!.event
    mockedState = instances!.state
})


describe(`State changes`, () => { 
    let stateChangeEvent: jest.Mock
    beforeEach(() => {
        stateChangeEvent = mockedEventManager.spyOnEvent(iCPSState.STATE_CHANGED)
    })
    test.each([
        {
            desc: `Should handle sync trigger`,
            events: [iCPSEventApp.SCHEDULED_START],
            serializedState: {
                state: `running`,
                nextSync: undefined,
                prevError: undefined,
                prevTrigger: `sync`,
                progress: 0,
                progressMsg: `Starting sync...`
            } as SerializedState
        },{
            desc: `Should handle auth trigger`,
            events: [iCPSEventWebServer.REAUTH_REQUESTED],
            serializedState: {
                state: `running`,
                nextSync: undefined,
                prevError: undefined,
                prevTrigger: `auth`,
                progress: 0,
                progressMsg: `Starting auth...`
            } as SerializedState
        },{
            desc: `Should handle authentication starting (triggered by sync)`,
            events: [iCPSEventApp.SCHEDULED_START, iCPSEventCloud.AUTHENTICATION_STARTED],
            serializedState: {
                state: `running`,
                nextSync: undefined,
                prevError: undefined,
                prevTrigger: `sync`,
                progress: 1,
                progressMsg: `Authenticating user...`
            } as SerializedState
        },{
            desc: `Should handle authentication starting (triggered by auth)`,
            events: [iCPSEventWebServer.REAUTH_REQUESTED, iCPSEventCloud.AUTHENTICATION_STARTED],
            serializedState: {
                state: `running`,
                nextSync: undefined,
                prevError: undefined,
                prevTrigger: `auth`,
                progress: 12.5,
                progressMsg: `Authenticating user...`
            } as SerializedState
        },{
            desc: `Should handle MFA required (triggered by sync)`,
            events: [iCPSEventApp.SCHEDULED_START, [iCPSEventCloud.MFA_REQUIRED,[{id: 1, numberWithDialCode: `123`}]]],
            serializedState: {
                state: `blocked`,
                nextSync: undefined,
                prevError: undefined,
                prevTrigger: `sync`,
                progress: 2,
                progressMsg: `Waiting for MFA code...`,
                trustedPhoneNumbers: [{
                    id: 1,
                    maskedNumber: `123`
                }]
            } as SerializedState
        },{
            desc: `Should handle MFA required (triggered by auth)`,
            events: [iCPSEventWebServer.REAUTH_REQUESTED, [iCPSEventCloud.MFA_REQUIRED,[{id: 1, numberWithDialCode: `123`}]]],
            serializedState: {
                state: `blocked`,
                nextSync: undefined,
                prevError: undefined,
                prevTrigger: `auth`,
                progress: 25,
                progressMsg: `Waiting for MFA code...`,
                trustedPhoneNumbers: [{
                    id: 1,
                    maskedNumber: `123`
                }]
            } as SerializedState
        },{
            desc: `Should handle MFA resend (triggered by sync)`,
            events: [iCPSEventApp.SCHEDULED_START, [iCPSEventMFA.MFA_RESEND, `device`]],
            serializedState: {
                state: `blocked`,
                nextSync: undefined,
                prevError: undefined,
                prevTrigger: `sync`,
                progress: 2,
                progressMsg: `Resending MFA code via device...`
            } as SerializedState
        },{
            desc: `Should handle MFA resend (triggered by auth)`,
            events: [iCPSEventWebServer.REAUTH_REQUESTED, [iCPSEventMFA.MFA_RESEND, `device`]],
            serializedState: {
                state: `blocked`,
                nextSync: undefined,
                prevError: undefined,
                prevTrigger: `auth`,
                progress: 25,
                progressMsg: `Resending MFA code via device...`
            } as SerializedState
        },{
            desc: `Should handle MFA received (triggered by sync)`,
            events: [iCPSEventApp.SCHEDULED_START, [iCPSEventMFA.MFA_RECEIVED, `device`, `123`]],
            serializedState: {
                state: `blocked`,
                nextSync: undefined,
                prevError: undefined,
                prevTrigger: `sync`,
                progress: 2,
                progressMsg: `MFA code received from device (123)`
            } as SerializedState
        },{
            desc: `Should handle MFA received (triggered by auth)`,
            events: [iCPSEventWebServer.REAUTH_REQUESTED, [iCPSEventMFA.MFA_RECEIVED, `device`, `123`]],
            serializedState: {
                state: `blocked`,
                nextSync: undefined,
                prevError: undefined,
                prevTrigger: `auth`,
                progress: 25,
                progressMsg: `MFA code received from device (123)`
            } as SerializedState
        },{
            desc: `Should handle authenticated (triggered by sync)`,
            events: [iCPSEventApp.SCHEDULED_START, iCPSEventCloud.AUTHENTICATED],
            serializedState: {
                state: `running`,
                nextSync: undefined,
                prevError: undefined,
                prevTrigger: `sync`,
                progress: 5,
                progressMsg: `User authenticated`
            } as SerializedState
        },{
            desc: `Should handle authenticated (triggered by auth)`,
            events: [iCPSEventWebServer.REAUTH_REQUESTED, iCPSEventCloud.AUTHENTICATED],
            serializedState: {
                state: `running`,
                nextSync: undefined,
                prevError: undefined,
                prevTrigger: `auth`,
                progress: 62.5,
                progressMsg: `User authenticated`
            } as SerializedState
        },{
            desc: `Should handle trusted (triggered by sync)`,
            events: [iCPSEventApp.SCHEDULED_START, iCPSEventCloud.TRUSTED],
            serializedState: {
                state: `running`,
                nextSync: undefined,
                prevError: undefined,
                prevTrigger: `sync`,
                progress: 8,
                progressMsg: `Device trusted`
            } as SerializedState
        },{
            desc: `Should handle trusted (triggered by auth)`,
            events: [iCPSEventWebServer.REAUTH_REQUESTED, iCPSEventCloud.TRUSTED],
            serializedState: {
                state: `running`,
                nextSync: undefined,
                prevError: undefined,
                prevTrigger: `auth`,
                progress: 100,
                progressMsg: `Device trusted`
            } as SerializedState
        },{
            desc: `Should handle PCS Required (triggered by sync)`,
            events: [iCPSEventApp.SCHEDULED_START, iCPSEventCloud.PCS_REQUIRED],
            serializedState: {
                state: `running`,
                nextSync: undefined,
                prevError: undefined,
                prevTrigger: `sync`,
                progress: 9,
                progressMsg: `Advanced Data Protection requires additional cookies, acquiring...`
            } as SerializedState
        },{
            desc: `Should handle PCS Required (triggered by sync)`,
            events: [iCPSEventApp.SCHEDULED_START, iCPSEventCloud.PCS_NOT_READY],
            serializedState: {
                state: `running`,
                nextSync: undefined,
                prevError: undefined,
                prevTrigger: `sync`,
                progress: 9,
                progressMsg: `Advanced Data Protection request not confirmed yet, retrying...`
            } as SerializedState
        },{
            desc: `Should handle account ready (triggered by sync)`,
            events: [iCPSEventApp.SCHEDULED_START, iCPSEventCloud.ACCOUNT_READY],
            serializedState: {
                state: `running`,
                nextSync: undefined,
                prevError: undefined,
                prevTrigger: `sync`,
                progress: 10,
                progressMsg: `Sign in successful!`
            } as SerializedState
        },{
            desc: `Should handle session expired (triggered by sync)`,
            events: [iCPSEventApp.SCHEDULED_START, iCPSEventCloud.SESSION_EXPIRED],
            serializedState: {
                state: `running`,
                nextSync: undefined,
                prevError: undefined,
                prevTrigger: `sync`,
                progress: 0,
                progressMsg: `Session expired, re-authenticating...`
            } as SerializedState
        },{
            desc: `Should handle setup completed (triggered by sync)`,
            events: [iCPSEventApp.SCHEDULED_START, iCPSEventPhotos.SETUP_COMPLETED],
            serializedState: {
                state: `running`,
                nextSync: undefined,
                prevError: undefined,
                prevTrigger: `sync`,
                progress: 11,
                progressMsg: `iCloud Photos setup completed, checking indexing status...`
            } as SerializedState
        },{
            desc: `Should handle ready (triggered by sync)`,
            events: [iCPSEventApp.SCHEDULED_START, iCPSEventPhotos.READY],
            serializedState: {
                state: `running`,
                nextSync: undefined,
                prevError: undefined,
                prevTrigger: `sync`,
                progress: 15,
                progressMsg: `iCloud Photos ready!`
            } as SerializedState
        },{
            desc: `Should handle start (triggered by sync)`,
            events: [iCPSEventApp.SCHEDULED_START, iCPSEventSyncEngine.START],
            serializedState: {
                state: `running`,
                nextSync: undefined,
                prevError: undefined,
                prevTrigger: `sync`,
                progress: 15,
                progressMsg: `Starting sync...`
            } as SerializedState
        },{
            desc: `Should handle fetch & load (triggered by sync)`,
            events: [iCPSEventApp.SCHEDULED_START, iCPSEventSyncEngine.FETCH_N_LOAD],
            serializedState: {
                state: `running`,
                nextSync: undefined,
                prevError: undefined,
                prevTrigger: `sync`,
                progress: 16,
                progressMsg: `Loading local & fetching remote iCloud Library state...`
            } as SerializedState
        },{
            desc: `Should handle fetch & load completed (triggered by sync)`,
            events: [iCPSEventApp.SCHEDULED_START, [iCPSEventSyncEngine.FETCH_N_LOAD_COMPLETED, 1, 2, 3, 4]],
            serializedState: {
                state: `running`,
                nextSync: undefined,
                prevError: undefined,
                prevTrigger: `sync`,
                progress: 23,
                progressMsg: `Loaded local (3 assets in 4 albums) & remote state (1 assets in 2 albums)`
            } as SerializedState
        },{
            desc: `Should handle diff (triggered by sync)`,
            events: [iCPSEventApp.SCHEDULED_START, iCPSEventSyncEngine.DIFF],
            serializedState: {
                state: `running`,
                nextSync: undefined,
                prevError: undefined,
                prevTrigger: `sync`,
                progress: 24,
                progressMsg: `Diffing remote with local state...`
            } as SerializedState
        },{
            desc: `Should handle diff completed (triggered by sync)`,
            events: [iCPSEventApp.SCHEDULED_START, iCPSEventSyncEngine.DIFF_COMPLETED],
            serializedState: {
                state: `running`,
                nextSync: undefined,
                prevError: undefined,
                prevTrigger: `sync`,
                progress: 25,
                progressMsg: `Diffing completed!`
            } as SerializedState
        },{
            desc: `Should handle write (triggered by sync)`,
            events: [iCPSEventApp.SCHEDULED_START, iCPSEventSyncEngine.WRITE],
            serializedState: {
                state: `running`,
                nextSync: undefined,
                prevError: undefined,
                prevTrigger: `sync`,
                progress: 25,
                progressMsg: `Writing diff to disk...`
            } as SerializedState
        },{
            desc: `Should handle write assets (triggered by sync)`,
            events: [iCPSEventApp.SCHEDULED_START, [iCPSEventSyncEngine.WRITE_ASSETS, 1, 2, 3]],
            serializedState: {
                state: `running`,
                nextSync: undefined,
                prevError: undefined,
                prevTrigger: `sync`,
                progress: 25,
                progressMsg: `Syncing assets: 0/2`
            } as SerializedState
        },{
            desc: `Should handle write asset completed (triggered by sync)`,
            events: [iCPSEventApp.SCHEDULED_START, [iCPSEventSyncEngine.WRITE_ASSETS, 0, 10, 0], iCPSEventSyncEngine.WRITE_ASSET_COMPLETED],
            serializedState: {
                state: `running`,
                nextSync: undefined,
                prevError: undefined,
                prevTrigger: `sync`,
                progress: 31.5,
                progressMsg: `Syncing assets: 1/10`
            } as SerializedState
        },{
            desc: `Should handle write asset completed twice (triggered by sync)`,
            events: [iCPSEventApp.SCHEDULED_START, [iCPSEventSyncEngine.WRITE_ASSETS, 0, 10, 0], iCPSEventSyncEngine.WRITE_ASSET_COMPLETED, iCPSEventSyncEngine.WRITE_ASSET_COMPLETED],
            serializedState: {
                state: `running`,
                nextSync: undefined,
                prevError: undefined,
                prevTrigger: `sync`,
                progress: 38,
                progressMsg: `Syncing assets: 2/10`
            } as SerializedState
        },{
            desc: `Should handle write asset error (triggered by sync)`,
            events: [iCPSEventApp.SCHEDULED_START, [iCPSEventSyncEngine.WRITE_ASSETS, 0, 10, 0], iCPSEventRuntimeWarning.WRITE_ASSET_ERROR],
            serializedState: {
                state: `running`,
                nextSync: undefined,
                prevError: undefined,
                prevTrigger: `sync`,
                progress: 31.5,
                progressMsg: `Syncing assets: 1/10`
            } as SerializedState
        },{
            desc: `Should handle write assets completed (triggered by sync)`,
            events: [iCPSEventApp.SCHEDULED_START, iCPSEventSyncEngine.WRITE_ASSETS_COMPLETED],
            serializedState: {
                state: `running`,
                nextSync: undefined,
                prevError: undefined,
                prevTrigger: `sync`,
                progress: 90,
                progressMsg: `Asset sync completed!`
            } as SerializedState
        },{
            desc: `Should handle write albums (triggered by sync)`,
            events: [iCPSEventApp.SCHEDULED_START, iCPSEventSyncEngine.WRITE_ALBUMS],
            serializedState: {
                state: `running`,
                nextSync: undefined,
                prevError: undefined,
                prevTrigger: `sync`,
                progress: 91,
                progressMsg: `Syncing albums...`
            } as SerializedState
        },{
            desc: `Should handle write albums completed (triggered by sync)`,
            events: [iCPSEventApp.SCHEDULED_START, iCPSEventSyncEngine.WRITE_ALBUMS_COMPLETED],
            serializedState: {
                state: `running`,
                nextSync: undefined,
                prevError: undefined,
                prevTrigger: `sync`,
                progress: 98,
                progressMsg: `Album sync completed!`
            } as SerializedState
        },{
            desc: `Should handle write completed (triggered by sync)`,
            events: [iCPSEventApp.SCHEDULED_START, iCPSEventSyncEngine.WRITE_COMPLETED],
            serializedState: {
                state: `running`,
                nextSync: undefined,
                prevError: undefined,
                prevTrigger: `sync`,
                progress: 99,
                progressMsg: `Successfully wrote diff to disk!`
            } as SerializedState
        },{
            desc: `Should handle retry (triggered by sync)`,
            events: [iCPSEventApp.SCHEDULED_START, [iCPSEventSyncEngine.RETRY, 1, new Error(`Test`)]],
            serializedState: {
                state: `running`,
                nextSync: undefined,
                prevError: undefined,
                prevTrigger: `sync`,
                progress: 15,
                progressMsg: `Detected error during sync: UNKNOWN: Unknown error occurred caused by Test, Refreshing iCloud connection & retrying (attempt #1)...`
            } as SerializedState
        },{
            desc: `Should update state and retain trigger on sync success`,
            events: [iCPSEventApp.SCHEDULED_START, [iCPSEventApp.SCHEDULED_DONE, new Date(1)]],
            serializedState: {
                state: `ready`,
                nextSync: 1,
                prevError: undefined,
                prevTrigger: `sync`,
                progress: 0,
                progressMsg: `Starting sync...`
            } as SerializedState
        },{
            desc: `Should update state and retain trigger on auth success`,
            events: [iCPSEventWebServer.REAUTH_REQUESTED, iCPSEventApp.TOKEN],
            serializedState: {
                state: `ready`,
                nextSync: undefined,
                prevError: undefined,
                prevTrigger: `auth`,
                progress: 0,
                progressMsg: `Starting auth...`
            } as SerializedState
        },{
            desc: `Should update state and set nextSync on scheduled event`,
            events: [[iCPSEventApp.SCHEDULED, new Date(1)]],
            serializedState: {
                state: `ready`,
                nextSync: 1,
                prevError: undefined,
                prevTrigger: undefined,
                progress: undefined,
                progressMsg: undefined
            } as SerializedState
        },{
            desc: `Should set error on scheduled error`,
            events: [iCPSEventApp.SCHEDULED_START, [iCPSEventRuntimeError.SCHEDULED_ERROR, new Error(`Test`)]],
            serializedState: {
                state: `ready`,
                nextSync: undefined,
                prevError: {code: `NO_ROOT_ERROR_CODE`, message: `UNKNOWN: Unknown error occurred caused by Test`},
                prevTrigger: `sync`,
                progress: 0,
                progressMsg: `Starting sync...`
            } as SerializedState
        },{
            desc: `Should set error on mfa error`,
            events: [iCPSEventApp.SCHEDULED_START, iCPSEventMFA.MFA_NOT_PROVIDED],
            serializedState: {
                state: `ready`,
                nextSync: undefined,
                prevError: {code: `WEB_SERVER_MFA_CODE_NOT_PROVIDED`, message: `MFA code not provided within timeout period. Use the 'Renew Authentication' button to request and enter a new code.`},
                prevTrigger: `sync`,
                progress: 0,
                progressMsg: `Starting sync...`
            } as SerializedState
        },{
            desc: `Should set error on reauth error`,
            events: [iCPSEventWebServer.REAUTH_REQUESTED, [iCPSEventWebServer.REAUTH_ERROR, new Error(`Test`)]],
            serializedState: {
                state: `ready`,
                nextSync: undefined,
                prevError: {code: `NO_ROOT_ERROR_CODE`, message: `UNKNOWN: Unknown error occurred caused by Test`},
                prevTrigger: `auth`,
                progress: 0,
                progressMsg: `Starting auth...`
            } as SerializedState
        },{
            desc: `Should set custom error on fail on mfa error`,
            events: [iCPSEventWebServer.REAUTH_REQUESTED, [iCPSEventWebServer.REAUTH_ERROR, new iCPSError(MFA_ERR.FAIL_ON_MFA)]],
            serializedState: {
                state: `ready`,
                nextSync: undefined,
                prevError: {code: `MFA_FAIL_ON_MFA`, message: `MFA code required. Use the 'Renew Authentication' button to request and enter a new code.`},
                prevTrigger: `auth`,
                progress: 0,
                progressMsg: `Starting auth...`
            } as SerializedState
        },{
            desc: `Should set custom error on unauthorized error`,
            events: [iCPSEventWebServer.REAUTH_REQUESTED, [iCPSEventWebServer.REAUTH_ERROR, new iCPSError(AUTH_ERR.UNAUTHORIZED)]],
            serializedState: {
                state: `ready`,
                nextSync: undefined,
                prevError: {code: `AUTH_UNAUTHORIZED`, message: `Your credentials seem to be invalid. Please check your iCloud credentials and try again.`},
                prevTrigger: `auth`,
                progress: 0,
                progressMsg: `Starting auth...`
            } as SerializedState
        },{
            desc: `Should set custom error on mfa not provided error`,
            events: [iCPSEventWebServer.REAUTH_REQUESTED, [iCPSEventWebServer.REAUTH_ERROR, new iCPSError(WEB_SERVER_ERR.MFA_CODE_NOT_PROVIDED)]],
            serializedState: {
                state: `ready`,
                nextSync: undefined,
                prevError: {code: `WEB_SERVER_MFA_CODE_NOT_PROVIDED`, message: `MFA code not provided within timeout period. Use the 'Renew Authentication' button to request and enter a new code.`},
                prevTrigger: `auth`,
                progress: 0,
                progressMsg: `Starting auth...`
            } as SerializedState
        },{
            desc: `Should clear error on trigger`,
            events: [iCPSEventWebServer.REAUTH_REQUESTED, [iCPSEventWebServer.REAUTH_ERROR, new Error(`Test`)], iCPSEventApp.SCHEDULED_START],
            serializedState: {
                state: `running`,
                nextSync: undefined,
                prevError: undefined,
                prevTrigger: `sync`,
                progress: 0,
                progressMsg: `Starting sync...`
            } as SerializedState
        }
    ])(`$desc`, ({events, serializedState}) => {
        for(const event of events) {
            if(Array.isArray(event)) {
                mockedEventManager.emit(event[0] as iCPSEvent, ...event.slice(1))
            } else {
                mockedEventManager.emit(event)
            }
        }
        expect(stateChangeEvent).toHaveBeenLastCalledWith(expect.objectContaining({
            state: serializedState.state,
            nextSync: serializedState.nextSync,
            prevError: serializedState.prevError,
            prevTrigger: serializedState.prevTrigger,
            progress: serializedState.progress,
            progressMsg: serializedState.progressMsg,
            trustedPhoneNumbers: serializedState.trustedPhoneNumbers
        }))
    })
})

describe(`Log added`, () => { 
    let logAddedEvent: jest.Mock
    beforeEach(() => {
        logAddedEvent = mockedEventManager.spyOnEvent(iCPSState.LOG_ADDED)
    })
    test.each([
        {
            desc: `Should handle debug log`,
            event: iCPSEventLog.DEBUG,
            args: [`SourceObject`, `TestMsg`],
            serializedMessage: {
                level: `debug`,
                source: `SourceObject`,
                message: `TestMsg`
            } as LogMessage
        },{
            desc: `Should handle info log`,
            event: iCPSEventLog.INFO,
            args: [`SourceObject`, `TestMsg`],
            serializedMessage: {
                level: `info`,
                source: `SourceObject`,
                message: `TestMsg`
            } as LogMessage
        },{
            desc: `Should handle warn log`,
            event: iCPSEventLog.WARN,
            args: [`SourceObject`, `TestMsg`],
            serializedMessage: {
                level: `warn`,
                source: `SourceObject`,
                message: `TestMsg`
            } as LogMessage
        },{
            desc: `Should handle runtime warning: count mismatch`,
            event: iCPSEventRuntimeWarning.COUNT_MISMATCH,
            args: [`Album`, 1, 2, 3],
            serializedMessage: {
                level: `warn`,
                source: `RuntimeWarning`,
                message: `Expected 1 CPLAssets & CPLMasters, but got 2 CPLAssets and 3 CPLMasters for album Album`
            } as LogMessage
        },{
            desc: `Should handle runtime warning: file type error`,
            event: iCPSEventRuntimeWarning.FILETYPE_ERROR,
            args: [`.png`, `png`],
            serializedMessage: {
                level: `warn`,
                source: `RuntimeWarning`,
                message: `Unknown file extension .png for descriptor png`
            } as LogMessage
        },{
            desc: `Should handle runtime warning: library load error`,
            event: iCPSEventRuntimeWarning.LIBRARY_LOAD_ERROR,
            args: [new Error(`Test`), `/some/path`],
            serializedMessage: {
                level: `warn`,
                source: `RuntimeWarning`,
                message: `Error while loading file /some/path: UNKNOWN: Unknown error occurred caused by Test`
            } as LogMessage
        },{
            desc: `Should handle runtime warning: extraneous file`,
            event: iCPSEventRuntimeWarning.EXTRANEOUS_FILE,
            args: [`/some/path`],
            serializedMessage: {
                level: `warn`,
                source: `RuntimeWarning`,
                message: `Extraneous file found in directory /some/path`
            } as LogMessage
        },{
            desc: `Should handle runtime warning: icloud load error`,
            event: iCPSEventRuntimeWarning.ICLOUD_LOAD_ERROR,
            args: [new Error(`Test`), {recordName: `someName`}],
            serializedMessage: {
                level: `warn`,
                source: `RuntimeWarning`,
                message: `Error while loading iCloud asset someName: UNKNOWN: Unknown error occurred caused by Test`
            } as LogMessage
        },{
            desc: `Should handle runtime warning: write asset error`,
            event: iCPSEventRuntimeWarning.WRITE_ASSET_ERROR,
            args: [new Error(`Test`)],
            serializedMessage: {
                level: `warn`,
                source: `RuntimeWarning`,
                message: `Error while verifying asset undefined: UNKNOWN: Unknown error occurred caused by Test`
            } as LogMessage
        },{
            desc: `Should handle runtime warning: write album error`,
            event: iCPSEventRuntimeWarning.WRITE_ALBUM_ERROR,
            args: [new Error(`Test`)],
            serializedMessage: {
                level: `warn`,
                source: `RuntimeWarning`,
                message: `Error while writing album undefined: UNKNOWN: Unknown error occurred caused by Test`
            } as LogMessage
        },{
            desc: `Should handle runtime warning: link error`,
            event: iCPSEventRuntimeWarning.LINK_ERROR,
            args: [new Error(`Test`), `some/src/path`, `some/dest/path`],
            serializedMessage: {
                level: `warn`,
                source: `RuntimeWarning`,
                message: `Error while linking some/src/path to some/dest/path: UNKNOWN: Unknown error occurred caused by Test`
            } as LogMessage
        },{
            desc: `Should handle runtime warning: mfa error`,
            event: iCPSEventRuntimeWarning.MFA_ERROR,
            args: [new Error(`Test`)],
            serializedMessage: {
                level: `warn`,
                source: `RuntimeWarning`,
                message: `Error within MFA flow: UNKNOWN: Unknown error occurred caused by Test`
            } as LogMessage
        },{
            desc: `Should handle runtime warning: webserver error`,
            event: iCPSEventRuntimeWarning.WEB_SERVER_ERROR,
            args: [new Error(`Test`)],
            serializedMessage: {
                level: `warn`,
                source: `RuntimeWarning`,
                message: `Error within web server: UNKNOWN: Unknown error occurred caused by Test`
            } as LogMessage
        },{
            desc: `Should handle runtime warning: resource file error`,
            event: iCPSEventRuntimeWarning.RESOURCE_FILE_ERROR,
            args: [new Error(`Test`)],
            serializedMessage: {
                level: `warn`,
                source: `RuntimeWarning`,
                message: `Error while accessing resource file: UNKNOWN: Unknown error occurred caused by Test`
            } as LogMessage
        },{
            desc: `Should handle runtime warning: archive asset error`,
            event: iCPSEventRuntimeWarning.ARCHIVE_ASSET_ERROR,
            args: [new Error(`Test`), `/some/path`],
            serializedMessage: {
                level: `warn`,
                source: `RuntimeWarning`,
                message: `Error while archiving asset /some/path: UNKNOWN: Unknown error occurred caused by Test`
            } as LogMessage
        },{
            desc: `Should handle runtime warning: retry`,
            event: iCPSEventSyncEngine.RETRY,
            args: [1, new Error(`Test`)],
            serializedMessage: {
                level: `warn`,
                source: `RuntimeWarning`,
                message: `Detected error during sync: UNKNOWN: Unknown error occurred caused by Test`
            } as LogMessage
        }
    ])(`$desc`, ({event, args, serializedMessage}) => {
        const preEventLogLength = mockedState.log!.length
        mockedEventManager.emit(event, ...args)
        expect(logAddedEvent).toHaveBeenLastCalledWith(expect.objectContaining({
            level: serializedMessage.level,
            source: serializedMessage.source,
            message: serializedMessage.message
        }))
        expect(mockedState.log?.length).toEqual(preEventLogLength + 1)
    })

    test(`Log should clear on trigger`, () => {
        mockedState.log = [{message: `LogMessage`}] as LogMessage[]
        mockedState.triggerSync(StateTrigger.SYNC)
        expect(mockedState.log.length).toEqual(0)
    })

    describe(`Log should serialize`, () => {
        beforeEach(() => {
            mockedState.log = [
                {
                    level: LogLevel.DEBUG,
                    source: `SourceA`,
                    message: `TestMsg`,
                    time: 1
                },{
                    level: LogLevel.INFO,
                    source: `SourceA`,
                    message: `TestMsg`,
                    time: 1
                },{
                    level: LogLevel.WARN,
                    source: `SourceB`,
                    message: `TestMsg`,
                    time: 1
                },{
                    level: LogLevel.ERROR,
                    source: `SourceB`,
                    message: `TestMsg`,
                    time: 1
                }
            ]
        })

        test.each([
            {
                desc: `debug`,
                logFilter: {
                    level: LogLevel.DEBUG
                },
                expectedLength: 4
            },{
                desc: `info`,
                logFilter: {
                    level: LogLevel.INFO
                },
                expectedLength: 3
            },{
                desc: `warn`,
                logFilter: {
                    level: LogLevel.WARN
                },
                expectedLength: 2
            },{
                desc: `error`,
                logFilter: {
                    level: LogLevel.ERROR
                },
                expectedLength: 1
            },{
                desc: `SourceA and debug`,
                logFilter: {
                    level: LogLevel.DEBUG,
                    source: /^SourceA$/
                },
                expectedLength: 2
            },{
                desc: `SourceA and warn`,
                logFilter: {
                    level: LogLevel.WARN,
                    source: /^SourceA$/
                },
                expectedLength: 0
            },{
                desc: `no`,
                logFilter: {
                    level: `none`
                },
                expectedLength: 0
            }
        ])(`Serialize $desc messages`, ({logFilter, expectedLength}) => {
            const serializedLog = mockedState.serializeLog(logFilter as any)
            expect(serializedLog.length).toEqual(expectedLength)
        })
    })
})
