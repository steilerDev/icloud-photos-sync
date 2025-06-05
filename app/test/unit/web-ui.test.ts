import {afterEach, beforeEach, describe, expect, it, jest} from "@jest/globals";
import {configure, getByTestId, waitFor} from "@testing-library/dom";
import '@testing-library/jest-dom/jest-globals';
import {DOMWindow, JSDOM} from "jsdom";
import {normalize} from "path";
import {iCPSError} from "../../src/app/error/error";
import {AUTH_ERR, WEB_SERVER_ERR} from "../../src/app/error/error-codes";
import type {WebServer as WebServerType} from "../../src/app/web-ui/web-server";
import {MFAMethodType} from "../../src/lib/icloud/mfa/mfa-method";
import {iCPSEventApp, iCPSEventCloud, iCPSEventMFA, iCPSEventRuntimeError, iCPSEventSyncEngine, iCPSEventWebServer} from "../../src/lib/resources/events-types";
import {MockedEventManager, prepareResources} from "../_helpers/_general";
import {mockHttpServer} from "../_helpers/MockedHttpServer";

let currentViewPath = ``;
let window: DOMWindow;
let view: HTMLElement;
let dom: JSDOM;

const {mockedHttpServer, WebServer} = await mockHttpServer();

let mockedEventManager: MockedEventManager;

const fetchReplacement = async (url: string | URL | Request, options?: any) => {
    if(typeof url !== `string`) throw new Error(`fetchReplacement only supports string urls at the moment`);

    // the browser fetch API is able to handle relative urls, so we need to resolve them to absolute urls before passing them to the mocked http server
    url = normalize(`${currentViewPath}/${url}`);

    return mockedHttpServer().fetch(url, options);
}

const fetchSpy = jest.spyOn(global, `fetch`).mockImplementation(fetchReplacement);
const alertSpy = jest.fn<typeof window.alert>().mockImplementation((text) => {
    console.log(`alert: ${text}`);
});

// the ui is probably not going to change often enough to justify introducing test id's everywhere, so we use the id attribute as test id
configure({testIdAttribute: `id`})

const load = async (path: string = ``) => {
    const html = await (await mockedHttpServer().fetch(path)).text()
    currentViewPath = path;
    dom = new JSDOM(html, {
        runScripts: `dangerously`,
        url: `http://localhost:8080/${path}`
    });
    dom.window.fetch = fetchSpy as unknown as typeof fetch;
    dom.window.Headers = Headers;
    dom.window.Request = Request;
    dom.window.Response = Response;
    window = dom.window;
    window.alert = alertSpy as unknown as typeof alert;
    view = dom.window.document.body;
}

// Mocking console.error to suppress expected error logs
let consoleSpy: jest.Spied<typeof console.error>;

let webServer: WebServerType;
beforeEach(async () => {
    mockedEventManager = prepareResources()!.event;
    webServer = await WebServer.spawn();
    fetchSpy.mockImplementation(fetchReplacement);
    jest.useFakeTimers();

    // Creating console log
    consoleSpy = jest.spyOn(console, `error`).mockImplementation(() => null);
});
afterEach(async () => {
    // normally one would call jest.runOnlyPendingTimers() here, to clear any pending timers, but we know that not updating the state will not cause any issues in future tests
    jest.clearAllTimers();
    jest.useRealTimers();
    await webServer.close();

    // Restoring console log
    consoleSpy.mockRestore();
});

