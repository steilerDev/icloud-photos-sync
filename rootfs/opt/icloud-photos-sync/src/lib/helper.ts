import {AxiosResponseHeaders} from "axios";

export function getCookieValueFromResponseHeader(cookieKey: string, responseHeaders: AxiosResponseHeaders): string {
    const extractedHeader:string = responseHeaders[`set-cookie`].find(el => el.startsWith(`${cookieKey}=`));
    const removedKey: string = extractedHeader.substring(cookieKey.length + 1);
    const removedMetadata: string = removedKey.split(`;`)[0];
    return removedMetadata;
}