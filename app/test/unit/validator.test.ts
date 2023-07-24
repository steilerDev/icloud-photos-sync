import {describe, test, expect, beforeEach} from '@jest/globals';
import {Validator} from '../../src/lib/resource-manager/validator';
import {ResourceFile} from '../../src/lib/resource-manager/resources';
import {VALIDATOR_ERR} from '../../src/app/error/error-codes';
import {ResendMFADeviceResponse, ResendMFAPhoneResponse} from '../../src/lib/resource-manager/network';

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
            },
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
            },
        ])(`should throw an error for an invalid resource file: $desc`, ({data}) => {
            expect(() => validator.validateResourceFile(data)).toThrowError(VALIDATOR_ERR.RESOURCE_FILE);
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
                        'set-cookie': [`SOME_COOKIE=123`],
                    },
                },
                desc: `missing aasp set-cookie header`,
            },
        ])(`should throw an error for an invalid signin response: $desc`, ({data}) => {
            expect(() => validator.validateSigninResponse(data)).toThrowError(VALIDATOR_ERR.SIGNIN_RESPONSE);
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
            expect(() => validator.validateResendMFADeviceResponse(data)).toThrowError(VALIDATOR_ERR.RESEND_MFA_DEVICE_RESPONSE);
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
            expect(() => validator.validateResendMFAPhoneResponse(data)).toThrowError(VALIDATOR_ERR.RESEND_MFA_PHONE_RESPONSE);
        });
    });

    //   Describe('validateTrustResponse', () => {
    //     it('should validate a valid trust response', () => {
    //       const data: TrustResponse = {
    //         status: 'success',
    //       };
    //       expect(() => validator.validateTrustResponse(data)).not.toThrow();
    //     });

    //     it('should throw an error for an invalid trust response', () => {
    //       const data = {
    //         status: 'invalid',
    //       };
    //       expect(() => validator.validateTrustResponse(data)).toThrow(iCPSError);
    //       expect(() => validator.validateTrustResponse(data)).toThrowError(VALIDATOR_ERR.TRUST_RESPONSE);
    //     });
    //   });

    //   describe('validateSetupResponse', () => {
    //     it('should validate a valid setup response', () => {
    //       const data: SetupResponse = {
    //         headers: {
    //           'set-cookie': ['X-APPLE-WEBAUTH-HSA-SESSION=123'],
    //         },
    //       };
    //       expect(() => validator.validateSetupResponse(data)).not.toThrow();
    //     });

    //     it('should throw an error for an invalid setup response', () => {
    //       const data = {
    //         headers: {},
    //       };
    //       expect(() => validator.validateSetupResponse(data)).toThrow(iCPSError);
    //       expect(() => validator.validateSetupResponse(data)).toThrowError(VALIDATOR_ERR.SETUP_RESPONSE);
    //     });
    //   });

    //   describe('validatePhotosSetupResponse', () => {
    //     it('should validate a valid photos setup response', () => {
    //       const data: PhotosSetupResponse = {
    //         status: 'success',
    //       };
    //       expect(() => validator.validatePhotosSetupResponse(data)).not.toThrow();
    //     });

//     it('should throw an error for an invalid photos setup response', () => {
//       const data = {
//         status: 'invalid',
//       };
//       expect(() => validator.validatePhotosSetupResponse(data)).toThrow(iCPSError);
//       expect(() => validator.validatePhotosSetupResponse(data)).toThrowError(VALIDATOR_ERR.PHOTOS_SETUP_RESPONSE);
//     });
//   });
});