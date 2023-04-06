import {
    sanitized,
    serializeCookies,
    deserializeCookies,
} from "../../src/lib/icloud/utils";
import { Cookie } from "tough-cookie";

describe("utils", () => {
    it("sanitizes usernames", () => {
        expect(sanitized("steve@apple.com")).toEqual("steveapplecom");
        expect(sanitized("elon.musk@tesla.com")).toEqual("elonmuskteslacom");
    });

    it("serializes cookies", () => {
        const now = new Date();
        const expires = new Date(now.getTime() + 3600000);

        const testCookie = new Cookie({
            creation: now,
            key: "hello",
            value: "world",
            domain: "icloud.com",
            path: "/",
            secure: true,
            httpOnly: true,
            expires,
        });

        const cookies: Array<Cookie> = [testCookie];

        expect(serializeCookies(cookies)).toEqual(
            JSON.stringify({
                cookies: [
                    {
                        key: "hello",
                        value: "world",
                        expires: expires.toISOString(),
                        domain: "icloud.com",
                        path: "/",
                        secure: true,
                        httpOnly: true,
                        creation: now.toISOString(),
                    },
                ],
            })
        );
    });

    it("deserializes cookies", () => {
        const now = new Date();
        const expires = new Date(now.getTime() + 3600000);

        const testCookie = new Cookie({
            creation: now,
            key: "hello",
            value: "world",
            domain: "icloud.com",
            path: "/",
            secure: true,
            httpOnly: true,
            expires,
        });

        expect(
            deserializeCookies(
                JSON.stringify({
                    cookies: [
                        {
                            key: "hello",
                            value: "world",
                            expires: expires.toISOString(),
                            domain: "icloud.com",
                            path: "/",
                            secure: true,
                            httpOnly: true,
                            creation: now.toISOString(),
                        },
                    ],
                })
            )
        ).toEqual([testCookie]);
    });
});
