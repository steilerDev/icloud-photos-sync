import * as Config from './config';
import {MFAMethod, MFAMethodType} from '../../src/lib/icloud/mfa/mfa-method.js';

export function expectedMFAHeaders(): any {
    return {
        "Accept": `application/json`,
        "Accept-Encoding": `gzip, deflate, br`,
        "Connection": `keep-alive`,
        "Content-Type": `application/json`,
        "Cookie": `aasp=${Config.aasp}`,
        "Origin": `https://idmsa.apple.com`,
        "Referer": `https://idmsa.apple.com/`,
        "User-Agent": `Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:97.0) Gecko/20100101 Firefox/97.0`,
        "X-Apple-I-FD-Client-Info": `{"U":"Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:97.0) Gecko/20100101 Firefox/97.0","L":"en-US","Z":"GMT+01:00","V":"1.1","F":""}`,
        "X-Apple-ID-Session-Id": Config.sessionToken,
        "X-Apple-OAuth-Client-Id": `d39ba9916b7251055b22c7f910e2ea796ee65e98b2ddecea8f5dde8d9d1a815d`,
        "X-Apple-OAuth-Client-Type": `firstPartyAuth`,
        "X-Apple-OAuth-Response-Mode": `web_message`,
        "X-Apple-OAuth-Response-Type": `code`,
        "X-Apple-Widget-Key": `d39ba9916b7251055b22c7f910e2ea796ee65e98b2ddecea8f5dde8d9d1a815d`,
        "scnt": Config.scnt,
    };
}

export function expectedAxiosPut(method: MFAMethod): any {
    if (method.type === MFAMethodType.DEVICE) {
        return [
            `https://idmsa.apple.com/appleauth/auth/verify/trusteddevice/securitycode`,
            undefined,
            {
                "headers": expectedMFAHeaders(),
            },
        ];
    }

    if (method.type === MFAMethodType.VOICE) {
        return [
            `https://idmsa.apple.com/appleauth/auth/verify/phone`,
            {"mode": `voice`, "phoneNumber": {"id": 1}},
            {
                "headers": expectedMFAHeaders(),
            },
        ];
    }

    if (method.type === MFAMethodType.SMS) {
        return [
            `https://idmsa.apple.com/appleauth/auth/verify/phone`,
            {"mode": `sms`, "phoneNumber": {"id": 1}},
            {
                "headers": expectedMFAHeaders(),
            },
        ];
    }
}

export function expectedAxiosPost(method: MFAMethod): any {
    if (method.type === MFAMethodType.DEVICE) {
        return [
            `https://idmsa.apple.com/appleauth/auth/verify/trusteddevice/securitycode`,
            {
                "securityCode": {
                    "code": `123456`,
                },
            },
            {
                "headers": expectedMFAHeaders(),
            },
        ];
    }

    if (method.type === MFAMethodType.VOICE) {
        return [
            `https://idmsa.apple.com/appleauth/auth/verify/phone/securitycode`,
            {
                "securityCode": {
                    "code": `123456`,
                },
                "phoneNumber": {
                    "id": 1,
                },
                "mode": `voice`,
            },
            {
                "headers": expectedMFAHeaders(),
            },
        ];
    }

    if (method.type === MFAMethodType.SMS) {
        return [
            `https://idmsa.apple.com/appleauth/auth/verify/phone/securitycode`,
            {
                "securityCode": {
                    "code": `123456`,
                },
                "phoneNumber": {
                    "id": 1,
                },
                "mode": `sms`,
            },
            {
                "headers": expectedMFAHeaders(),
            },
        ];
    }
}