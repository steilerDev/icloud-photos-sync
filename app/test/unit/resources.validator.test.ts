import {describe, test, expect, beforeEach} from '@jest/globals';
import {Validator} from '../../src/lib/resources/validator';
import {VALIDATOR_ERR} from '../../src/app/error/error-codes';
import {ResendMFADeviceResponse, ResendMFAPhoneResponse, TrustResponse} from '../../src/lib/resources/network-types';
import {getICloudCookieHeader} from '../_helpers/icloud.helper';
import * as Config from '../_helpers/_config';

describe(`Validator`, () => {
    let validator: Validator;

    beforeEach(() => {
        validator = new Validator();
    });

    describe(`validateResourceFile`, () => {
        test.each([
            {
                data: {
                    libraryVersion: 1,
                },
                desc: `only libraryVersion`,
            }, {
                data: {
                    libraryVersion: 1,
                    trustToken: `someToken`,
                },
                desc: `libraryVersion and trustToken`,
            }, {
                data: {
                    libraryVersion: 1,
                    notificationVapidCredentials: {
                        publicKey: `someKey`,
                        privateKey: `someKey`
                    }
                },
                desc: `libraryVersion and VAPID Credentials`,
            }, {
                data: {
                    libraryVersion: 1,
                    notificationSubscriptions: {
                        'http://some.endpoint': {
                            endpoint: `http://some.endpoint`,
                            keys: {
                                p256dh: `someKey`,
                                auth: `someAuth`
                            }
                        }
                    }
                },
                desc: `libraryVersion and one notification subscription`,
            }, {
                data: {
                    libraryVersion: 1,
                    notificationSubscriptions: {
                        'http://some.endpoint': {
                            endpoint: `http://some.endpoint`,
                            keys: {
                                p256dh: `someKey`,
                                auth: `someAuth`
                            }
                        },
                        'http://some.other.endpoint': {
                            endpoint: `http://some.other.endpoint`,
                            keys: {
                                p256dh: `someOtherKey`,
                                auth: `someOtherAuth`
                            }
                        }
                    }
                },
                desc: `libraryVersion and multiple notification subscription`,
            }, {
                data: {
                    libraryVersion: 1,
                    notificationSubscriptions: {}
                },
                desc: `libraryVersion and empty notification subscription`,
            }, {
                data: {
                    libraryVersion: 1,
                    trustToken: `someToken`,
                    notificationVapidCredentials: {
                        publicKey: `someKey`,
                        privateKey: `someKey`
                    },
                    notificationSubscriptions: {
                        'http://some.endpoint': {
                            endpoint: `http://some.endpoint`,
                            keys: {
                                p256dh: `someKey`,
                                auth: `someAuth`
                            }
                        },
                        'http://some.other.endpoint': {
                            endpoint: `http://some.other.endpoint`,
                            keys: {
                                p256dh: `someOtherKey`,
                                auth: `someOtherAuth`
                            }
                        }
                    }
                },
                desc: `all keys and values`,
            }
        ])(`should validate a valid resource file: $desc`, ({data}) => {
            expect(() => validator.validateResourceFile(data)).not.toThrow();
        });

        test.each([
            {
                data: {
                    libraryVersion: `1`,
                },
                desc: `libraryVersion as string`,
            }, {
                data: {},
                desc: `empty object`,
            }, {
                data: {
                    libraryVersion: 1,
                    notificationVapidCredentials: {}
                },
                desc: `libraryVersion and empty VAPID Credentials`,
            }
        ])(`should throw an error for an invalid resource file: $desc`, ({data}) => {
            expect(() => validator.validateResourceFile(data)).toThrow(VALIDATOR_ERR.RESOURCE_FILE);
        });
    });

    describe(`validatePushSubscriptionRequest`, () => {
        test.each([
            {
                data: {
                    endpoint: `some.endpoint.com`,
                    keys: {
                        p256dh: `someKey`,
                        auth: `someAuth`
                    }
                },
                desc: `minimal push subscription`,
            }, {
                data: {
                    endpoint: `some.endpoint.com`,
                    expirationTime: 1,
                    keys: {
                        p256dh: `someKey`,
                        auth: `someAuth`
                    }
                },
                desc: `push subscription with expiration time`,
            }
        ])(`should validate a valid push subscription request: $desc`, ({data}) => {
            expect(() => validator.validatePushSubscription(data)).not.toThrow();
        });

        test.each([
            {
                data: {
                    endpoint: `some.endpoint.com`,
                    expirationTime: `1`,
                    keys: {
                        p256dh: `someKey`,
                        auth: `someAuth`
                    }
                },
                desc: `expiration time not a number`
            }, {
                data: {
                    endpoint: `some.endpoint.com`,
                    keys: {
                        p256dh: `somekey`,
                    }
                },
                desc: `auth missing`
            }, {
                data: {
                    endpoint: `some.endpoint.com`,
                    keys: {
                        auth: `someAuth`
                    }
                },
                desc: `p256dh missing`
            }, {
                data: {
                    keys: {
                        p256dh: `somekey`,
                        auth: `someAuth`
                    }
                },
                desc: `endpoint missing`
            },
        ])(`should throw an error for an invalid push subscription request: $desc`, ({data}) => {
            expect(() => validator.validatePushSubscription(data)).toThrow(VALIDATOR_ERR.PUSH_SUBSCRIPTION);
        });
    });

    describe(`validateSigninInitResponse`, () => {
        test.each([
            {
                data: {
                    data: {
                        iteration: 20403,
                        salt: `someSalt`,
                        protocol: `s2k`,
                        b: `someServerChallenge`,
                        c: `someSessionIdentifier`,
                    },
                    headers: {
                        scnt: `scntString`,
                    },
                },
                desc: `with s2k protocol`,
            }, {
                data: {
                    data: {
                        iteration: 20403,
                        salt: `someSalt`,
                        protocol: `s2k_fo`,
                        b: `someServerChallenge`,
                        c: `someSessionIdentifier`,
                    },
                    headers: {
                        scnt: `scntString`,
                    },
                },
                desc: `with s2k_fo protocol`,
            },
        ])(`should validate a valid signin init response: $desc`, ({data}) => {
            expect(() => validator.validateSigninInitResponse(data)).not.toThrow();
        });

        test.each([
            {
                data: {
                    data: {
                        salt: `someSalt`,
                        protocol: `s2k_fo`,
                        b: `someServerChallenge`,
                        c: `someSessionIdentifier`,
                    },
                    headers: {
                        scnt: `scntString`,
                    },
                },
                desc: `missing iteration`,
            }, {
                data: {
                    data: {
                        iteration: 20403,
                        protocol: `s2k_fo`,
                        b: `someServerChallenge`,
                        c: `someSessionIdentifier`,
                    },
                    headers: {
                        scnt: `scntString`,
                    },
                },
                desc: `missing salt`,
            }, {
                data: {
                    data: {
                        iteration: 20403,
                        salt: `someSalt`,
                        b: `someServerChallenge`,
                        c: `someSessionIdentifier`,
                    },
                    headers: {
                        scnt: `scntString`,
                    },
                },
                desc: `missing protocol`,
            }, {
                data: {
                    data: {
                        iteration: 20403,
                        salt: `someSalt`,
                        protocol: `fobar`,
                        b: `someServerChallenge`,
                        c: `someSessionIdentifier`,
                    },
                    headers: {
                        scnt: `scntString`,
                    },
                },
                desc: `invalid protocol`,
            }, {
                data: {
                    data: {
                        iteration: 20403,
                        salt: `someSalt`,
                        protocol: `s2k_fo`,
                        c: `someSessionIdentifier`,
                    },
                    headers: {
                        scnt: `scntString`,
                    },
                },
                desc: `missing b`,
            }, {
                data: {
                    data: {
                        iteration: 20403,
                        salt: `someSalt`,
                        protocol: `s2k_fo`,
                        c: `someSessionIdentifier`,
                    },
                    headers: {
                        scnt: `scntString`,
                    },
                },
                desc: `missing c`,
            }, {
                data: {
                    data: {
                        iteration: 20403,
                        salt: `someSalt`,
                        protocol: `s2k_fo`,
                        b: `someServerChallenge`,
                        c: `someSessionIdentifier`,
                    },
                    headers: {},
                },
                desc: `missing scnt`,
            }, {
                data: {
                    data: {
                        iteration: 20403,
                        salt: `someSalt`,
                        protocol: `s2k_fo`,
                        b: `someServerChallenge`,
                        c: `someSessionIdentifier`,
                    },
                },
                desc: `missing headers`,
            }, {
                data: {
                    headers: {
                        scnt: `scntString`,
                    },
                },
                desc: `missing data`,
            },
        ])(`should throw an error for an invalid signin init response: $desc`, ({data}) => {
            expect(() => validator.validateSigninInitResponse(data)).toThrow(VALIDATOR_ERR.SIGNIN_INIT_RESPONSE);
        });
    });

    describe(`validateSigninResponse`, () => {
        test.each([
            {
                data: {
                    data: {
                        authType: `hsa2`,
                    },
                    headers: {
                        scnt: `scntString`,
                        'x-apple-session-token': `sessionToken`,
                        'set-cookie': [`aasp=123`],
                    },
                },
            },
        ])(`should validate a valid signin response`, ({data}) => {
            expect(() => validator.validateSigninResponse(data)).not.toThrow();
        });

        test.each([
            {
                data: {
                    data: {},
                    headers: {
                        scnt: `scntString`,
                        'x-apple-session-token': `sessionToken`,
                        'set-cookie': [`AASP=123`],
                    },
                },
                desc: `missing auth type in body`,
            }, {
                data: {
                    data: {
                        authType: `hsa2`,
                    },
                    headers: {
                        'x-apple-session-token': `sessionToken`,
                        'set-cookie': [`AASP=123`],
                    },
                },
                desc: `missing scnt header value`,
            }, {
                data: {
                    data: {
                        authType: `hsa2`,
                    },
                    headers: {
                        scnt: `scntString`,
                        'set-cookie': [`AASP=123`],
                    },
                },
                desc: `missing session token in headers`,
            }, {
                data: {
                    data: {
                        authType: `hsa2`,
                    },
                    headers: {
                        scnt: `scntString`,
                        'x-apple-session-token': `sessionToken`,
                    },
                },
                desc: `missing set-cookie headers`,
            }, {
                data: {
                    data: {
                        authType: `hsa2`,
                    },
                    headers: {
                        scnt: `scntString`,
                        'x-apple-session-token': `sessionToken`,
                        'set-cookie': [`aasp1=123`, `aasp2=123`],
                    },
                },
                desc: `too many aasp set-cookie header`,
            },
        ])(`should throw an error for an invalid signin response: $desc`, ({data}) => {
            expect(() => validator.validateSigninResponse(data)).toThrow(VALIDATOR_ERR.SIGNIN_RESPONSE);
        });
    });

    describe(`validateResendMFADeviceResponse`, () => {
        test(`should validate a valid resend MFA device response`, () => {
            const data: ResendMFADeviceResponse = {
                data: {
                    trustedDeviceCount: 1,
                    securityCode: {
                        length: 6,
                        tooManyCodesSent: false,
                        tooManyCodesValidated: false,
                        securityCodeLocked: false,
                        securityCodeCooldown: false,
                    },
                    phoneNumberVerification: {
                        trustedPhoneNumber: {
                            id: 1,
                            numberWithDialCode: `+1234567890`,
                            pushMode: `sms`,
                            obfuscatedNumber: `***-***-7890`,
                            lastTwoDigits: `90`,
                        },
                        trustedPhoneNumbers: [{
                            id: 1,
                            numberWithDialCode: `+1234567890`,
                            pushMode: `sms`,
                            obfuscatedNumber: `***-***-7890`,
                            lastTwoDigits: `90`,
                        }],
                        securityCode: {
                            length: 6,
                            tooManyCodesSent: false,
                            tooManyCodesValidated: false,
                            securityCodeLocked: false,
                            securityCodeCooldown: false,
                        },
                        authenticationType: `hsa2`,
                        hsa2Account: true,
                        restrictedAccount: false,
                    },
                },
            };
            expect(() => validator.validateResendMFADeviceResponse(data)).not.toThrow();
        });

        test.each([{
            data: {
                data: {
                    trustedDeviceCount: 0,
                    securityCode: {
                        length: 6,
                        tooManyCodesSent: false,
                        tooManyCodesValidated: false,
                        securityCodeLocked: false,
                        securityCodeCooldown: false,
                    },
                    phoneNumberVerification: {
                        trustedPhoneNumber: {
                            id: 1,
                            numberWithDialCode: `+1234567890`,
                            pushMode: `sms`,
                            obfuscatedNumber: `***-***-7890`,
                            lastTwoDigits: `90`,
                        },
                        trustedPhoneNumbers: [{
                            id: 1,
                            numberWithDialCode: `+1234567890`,
                            pushMode: `sms`,
                            obfuscatedNumber: `***-***-7890`,
                            lastTwoDigits: `90`,
                        }],
                        securityCode: {
                            length: 6,
                            tooManyCodesSent: false,
                            tooManyCodesValidated: false,
                            securityCodeLocked: false,
                            securityCodeCooldown: false,
                        },
                        authenticationType: `hsa2`,
                        hsa2Account: true,
                        restrictedAccount: false,
                    },
                },
            },
            desc: `no trusted devices`,
        }, {
            data: {
                data: {
                    trustedDeviceCount: 0,
                    securityCode: {
                        length: 5,
                        tooManyCodesSent: false,
                        tooManyCodesValidated: false,
                        securityCodeLocked: false,
                        securityCodeCooldown: false,
                    },
                    phoneNumberVerification: {
                        trustedPhoneNumber: {
                            id: 1,
                            numberWithDialCode: `+1234567890`,
                            pushMode: `sms`,
                            obfuscatedNumber: `***-***-7890`,
                            lastTwoDigits: `90`,
                        },
                        trustedPhoneNumbers: [{
                            id: 1,
                            numberWithDialCode: `+1234567890`,
                            pushMode: `sms`,
                            obfuscatedNumber: `***-***-7890`,
                            lastTwoDigits: `90`,
                        }],
                        securityCode: {
                            length: 5,
                            tooManyCodesSent: false,
                            tooManyCodesValidated: false,
                            securityCodeLocked: false,
                            securityCodeCooldown: false,
                        },
                        authenticationType: `hsa2`,
                        hsa2Account: true,
                        restrictedAccount: false,
                    },
                },
            },
            desc: `invalid security code format`,
        }, {
            data: {
                data: {
                    trustedDeviceCount: 1,
                    securityCode: {
                        length: 6,
                        tooManyCodesSent: false,
                        tooManyCodesValidated: false,
                        securityCodeLocked: false,
                        securityCodeCooldown: false,
                    },
                    phoneNumberVerification: {
                        trustedPhoneNumber: {},
                        trustedPhoneNumbers: [],
                        securityCode: {
                            length: 6,
                            tooManyCodesSent: false,
                            tooManyCodesValidated: false,
                            securityCodeLocked: false,
                            securityCodeCooldown: false,
                        },
                        authenticationType: `hsa2`,
                        hsa2Account: true,
                        restrictedAccount: false,
                    },
                },
            },
            desc: `no trusted phone numbers`,
        }])(`should throw an error for an invalid resend MFA device response: $desc`, ({data}) => {
            expect(() => validator.validateResendMFADeviceResponse(data)).toThrow(VALIDATOR_ERR.RESEND_MFA_DEVICE_RESPONSE);
        });
    });

    describe(`validateResendMFAPhoneResponse`, () => {
        test(`should validate a valid resend MFA phone response`, () => {
            const data: ResendMFAPhoneResponse = {
                data: {
                    trustedPhoneNumber: {
                        id: 1,
                        numberWithDialCode: `+1234567890`,
                        pushMode: `sms`,
                        obfuscatedNumber: `***-***-7890`,
                        lastTwoDigits: `90`,
                    },
                    trustedPhoneNumbers: [{
                        id: 1,
                        numberWithDialCode: `+1234567890`,
                        pushMode: `sms`,
                        obfuscatedNumber: `***-***-7890`,
                        lastTwoDigits: `90`,
                    }],
                    securityCode: {
                        length: 6,
                        tooManyCodesSent: false,
                        tooManyCodesValidated: false,
                        securityCodeLocked: false,
                        securityCodeCooldown: false,
                    },
                    authenticationType: `hsa2`,
                    hsa2Account: true,
                    restrictedAccount: false,
                },
            };
            expect(() => validator.validateResendMFAPhoneResponse(data)).not.toThrow();
        });

        test.each([{
            data: {
                data: {
                    trustedPhoneNumber: {
                        id: 1,
                        numberWithDialCode: `+1234567890`,
                        pushMode: `new`,
                        obfuscatedNumber: `***-***-7890`,
                        lastTwoDigits: `90`,
                    },
                    trustedPhoneNumbers: [{
                        id: 1,
                        numberWithDialCode: `+1234567890`,
                        pushMode: `new`,
                        obfuscatedNumber: `***-***-7890`,
                        lastTwoDigits: `90`,
                    }],
                    securityCode: {
                        length: 6,
                        tooManyCodesSent: false,
                        tooManyCodesValidated: false,
                        securityCodeLocked: false,
                        securityCodeCooldown: false,
                    },
                    authenticationType: `hsa2`,
                    hsa2Account: true,
                    restrictedAccount: false,
                },
            },
            desc: `invalid push mode`,
        }, {
            data: {
                data: {
                    trustedPhoneNumber: {
                        id: 1,
                        numberWithDialCode: `+1234567890`,
                        pushMode: `sms`,
                        obfuscatedNumber: `***-***-7890`,
                        lastTwoDigits: `90`,
                    },
                    trustedPhoneNumbers: [{
                        id: 1,
                        numberWithDialCode: `+1234567890`,
                        pushMode: `sms`,
                        obfuscatedNumber: `***-***-7890`,
                        lastTwoDigits: `90`,
                    }],
                    securityCode: {
                        length: 5,
                        tooManyCodesSent: false,
                        tooManyCodesValidated: false,
                        securityCodeLocked: false,
                        securityCodeCooldown: false,
                    },
                    authenticationType: `hsa2`,
                    hsa2Account: true,
                    restrictedAccount: false,
                },
            },
            desc: `invalid security code format`,
        }])(`should throw an error for an invalid resend MFA phone response: $desc`, ({data}) => {
            expect(() => validator.validateResendMFAPhoneResponse(data)).toThrow(VALIDATOR_ERR.RESEND_MFA_PHONE_RESPONSE);
        });
    });

    describe(`validateTrustResponse`, () => {
        test(`should validate a valid trust response`, () => {
            const data: TrustResponse = {
                headers: {
                    'x-apple-twosv-trust-token': "someTrustToken", // eslint-disable-line
                    'x-apple-session-token': "someSessionToken", // eslint-disable-line
                },
            };
            expect(() => validator.validateTrustResponse(data)).not.toThrow();
        });

        test.each([
            {
                data: {
                    headers: {
                        'x-apple-twosv-trust-token': "someTrustToken", // eslint-disable-line
                    },
                },
                desc: `missing session token`,
            }, {
                data: {
                    headers: {
                        'x-apple-twosv-trust-token': "someTrustToken", // eslint-disable-line
                        'x-apple-session-token': "", // eslint-disable-line
                    },
                },
                desc: `empty session token`,
            },
        ])(`should throw an error for an invalid trust response: $desc`, ({data}) => {
            expect(() => validator.validateTrustResponse(data)).toThrow(VALIDATOR_ERR.TRUST_RESPONSE);
        });
    });

    describe(`validateSetupResponse`, () => {
        test(`should validate a valid setup response with PCS required`, () => {
            const data = {
                headers: getICloudCookieHeader(),
                data: {
                    dsInfo: {
                        isWebAccessAllowed: true,
                    },
                    webservices: {
                        ckdatabasews: {
                            url: Config.photosDomain,
                            pcsRequired: true,
                            status: `active`,
                        },
                    },
                },
            };
            expect(() => validator.validateSetupResponse(data)).not.toThrow();
        });

        test(`should validate a valid setup response without PCS required`, () => {
            const data = {
                headers: getICloudCookieHeader(),
                data: {
                    dsInfo: {
                        isWebAccessAllowed: true,
                    },
                    webservices: {
                        ckdatabasews: {
                            url: Config.photosDomain,
                            status: `active`,
                        },
                    },
                },
            };
            expect(() => validator.validateSetupResponse(data)).not.toThrow();
        });

        test.each([
            {
                data: {
                    headers: getICloudCookieHeader(),
                    data: {
                        dsInfo: {
                            isWebAccessAllowed: false,
                        },
                        webservices: {
                            ckdatabasews: {
                                url: Config.photosDomain,
                                status: `active`,
                            },
                        },
                    },
                },
                desc: `web access not allowed`,
            }, {
                data: {
                    headers: getICloudCookieHeader(),
                    data: {
                        dsInfo: {},
                        webservices: {
                            ckdatabasews: {
                                url: Config.photosDomain,
                                status: `active`,
                            },
                        },
                    },
                },
                desc: `missing dsInfo`,
            }, {
                data: {
                    headers: getICloudCookieHeader(),
                    data: {
                        dsInfo: {
                            isWebAccessAllowed: true,
                        },
                        webservices: {},
                    },
                },
                desc: `missing webservices`,
            }, {
                data: {
                    headers: getICloudCookieHeader(),
                    data: {
                        dsInfo: {
                            isWebAccessAllowed: true,
                        },
                        webservices: {
                            ckdatabasews: {
                                url: Config.photosDomain,
                                status: `inactive`,
                            },
                        },
                    },
                },
                desc: `inactive ckdatabasews`,
            }, {
                data: {
                    headers: getICloudCookieHeader(),
                    data: {
                        dsInfo: {
                            isWebAccessAllowed: true,
                        },
                        webservices: {
                            ckdatabasews: {
                                url: Config.photosDomain,
                            },
                        },
                    },
                },
                desc: `missing status`,
            }, {
                data: {
                    headers: getICloudCookieHeader(),
                    data: {
                        dsInfo: {
                            isWebAccessAllowed: true,
                        },
                        webservices: {
                            ckdatabasews: {
                                status: `active`,
                            },
                        },
                    },
                },
                desc: `missing url`,
            }, {
                data: {
                    headers: getICloudCookieHeader(),
                    data: {
                        dsInfo: {
                            isWebAccessAllowed: true,
                        },
                        webservices: {
                            ckdatabasews: {},
                        },
                    },
                },
                desc: `missing url and status`,
            }, {
                data: {
                    headers: getICloudCookieHeader(),
                    data: {},
                },
                desc: `missing dsInfo and webservices`,
            }, {
                data: {
                    data: {
                        headers: ``,
                        dsInfo: {
                            isWebAccessAllowed: true,
                        },
                        webservices: {
                            ckdatabasews: {
                                url: Config.photosDomain,
                                status: `active`,
                            },
                        },
                    },
                },
                desc: `missing headers`,
            }, {
                data: {
                    data: {
                        headers: {
                            "set-cookie": [
                                `nonAppleCookie=123`,
                            ],
                        },
                        dsInfo: {
                            isWebAccessAllowed: true,
                        },
                        webservices: {
                            ckdatabasews: {
                                url: Config.photosDomain,
                                status: `active`,
                            },
                        },
                    },
                },
                desc: `invalid cookies`,
            },
        ])(`should throw an error for an invalid setup response: $desc`, ({data}) => {
            expect(() => validator.validateSetupResponse(data)).toThrow(VALIDATOR_ERR.SETUP_RESPONSE);
        });
    });

    describe(`validatePCSResponse`, () => {
        test.each([{
            data: {
                headers: {},
                data: {
                    isWebAccessAllowed: true,
                    isDeviceConsentedForPCS: true,
                    message: `Cookies attached.`,
                    deviceConsentForPCSExpiry: 1234,
                    status: `success`,
                },
            },
            desc: `cookies attached`,
        }, {
            data: {
                headers: {},
                data: {
                    isWebAccessAllowed: true,
                    isDeviceConsentedForPCS: true,
                    message: `Cookies already present.`,
                    deviceConsentForPCSExpiry: 1234,
                    status: `success`,
                },
            },
            desc: `cookies already present`,
        }, {
            data: {
                headers: {},
                data: {
                    isWebAccessAllowed: true,
                    isDeviceConsentedForPCS: false,
                    isICDRSDisabled: true,
                    message: `Requested a new device arming to upload cookies.`,
                    deviceConsentForPCSExpiry: 0,
                    status: `failure`,
                },
            },
            desc: `arming cookie upload`,
        }, {
            data: {
                headers: getICloudCookieHeader(),
                data: {
                    isWebAccessAllowed: true,
                    isDeviceConsentedForPCS: true,
                    isICDRSDisabled: true,
                    message: `Requested the device to upload cookies.`,
                    deviceConsentForPCSExpiry: 1700837123728,
                    status: `failure`,
                },
            },
            desc: `cookie upload request`,
        }])(`should validate a valid PCS response: $desc`, ({data}) => {
            expect(() => validator.validatePCSResponse(data)).not.toThrow();
        });

        test.each([
            {
                data: {
                    headers: getICloudCookieHeader(),
                    data: {
                        isWebAccessAllowed: false,
                        message: `Cookies already present.`,
                        status: `success`,
                    },
                },
                desc: `web access not allowed`,
            }, {
                data: {
                    headers: getICloudCookieHeader(),
                    data: {
                        message: `Cookies already present.`,
                        deviceConsentForPCSExpiry: 1234,
                        status: `success`,
                    },
                },
                desc: `web access missing`,
            }, {
                data: {
                    headers: getICloudCookieHeader(),
                    data: {
                        isWebAccessAllowed: true,
                        status: `success`,
                    },
                },
                desc: `message missing`,
            },
        ])(`should throw an error for an invalid PCS response: $desc`, ({data}) => {
            expect(() => validator.validatePCSResponse(data)).toThrow(VALIDATOR_ERR.PCS_RESPONSE);
        });
    });

    describe(`validatePhotosSetupResponse`, () => {
        test.each([
            {
                data: {
                    data: {
                        moreComing: false,
                        syncToken: `someToken`,
                        zones: [
                            {
                                zoneID: {
                                    zoneName: `PrimarySync`,
                                    ownerRecordName: `someOwnerId`,
                                    zoneType: `REGULAR_CUSTOM_ZONE`,
                                },
                            },
                        ],
                    },
                },
                desc: `valid primary zone`,
            }, {
                data: {
                    data: {
                        moreComing: false,
                        syncToken: `someToken`,
                        zones: [
                            {
                                zoneID: {
                                    zoneName: `PrimarySync`,
                                    ownerRecordName: `someOwnerId`,
                                    zoneType: `REGULAR_CUSTOM_ZONE`,
                                },
                            }, {
                                zoneID: {
                                    zoneName: `SharedSync-12345678-1234-1234-1234-123456789012`,
                                    ownerRecordName: `someOwnerId`,
                                    zoneType: `REGULAR_CUSTOM_ZONE`,
                                },
                            },
                        ],
                    },
                },
                desc: `valid primary and shared zone`,
            }, {
                data: {
                    data: {
                        moreComing: false,
                        syncToken: `someToken`,
                        zones: [
                            {
                                zoneID: {
                                    zoneName: `PrimarySync`,
                                    ownerRecordName: `someOwnerId`,
                                    zoneType: `REGULAR_CUSTOM_ZONE`,
                                },
                            }, {
                                zoneID: {
                                    zoneName: `CMM-12345678-1234-1234-1234-123456789012`,
                                    ownerRecordName: `someOwnerId`,
                                    zoneType: `REGULAR_CUSTOM_ZONE`,
                                },
                            },
                        ],
                    },
                },
                desc: `valid primary, shared zone and CMM zone`,
            }, {
                data: {
                    data: {
                        moreComing: false,
                        syncToken: `someToken`,
                        zones: [
                            {
                                zoneID: {
                                    zoneName: `PrimarySync`,
                                    ownerRecordName: `someOwnerId`,
                                    zoneType: `REGULAR_CUSTOM_ZONE`,
                                },
                                deleted: true,
                            },
                        ],
                    },
                },
                desc: `zone marked as deleted`,
            },{
                data: {
                    data: {
                        moreComing: false,
                        syncToken: `someToken`,
                        zones: [],
                    },
                },
                desc: `no zones`,
            }
        ])(`should validate a valid photos setup response: $desc`, ({data}) => {
            expect(() => validator.validatePhotosSetupResponse(data)).not.toThrow();
        });

        test.each([
            {
                data: {
                    data: {
                        moreComing: true,
                        syncToken: `someToken`,
                        zones: [
                            {
                                zoneID: {
                                    zoneName: `PrimarySync`,
                                    ownerRecordName: `someOwnerId`,
                                    zoneType: `REGULAR_CUSTOM_ZONE`,
                                },
                            },
                        ],
                    },
                },
                desc: `moreComing is true`,
            }, {
                data: {
                    data: {
                        moreComing: false,
                        syncToken: ``,
                        zones: [
                            {
                                zoneID: {
                                    zoneName: `PrimarySync`,
                                    ownerRecordName: `someOwnerId`,
                                    zoneType: `REGULAR_CUSTOM_ZONE`,
                                },
                            },
                        ],
                    },
                },
                desc: `syncToken is empty`,
            }, {
                data: {
                    data: {
                        moreComing: false,
                        zones: [
                            {
                                zoneID: {
                                    zoneName: `PrimarySync`,
                                    ownerRecordName: `someOwnerId`,
                                    zoneType: `REGULAR_CUSTOM_ZONE`,
                                },
                            },
                        ],
                    },
                },
                desc: `syncToken is missing`,
            }, {
                data: {
                    data: {
                        moreComing: false,
                        syncToken: `someToken`,
                        zones: [
                            {
                                zoneID: {
                                    zoneName: `PrimarySync`,
                                    ownerRecordName: `someOwnerId`,
                                    zoneType: `WEIRD_ZONE`,
                                },
                            },
                        ],
                    },
                },
                desc: `zoneType is invalid`,
            }, {
                data: {
                    data: {
                        moreComing: false,
                        syncToken: `someToken`,
                        zones: [
                            {
                                zoneID: {
                                    zoneName: `PrimarySync`,
                                    ownerRecordName: `someOwnerId`,
                                },
                            },
                        ],
                    },
                },
                desc: `zoneType is missing`,
            }, {
                data: {
                    data: {
                        moreComing: false,
                        syncToken: `someToken`,
                        zones: [
                            {
                                zoneID: {
                                    zoneName: ``,
                                    ownerRecordName: `someOwnerId`,
                                    zoneType: `REGULAR_CUSTOM_ZONE`,
                                },
                            },
                        ],
                    },
                },
                desc: `zoneName is invalid`,
            }, {
                data: {
                    data: {
                        moreComing: false,
                        syncToken: `someToken`,
                        zones: [
                            {
                                zoneID: {
                                    ownerRecordName: `someOwnerId`,
                                    zoneType: `REGULAR_CUSTOM_ZONE`,
                                },
                            },
                        ],
                    },
                },
                desc: `zoneName is missing`,
            }, {
                data: {
                    data: {
                        moreComing: false,
                        syncToken: `someToken`,
                        zones: [
                            {
                                zoneID: {
                                    zoneName: `PrimarySync`,
                                    ownerRecordName: ``,
                                    zoneType: `REGULAR_CUSTOM_ZONE`,
                                },
                            },
                        ],
                    },
                },
                desc: `ownerRecordName is empty`,
            }, {
                data: {
                    data: {
                        moreComing: false,
                        syncToken: `someToken`,
                        zones: [
                            {
                                zoneID: {
                                    zoneName: `PrimarySync`,
                                    zoneType: `REGULAR_CUSTOM_ZONE`,
                                },
                            },
                        ],
                    },
                },
                desc: `ownerRecordName is missing`,
            } 
        ])(`should throw an error for an invalid photos setup response: $desc`, ({data}) => {
            expect(() => validator.validatePhotosSetupResponse(data)).toThrow(VALIDATOR_ERR.PHOTOS_SETUP_RESPONSE);
        });
    });
});