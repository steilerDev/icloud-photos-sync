import {jest} from '@jest/globals';
import http, {ServerResponse} from 'http';
import {MockRequest, MockResponse, RequestOptions, createMocks} from 'node-mocks-http';

export async function mockHttpServer() {
    let mockedHttpServer: MockedHttpServer

    const createServerMock = jest.fn((requestHandler: (request: MockRequest<any>, response: MockResponse<ServerResponse>) => void | Promise<void>) => {
        mockedHttpServer = new MockedHttpServer(requestHandler);
        return mockedHttpServer;
    });

    jest.unstable_mockModule(`http`, () => ({
        createServer: createServerMock
    }));

    // we can only do the import here, because we need to mock the http server creation above
    const {WebServer, WEB_SERVER_API_ENDPOINTS}  = (await import(`../../src/app/web-ui/web-server`));

    return {
        // mockedHttpServer is initialized late, so we need to use a getter
        mockedHttpServer: () => mockedHttpServer,
        createServerMock,
        WebServer,
        WEB_SERVER_API_ENDPOINTS
    }
}

export class MockedHttpServer implements Partial<http.Server> {
    public constructor(
        private readonly requestHandler: (request: MockRequest<any>, response: MockResponse<ServerResponse>) => void | Promise<void>
    ) { }

    private readonly eventListeners = new Map<string | symbol, Array<(...args: any[]) => void>>;

    public handle(options: RequestOptions): Promise<MockResponse<ServerResponse>> {
        const {req, res} = createMocks(options);
        return new Promise<MockResponse<ServerResponse>>((resolve, reject) => {
            try {
                const actualEnd = res.end;
                jest.spyOn(res, `end`).mockImplementation((...args) => {
                    const returnValue = actualEnd.call(res, ...args);
                    resolve(res);
                    return returnValue;
                });
                this.requestHandler(req, res);
            } catch (error) {
                reject(error);
            }
        });
    }

    public on(eventName: string | symbol, listener: (...args: any[]) => void): http.Server<typeof http.IncomingMessage, typeof http.ServerResponse> {
        const listenersOfEvent = this.eventListeners.get(eventName as string) ?? [];
        listenersOfEvent.push(listener);
        this.eventListeners.set(eventName, listenersOfEvent);
        return this as Partial<http.Server> as http.Server;
    }

    public off(eventName: string | symbol, listener: (...args: any[]) => void): http.Server<typeof http.IncomingMessage, typeof http.ServerResponse> {
        const listenersOfEvent = this.eventListeners.get(eventName as string) ?? [];
        this.eventListeners.set(eventName, listenersOfEvent.filter(l => l !== listener));
        return this as Partial<http.Server> as http.Server;
    }

    public listen = jest.fn<(...args: any[]) => http.Server>().mockImplementation((...args) => {
        const callback = args[args.length - 1];
        if (callback) {
            this.on(`listening`, callback);
        }
        this.eventListeners.get(`listening`)?.forEach(listener => listener());
        return this as Partial<http.Server> as http.Server;
    });

    public unref(): http.Server<typeof http.IncomingMessage, typeof http.ServerResponse> {
        return this as Partial<http.Server> as http.Server;
    };

    public close(callback?: () => void) {
        if (callback) {
            this.on(`close`, callback);
        }
        this.eventListeners.get(`close`)?.forEach(listener => listener());
        return this as Partial<http.Server> as http.Server;
    }

    public emit(event: unknown, ...args: any[]): boolean {
        const listeners = this.eventListeners.get(event as string) ?? [];
        for (const listener of listeners) {
            listener(...args);
        }
        return true;
    }

    public async fetch(url: string, options?: any) {
        const mockServerResponse = await this.handle({
            url: url.startsWith(`/`) ? url : `/${url}`,
            ...options
        });
        return {
            text: () => {
                return Promise.resolve(mockServerResponse._getData());
            },
            json: () => {
                return Promise.resolve(JSON.parse(mockServerResponse._getData()));
            },
            status: mockServerResponse.statusCode,
            ok: mockServerResponse.statusCode >= 200 && mockServerResponse.statusCode < 300,
        } as Response;
    }

    public getHtml(path: string): Promise<MockResponse<ServerResponse>> {
        return this.handle({
            method: `GET`,
            url: path,
            headers: {
                'Content-Type': `text/html`,
            },
        });
    }

    public getJson(path: string) {
        return this.handle({
            method: `GET`,
            url: path,
            headers: {
                'Content-Type': `application/json`,
            },
        });
    }

    public postJson(path: string, body?: any) {
        return this.handle({
            method: `POST`,
            url: path,
            headers: {
                'Content-Type': `application/json`,
            },
            body: body,
        });
    }
}