describe(`Web UI`, () => {
    describe(`State View`, () => {
        beforeEach(() => {
        });

        afterEach(() => {
        });

        async function stateUpdate() {
            await window.updateState();
        }

        function getAllSymbolsExcept(symbol: string) {
            const symbols = view.querySelectorAll(`.state-symbol:not(#${symbol}-symbol)`);
            expect(symbols.length).toBeGreaterThan(0);
            return symbols;
        }

        it(`is initialized correctly`, async () => {
            await load();

            expect(getByTestId(view, `unknown-symbol`)).toBeVisible();
            expect(getByTestId(view, `sync-button`)).toBeVisible();
            expect(getByTestId(view, `reauth-button`)).toBeVisible();
            expect(getByTestId(view, `state-text`)).toHaveTextContent(`...`);

            expect(getByTestId(view, `enter-mfa-section`)).not.toBeVisible();
            expect(getByTestId(view, `next-sync-text`)).not.toBeVisible();

            getAllSymbolsExcept(`unknown`).forEach((symbol) => {
                expect(symbol).not.toBeVisible();
            });
        });

        it(`updates the state on its own`, async () => {
            // We are testing the update interval here separately, because a test that advances the timer to update
            // the state can trigger the update but will never know when the update is done. Using process.nextTick
            // didn't help.
            // Also tried with testing-library's waitFor, but that also didn't work reliably
            await load();
            const updateState = jest.spyOn(window, `updateState`).mockImplementation(() => {
                return Promise.resolve();
            });

            jest.advanceTimersByTime(1000);

            expect(updateState).toHaveBeenCalledTimes(1);
        });

        it(`shows 'failed to update state' when the state could not be updated`, async () => {
            await load();
            jest.spyOn(window, `fetch`).mockImplementation(() => {
                return Promise.reject(new Error(`Failed to fetch`));
            });

            await stateUpdate();

            expect(getByTestId(view, `error-symbol`)).toBeVisible();
            expect(getByTestId(view, `sync-button`)).toBeVisible();
            expect(getByTestId(view, `reauth-button`)).toBeVisible();
            expect(getByTestId(view, `state-text`)).toHaveTextContent(`Error updating state`);
            getAllSymbolsExcept(`error`).forEach((symbol) => {
                expect(symbol).not.toBeVisible();
            });
        });

        it(`shows 'ok' with last state point of time when state is success`, async () => {
            mockedEventManager.emit(iCPSEventSyncEngine.DONE);
            const syncTime = new Date();
            await load();

            await stateUpdate();

            expect(getByTestId(view, `ok-symbol`)).toBeVisible();
            expect(getByTestId(view, `sync-button`)).toBeVisible();
            expect(getByTestId(view, `reauth-button`)).toBeVisible();
            expect(getByTestId(view, `state-text`)).toHaveTextContent(`Last Sync Successful at${syncTime.toLocaleString()}`)
            getAllSymbolsExcept(`ok`).forEach((symbol) => {
                expect(symbol).not.toBeVisible();
            });
        });

        it(`shows 'syncing' when state is syncing`, async () => {
            mockedEventManager.emit(iCPSEventSyncEngine.START);
            await load();

            await stateUpdate();

            expect(getByTestId(view, `syncing-symbol`)).toBeVisible();
            expect(getByTestId(view, `sync-button`)).not.toBeVisible();
            expect(getByTestId(view, `reauth-button`)).not.toBeVisible();
            expect(getByTestId(view, `state-text`)).toHaveTextContent(`Syncing...`)
            expect(getByTestId(view, `next-sync-text`)).not.toBeVisible();
            getAllSymbolsExcept(`syncing`).forEach((symbol) => {
                expect(symbol).not.toBeVisible();
            });
        });

        it(`shows 'authenticating' when state is authenticating`, async () => {
            mockedEventManager.emit(iCPSEventCloud.AUTHENTICATION_STARTED);
            await load();

            await stateUpdate();

            expect(getByTestId(view, `authenticating-symbol`)).toBeVisible();
            expect(getByTestId(view, `sync-button`)).not.toBeVisible();
            expect(getByTestId(view, `reauth-button`)).not.toBeVisible();
            expect(getByTestId(view, `state-text`)).toHaveTextContent(`Authenticating...`);
            expect(getByTestId(view, `next-sync-text`)).not.toBeVisible();
            getAllSymbolsExcept(`authenticating`).forEach((symbol) => {
                expect(symbol).not.toBeVisible();
            });
        });

        it(`shows 'reauthSuccess' when state is reauthSuccess`, async () => {
            mockedEventManager.emit(iCPSEventWebServer.REAUTH_SUCCESS);
            await load();

            await stateUpdate();

            expect(getByTestId(view, `reauthSuccess-symbol`)).toBeVisible();
            expect(getByTestId(view, `sync-button`)).toBeVisible();
            expect(getByTestId(view, `reauth-button`)).toBeVisible();
            expect(getByTestId(view, `state-text`)).toHaveTextContent(`Reauthentication Successful`)
            getAllSymbolsExcept(`reauthSuccess`).forEach((symbol) => {
                expect(symbol).not.toBeVisible();
            });
        });

        it(`shows 'reauthFailed' when state is reauthFailed`, async () => {
            mockedEventManager.emit(iCPSEventWebServer.REAUTH_ERROR, new iCPSError(WEB_SERVER_ERR.MFA_CODE_NOT_PROVIDED));
            const syncTime = new Date();
            await load();

            await stateUpdate();

            expect(getByTestId(view, `reauthError-symbol`)).toBeVisible();
            expect(getByTestId(view, `sync-button`)).toBeVisible();
            expect(getByTestId(view, `reauth-button`)).toBeVisible();
            expect(getByTestId(view, `state-text`)).toHaveTextContent(`Reauthentication Failed at${syncTime.toLocaleString()}Multifactor authentication code not provided within timeout period. Use the 'Renew Authentication' button to request and enter a new code.`)
            getAllSymbolsExcept(`reauthError`).forEach((symbol) => {
                expect(symbol).not.toBeVisible();
            });
        });

        it(`shows 'error' when state is error`, async () => {
            mockedEventManager.emit(iCPSEventRuntimeError.SCHEDULED_ERROR, new iCPSError(AUTH_ERR.UNAUTHORIZED));
            const syncTime = new Date();
            await load();

            await stateUpdate();

            expect(getByTestId(view, `error-symbol`)).toBeVisible();
            expect(getByTestId(view, `sync-button`)).toBeVisible();
            expect(getByTestId(view, `reauth-button`)).toBeVisible();
            expect(getByTestId(view, `state-text`)).toHaveTextContent(`Last Sync Failed at${syncTime.toLocaleString()}Your credentials seem to be invalid. Please check your iCloud credentials and try again.`)
            getAllSymbolsExcept(`error`).forEach((symbol) => {
                expect(symbol).not.toBeVisible();
            });
        });

        it(`shows mfa section when mfa is required`, async () => {
            mockedEventManager.emit(iCPSEventCloud.MFA_REQUIRED);
            await load();

            await stateUpdate();

            expect(getByTestId(view, `enter-mfa-section`)).toBeVisible();
        });

        // tried various approaches to mock window.location.reload, but none worked.
        // Neither, dom.window, nor window.location nor window.location.reload are writable,
        // therefore jest also refuses to spy on them. Manually overwriting or redefining also didn't work.
        it.skip(`reloads the page when the connection to the server is reestablished`, async () => {
            await load();

            fetchSpy.mockReset()
            fetchSpy.mockRejectedValue(new Error(`Failed to fetch`));
            const reload = jest.fn().mockImplementation(() => { })

            await stateUpdate();

            expect(fetchSpy).toHaveBeenCalledTimes(1);

            fetchSpy.mockImplementation(fetchReplacement);

            await stateUpdate();

            expect(reload).toHaveBeenCalled();
        });

        it(`shows the next scheduled sync when sync is scheduled`, async () => {
            //mockedEventManager.emit(iCPSEventApp.SCHEDULED, new Date(1234567890));
            mockedEventManager.emit(iCPSEventApp.SCHEDULED, new Date(1970, 0, 15, 7, 56, 7));
            await load();

            await stateUpdate();

            expect(getByTestId(view, `next-sync-text`)).toBeVisible();
            expect(getByTestId(view, `next-sync-text`)).toHaveTextContent(`Next Sync scheduled at1/15/1970, 7:56:07 AM`);
        });
    });

    describe(`Submit MFA View`, () => {
        beforeEach(async () => {
            mockedEventManager.emit(iCPSEventCloud.MFA_REQUIRED);

            await load(`submit-mfa`);
        });

        it(`focuses the first input field`, () => {
            const inputs = view.querySelectorAll(`#mfaInput input`);
            const firstInput = inputs[0] as HTMLInputElement;
            const secondInput = inputs[1] as HTMLInputElement;

            // if jsdom implemented autofocus correctly, we could use this
            // expect(firstInput).toHaveFocus();
            // expect(secondInput).not.toHaveFocus();

            // instead we have to check for the autofocus attribute explicitly
            expect(firstInput.getAttribute(`autofocus`)).not.toBeNull();
            expect(secondInput.getAttribute(`autofocus`)).toBeNull();
        });

        it(`sets the focus onto the next input field when a digit is entered`, async () => {
            const inputs = view.querySelectorAll(`#mfaInput input`);
            const firstInput = inputs[0] as HTMLInputElement;
            const secondInput = inputs[1] as HTMLInputElement;

            firstInput.focus();
            firstInput.value = `1`;
            firstInput.dispatchEvent(new window.Event(`input`));

            expect(secondInput).toHaveFocus();
        });

        it(`distributes the digits across the input fields when pasting`, async () => {
            const inputs = view.querySelectorAll(`#mfaInput input`);
            const firstInput = inputs[0] as HTMLInputElement;
            const secondInput = inputs[1] as HTMLInputElement;
            const thirdInput = inputs[2] as HTMLInputElement;
            const fourthInput = inputs[3] as HTMLInputElement;
            const fifthInput = inputs[4] as HTMLInputElement;
            const sixthInput = inputs[5] as HTMLInputElement;

            firstInput.focus();
            firstInput.dispatchEvent(new window.Event(`focus`));
            const pasteEvent = new window.Event(`paste`, {bubbles: true});
            (pasteEvent as any).clipboardData = {
                getData: () => `123456`,
            };
            firstInput.dispatchEvent(pasteEvent);

            expect(firstInput.value).toBe(`1`);
            expect(secondInput.value).toBe(`2`);
            expect(thirdInput.value).toBe(`3`);
            expect(fourthInput.value).toBe(`4`);
            expect(fifthInput.value).toBe(`5`);
            expect(sixthInput.value).toBe(`6`);
        });
    });

    describe(`Request MFA View`, () => {
        beforeEach(() => {
            mockedEventManager.emit(iCPSEventCloud.MFA_REQUIRED);
        });

        it(`triggers 'device' resend when device button clicked`, async () => {
            const eventSpy = mockedEventManager.spyOnEvent(iCPSEventMFA.MFA_RESEND);
            await load(`request-mfa`);

            const deviceButton = getByTestId(view, `device-button`);
            deviceButton.click();

            await waitFor(() => {
                expect(eventSpy).toHaveBeenCalledTimes(1);
                expect(eventSpy).toHaveBeenCalledWith({
                    type: MFAMethodType.DEVICE
                });
            }, {container: view});
        });

        it(`triggers 'sms' resend when sms button clicked`, async () => {
            const eventSpy = mockedEventManager.spyOnEvent(iCPSEventMFA.MFA_RESEND);
            await load(`request-mfa`);

            const smsButton = getByTestId(view, `sms-button`);
            smsButton.click();

            await waitFor(() => {
                expect(eventSpy).toHaveBeenCalledTimes(1);
                expect(eventSpy).toHaveBeenCalledWith({
                    numberId: 1,
                    type: MFAMethodType.SMS
                });
            }, {container: view});
        });

        it(`triggers 'voice' resend when voice button clicked`, async () => {
            const eventSpy = mockedEventManager.spyOnEvent(iCPSEventMFA.MFA_RESEND);
            await load(`request-mfa`);

            const voiceButton = getByTestId(view, `voice-button`);
            voiceButton.click();

            await waitFor(() => {
                expect(eventSpy).toHaveBeenCalledTimes(1);
                expect(eventSpy).toHaveBeenCalledWith({
                    numberId: 1,
                    type: MFAMethodType.VOICE
                });
            }, {container: view});
        });

        it(`shows an alert if the request fails`, async () => {
            alertSpy.mockReset();
            await load(`request-mfa`);
            fetchSpy.mockRejectedValue(new Error(`Failed to fetch`));

            const deviceButton = getByTestId(view, `device-button`);
            deviceButton.click();

            await waitFor(() => {
                expect(alertSpy).toHaveBeenCalledWith(`Failed to request MFA code: Failed to fetch`);
            }, {container: view});
        });
    });
});
