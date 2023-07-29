import {MFAServer} from "../../src/lib/icloud/mfa/mfa-server";
import {jest} from '@jest/globals';
import {IncomingMessage, ServerResponse} from "http";
import {UnknownFunction} from "./_general";

export function mfaServerFactory(): MFAServer {
    const server = new MFAServer();
    return server;
}

export function requestFactory(url: string, method: string = `POST`): IncomingMessage {
    return {
        url,
        method,
    } as unknown as IncomingMessage;
}

export function responseFactory(): ServerResponse<IncomingMessage> {
    return {
        writeHead: jest.fn<UnknownFunction>(),
        end: jest.fn<UnknownFunction>(),
    } as unknown as ServerResponse<IncomingMessage>;
}