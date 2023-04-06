import { Cookie } from "tough-cookie";

export function sanitized(value: string): string {
    return ["@", ".", "%"].reduce((result, forbiddenCharacter) => {
        return result.replaceAll(forbiddenCharacter, "");
    }, value);
}

export function serializeCookies(cookies: Array<Cookie> = []): string {
    return JSON.stringify({
        cookies: cookies.map((cookie) => cookie.toJSON()),
    });
}

export function deserializeCookies(
    serializedCookies: string = ""
): Array<Cookie> {
    const { cookies } = JSON.parse(serializedCookies);
    return cookies.map((cookie) => Cookie.fromJSON(cookie));
}
