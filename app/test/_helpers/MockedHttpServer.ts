import {jest} from '@jest/globals';
import http, {ServerResponse} from 'http';
import {MockRequest, MockResponse, RequestOptions, createMocks} from 'node-mocks-http';

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
}
