
import {createHash} from 'crypto';
import {describe, test, beforeEach, expect} from '@jest/globals';
import {MockedResourceManager, prepareResources} from '../_helpers/_general';
import {iCloudCrypto} from '../../src/lib/icloud/icloud.crypto';
import {SRPProtocol} from '../../src/lib/resources/network-types';

let mockedResourceManager: MockedResourceManager;

beforeEach(() => {
    const instances = prepareResources()!;
    mockedResourceManager = instances.manager;
});

describe(`constructor`, () => {
    test(`should create a new crypto object`, async () => {
        const icloudCrypto = new iCloudCrypto();

        expect(icloudCrypto.accountName).toEqual(mockedResourceManager.username);
        expect(icloudCrypto.privateValue).toBeGreaterThan(0n);
        expect(icloudCrypto.publicValue).toBeGreaterThan(0n);
        expect(icloudCrypto.sessionKey).toBeUndefined();
    });

    test(`should generate random private values`, () => {
        expect(new iCloudCrypto().privateValue).not.toEqual(new iCloudCrypto().privateValue);
    });

    test(`should always provide the client ephemeral padded to the length of N`, async () => {
        // Private value 1 results in A = g = 2, which needs to be padded to 256 bytes
        const icloudCrypto = new iCloudCrypto(`test@icloud.com`, 1n);
        const clientEphemeral = Buffer.from(await icloudCrypto.getClientEphemeral(), `base64`);

        expect(clientEphemeral.length).toBe(256);
        expect(clientEphemeral[255]).toBe(2);
        expect(clientEphemeral.subarray(0, 255).every(byte => byte === 0)).toBeTruthy();
    });

    test(`should not provide session key before generating proof values`, async () => {
        await expect(new iCloudCrypto().getSessionKey()).rejects.toThrow(/^Session key not available before generating proof values$/);
    });

    test.each([
        {desc: `zero`, serverPublicValue: Buffer.alloc(256).toString(`base64`)},
        {desc: `multiple of N`, serverPublicValue: Buffer.from(`AC6BDB41324A9A9BF166DE5E1389582FAF72B6651987EE07FC3192943DB56050A37329CBB4A099ED8193E0757767A13DD52312AB4B03310DCD7F48A9DA04FD50E8083969EDB767B0CF6095179A163AB3661A05FBD5FAAAE82918A9962F0B93B855F97993EC975EEAA80D740ADBF4FF747359D041D5C33EA71D281E446B14773BCA97B43A23FB801676BD207A436C6481F1D2B9078717461A5B9D32E688F87748544523B524B0D57D5EA77A2775D2ECFA032CFBDBF52FB3786160279004E57AE6AF874E7303CE53299CCC041C7BC308D82A5698F3A8D0C38271AE35F8E9DBFBB694B5C803D89F7AE435DE236D525F54759B65E372FCD68EF20FA7111F9E4AFF73`, `hex`).toString(`base64`)},
    ])(`should reject invalid server public value: $desc`, async ({serverPublicValue}) => {
        await expect(new iCloudCrypto().getProofValues(new Uint8Array(32), serverPublicValue, `c2FsdA==`)).rejects.toThrow(/^Invalid server public value$/);
    });
});

// Testing by using known good values from the iCloud API
describe.each([
    {
        clientSeed: 6890458421263271134402527905664023128970574238401735181316208349130294425194030272923176221123175111284410050105182012064914615638511118563376424410396077247837630491042390822875998544481905612640532561392642924163293659547193862696423841442804628972455159653749138002018339462790408400886651675191363385673445972792553929882924537345001389984703219186419763085040666451273997938784751676125533921014699362104900250769969879686062041867725344554417256951627285212117165488519048563216749723980304928707578373512896620687974942485614711667338735298519701374178873163381284898575130291172102593207323106341652628126448n,
        clientEphemeral: `ZkV+rXv+QSLrX5QowT1kXhGsnAf3eOwcD+N0erUBK1iCSRgKWgn/bBh4CvcYpmWm7zDgIRvFpwoxhrZxbHZYHzGaikwcTiJ/bdOWs/7cNatUuGy5d94YjMLZ0QIsSBSZq7OgO9Q5LU6QBW/fp6Z6qfNB3Rq03tCitZ6IU4JzqePbTNhor7eHiOl3OdTcwtFLaa6xrEVxBFkEN5PQOpnohSLWJmpqI8lpDkhePHENTkRZakwZARQhmNZ7aUbF+mBRR9v6PcQKDoDaXQuA4HOD2Gx6gwUfvLwq8yyPFf5RIUeVqIZIb7qvI32vR6iBhD6eKQgnAYbv8MooA+JDtk77ow==`,
        protocol: `s2k`,
        salt: `foI2z4yTi2LkZ+Wrr7HFEQ==`,
        iterations: 20403,
        serverPublicValue: `MpKgjml5xFojqbBERp8Rl0GpHzdHhuiNIEkCx9tl0Wpk4zo5MxhTC34b0HnUXPCtIlHTWUUz00n2JyhySIQ+SGprKa/wkod8NzxjeorKuOx/+wsPqS/jZTfb8i9t5iW5lVB7eROg8QYB4gsIn8Bk9zWYExFuuPgL1iYAthYHOlmwAKqsRDX/gSumv0TznUGp9GDrhd9MSXrfIBAY2GN5LPNMR7N84h76PRLF7BgNff7BwC2YLOHVccDb9Axkl5CEuvRxEHx454ju7DtUdinFlZRT7zo4DnLv9msUCubl6djnz/ojhsK+apEw6nHJGT+NhNUsMimfS2Ci4gzTdkey0Q==`,
        m1: `coyV+RHVthWQnlSLUkKhacb66BZSYknWk4Qor/mdoXk=`,
        m2: `w33fr1kA6h+CNOILqTdVfprACbbZiIWNuh6gGHICfgA=`,
    }, {
        clientSeed: 4583464597706057374074568200686733333845316356957220074367768845250116954003020789631509921160041128250281115189321084127530556466418206894891765906279948360470987821066372075131278941770946795626302727478894190131926680682722191273867216250892152543053567943074039877468968328059297735718354983367158283181087322686097141645793870364626344374302246144622606785340696269402880773974149060918050546459694416131751963256042025191510245022814863735411041522861008849293340319607550193092573656363442241160172566724626024492443228367796159771603009300820441703601914229690671456525732449870676671357654372201494514766191n,
        clientEphemeral: `PiY5BMLVXefOjGLtyIW7kpczDJ1xnQa3Re10mramFNJxbpGoZGIIpp/Kt95pUaptMnI93vMs6SiUdUe1956SNjywGCO1HpXepYM9jbDtmaKRrBCoDF8JuCuzPdfYklBY2LfkdjHhDFc0PgosI8CFJ1Rv55fTmGgTkWACQjvjJRU9n1uYqSwej8R3xHy2v0VkT6oRYDm7ZXaiUnI2k9nuVgrD20M2vVzGc6an+Kb3BFYB0BqfqqMGiYkTKAvkc8ohOL54q1HKVAYKdR8KnUQRjSiEGbvVhpvJJc+YSYlrEs6st24IbH7EWyHweoCAHP6soVqtp1DX6ncQxm3iJ9Nwsw==`,
        protocol: `s2k`,
        salt: `foI2z4yTi2LkZ+Wrr7HFEQ==`,
        iterations: 20403,
        serverPublicValue: `b44vF54k7KDvvfIeQyEUk90ahsajSqdEv/4kiv/CdPGk0Wf3oVMlGfdrdZtAUrYWD6jzVc4BKbkqsIwZFK7v5o7/bYxYgzllPG5LXO0Ve5Zs4DgZPjFNzb9Ky7kFtC8gl7D5dKmGTxwwiEPRvE6SlmUWOhHTUg2q3EN7cRXV8HkdrYkNONT4ndHKHEuMV6BlVGuNdYDGMSOGidVK1uW1MwxRIzKWZSJLmF4PzUuvT89QWoFzNbDlVRc2R6Xa+sqjMUC9GM5UKcdug9RMLgj7xNXg5HR3HgVyCMe22woaYhpLP1Ak/VpOknXmnBKvEtWu2TIQggEof8CeqasYM8G8qw==`,
        m1: `c7xNNtQ02CHddhMYWL8AyB9jRmztWI0qfS/kNSI3by8=`,
        m2: `yG2kI90zLXED2pa6BmrAo9J7Ux2qiv6y/GtkblxsZhU=`,
    }, { // S2k_fo is hypothetical, because cannot force iCloud
        clientSeed: 4583464597706057374074568200686733333845316356957220074367768845250116954003020789631509921160041128250281115189321084127530556466418206894891765906279948360470987821066372075131278941770946795626302727478894190131926680682722191273867216250892152543053567943074039877468968328059297735718354983367158283181087322686097141645793870364626344374302246144622606785340696269402880773974149060918050546459694416131751963256042025191510245022814863735411041522861008849293340319607550193092573656363442241160172566724626024492443228367796159771603009300820441703601914229690671456525732449870676671357654372201494514766191n,
        clientEphemeral: `PiY5BMLVXefOjGLtyIW7kpczDJ1xnQa3Re10mramFNJxbpGoZGIIpp/Kt95pUaptMnI93vMs6SiUdUe1956SNjywGCO1HpXepYM9jbDtmaKRrBCoDF8JuCuzPdfYklBY2LfkdjHhDFc0PgosI8CFJ1Rv55fTmGgTkWACQjvjJRU9n1uYqSwej8R3xHy2v0VkT6oRYDm7ZXaiUnI2k9nuVgrD20M2vVzGc6an+Kb3BFYB0BqfqqMGiYkTKAvkc8ohOL54q1HKVAYKdR8KnUQRjSiEGbvVhpvJJc+YSYlrEs6st24IbH7EWyHweoCAHP6soVqtp1DX6ncQxm3iJ9Nwsw==`,
        protocol: `s2k_fo`,
        salt: `foI2z4yTi2LkZ+Wrr7HFEQ==`,
        iterations: 20403,
        serverPublicValue: `b44vF54k7KDvvfIeQyEUk90ahsajSqdEv/4kiv/CdPGk0Wf3oVMlGfdrdZtAUrYWD6jzVc4BKbkqsIwZFK7v5o7/bYxYgzllPG5LXO0Ve5Zs4DgZPjFNzb9Ky7kFtC8gl7D5dKmGTxwwiEPRvE6SlmUWOhHTUg2q3EN7cRXV8HkdrYkNONT4ndHKHEuMV6BlVGuNdYDGMSOGidVK1uW1MwxRIzKWZSJLmF4PzUuvT89QWoFzNbDlVRc2R6Xa+sqjMUC9GM5UKcdug9RMLgj7xNXg5HR3HgVyCMe22woaYhpLP1Ak/VpOknXmnBKvEtWu2TIQggEof8CeqasYM8G8qw==`,
        m1: `NwPNryBXly69Pj+iD1+lJ6lAPdJm8y7rzrif7YaVYH8=`,
        m2: `ScB+7V2jYsBaErwh7Ll/RFWHkOZZIgg0atsbFqreNf0=`,
    },
])(`crypto functions`, ({clientSeed, clientEphemeral, protocol, salt, iterations, serverPublicValue, m1, m2}) => {
    let icloudCrypto: iCloudCrypto;

    beforeEach(() => {
        icloudCrypto = new iCloudCrypto(mockedResourceManager.username, clientSeed);
    });

    test(`should generate client ephemeral`, async () => {
        expect(await icloudCrypto.getClientEphemeral()).toEqual(clientEphemeral);
    });

    test(`should generate proof values`, async () => {
        const derivedPassword = await icloudCrypto.derivePassword(protocol as SRPProtocol, salt, iterations);
        const [m1Proof, m2Proof] = await icloudCrypto.getProofValues(derivedPassword, serverPublicValue, salt);
        expect(m1Proof).toEqual(m1);
        expect(m2Proof).toEqual(m2);
    });

    test(`should provide the session key used for the proof values`, async () => {
        const derivedPassword = await icloudCrypto.derivePassword(protocol as SRPProtocol, salt, iterations);
        const [m1Proof, m2Proof] = await icloudCrypto.getProofValues(derivedPassword, serverPublicValue, salt);
        const sessionKey = await icloudCrypto.getSessionKey();

        // K = SHA256(S) -> 32 bytes
        expect(Buffer.from(sessionKey, `base64`).length).toBe(32);
        // M2 = H(A | M1 | K) - verifying the provided key is the one used during proof generation
        const expectedM2 = createHash(`sha256`)
            .update(Buffer.from(clientEphemeral, `base64`))
            .update(Buffer.from(m1Proof, `base64`))
            .update(Buffer.from(sessionKey, `base64`))
            .digest(`base64`);
        expect(m2Proof).toEqual(expectedM2);
    });
});

describe(`escrow`, () => {
    const seed = 4583464597706057374074568200686733333845316356957220074367768845250116954003020789631509921160041128250281115189321084127530556466418206894891765906279948360470987821066372075131278941770946795626302727478894190131926680682722191273867216250892152543053567943074039877468968328059297735718354983367158283181087322686097141645793870364626344374302246144622606785340696269402880773974149060918050546459694416131751963256042025191510245022814863735411041522861008849293340319607550193092573656363442241160172566724626024492443228367796159771603009300820441703601914229690671456525732449870676671357654372201494514766191n;
    const serverPublicValue = `b44vF54k7KDvvfIeQyEUk90ahsajSqdEv/4kiv/CdPGk0Wf3oVMlGfdrdZtAUrYWD6jzVc4BKbkqsIwZFK7v5o7/bYxYgzllPG5LXO0Ve5Zs4DgZPjFNzb9Ky7kFtC8gl7D5dKmGTxwwiEPRvE6SlmUWOhHTUg2q3EN7cRXV8HkdrYkNONT4ndHKHEuMV6BlVGuNdYDGMSOGidVK1uW1MwxRIzKWZSJLmF4PzUuvT89QWoFzNbDlVRc2R6Xa+sqjMUC9GM5UKcdug9RMLgj7xNXg5HR3HgVyCMe22woaYhpLP1Ak/VpOknXmnBKvEtWu2TIQggEof8CeqasYM8G8qw==`;
    const salt = `foI2z4yTi2LkZ+Wrr7HFEQ==`;

    test(`should use the provided account name`, () => {
        expect(new iCloudCrypto(``).accountName).toEqual(``);
    });

    test(`should generate different proof values for an empty account name`, async () => {
        const userCrypto = new iCloudCrypto(mockedResourceManager.username, seed);
        const escrowCrypto = new iCloudCrypto(``, seed);

        const derivedPassword = await userCrypto.derivePassword(`s2k`, salt, 20403);
        const [userM1] = await userCrypto.getProofValues(derivedPassword, serverPublicValue, salt);
        const [escrowM1] = await escrowCrypto.getProofValues(derivedPassword, serverPublicValue, salt);

        // M1 = H(H(N) xor H(g) | H(I) | s | A | B | K) - only H(I) differs, since the account name is not part of the password key in GSA mode
        expect(escrowM1).not.toEqual(userM1);
        expect(await escrowCrypto.getSessionKey()).toEqual(await userCrypto.getSessionKey());
    });
});

describe(`account name case`, () => {
    const serverPublicValue = `b44vF54k7KDvvfIeQyEUk90ahsajSqdEv/4kiv/CdPGk0Wf3oVMlGfdrdZtAUrYWD6jzVc4BKbkqsIwZFK7v5o7/bYxYgzllPG5LXO0Ve5Zs4DgZPjFNzb9Ky7kFtC8gl7D5dKmGTxwwiEPRvE6SlmUWOhHTUg2q3EN7cRXV8HkdrYkNONT4ndHKHEuMV6BlVGuNdYDGMSOGidVK1uW1MwxRIzKWZSJLmF4PzUuvT89QWoFzNbDlVRc2R6Xa+sqjMUC9GM5UKcdug9RMLgj7xNXg5HR3HgVyCMe22woaYhpLP1Ak/VpOknXmnBKvEtWu2TIQggEof8CeqasYM8G8qw==`;
    const salt = `foI2z4yTi2LkZ+Wrr7HFEQ==`;

    test(`should lowercase the account name when hashing it (matching Apple's web client)`, async () => {
        const derivedPassword = new Uint8Array(32).fill(7);

        const [mixedCaseM1] = await new iCloudCrypto(`Test@iCloud.com`, 42n).getProofValues(derivedPassword, serverPublicValue, salt);
        const [lowerCaseM1] = await new iCloudCrypto(`test@icloud.com`, 42n).getProofValues(derivedPassword, serverPublicValue, salt);

        expect(mixedCaseM1).toEqual(lowerCaseM1);
    });

    test(`should keep the provided account name`, () => {
        expect(new iCloudCrypto(`Test@iCloud.com`).accountName).toEqual(`Test@iCloud.com`);
    });
});

// Reference values calculated from the server's perspective (verifier & server secret), following the algorithm of Apple's web client (webSRPClientWorker.js)
// Covering values with leading zero bytes, which need to be padded to the length of N
describe.each([
    {
        desc: `leading zero in A`,
        clientSeed: 8802732170487359491684420771487469508074106353165258920210945279165914631991941504576464160301231775561000003197416466774667670914601767654158157330871191349854038213970127145757677063552434511875132024216548409485817395035306238003036293137754933918728050218853596494925875068826317690393034655378189143281366293349281241152031210580861832779002455108077846074045405866013297350817309069193777598609041188644414351274218351887060506789339612586279546399926404215748520585613986553585503902592526381700201474065551235922936924514088109698021491238017278426570285957857484300569901603613785932603227894752787343642988n,
        clientEphemeral: `AMOU/UMsqauU7Gct/hJp9jUqLnhJ+1pXhQyRvJGTOkkqJ37tefADY1xcvqatJFCcZTxk/3C53kQXn/3stt+Q85lnGHTFJBqtEwJDdHz3CSIm7Q29645Yo3MC3dhiW3DCG6dD0m2Lp/WmnCYptksvvAbxcL5+MGcWhuccu+a3drY196wyM/arLIti3y6oqM5r+SnlXil+Cz0XRBmLWzyoqG9A/GGF/QPjkbyLsSHgtNYnEjNv+YmxDfLOLUQAarf3CpA9nH0kDPqQmLPJsnDfv0fhmrySjMAodRFdjIUraD8hvOBEGUFeEDN9MwYDu4u8HuH8T+khRZoNJVtexhabXg==`,
        serverPublicValue: `HwZrKnIPHJ8AqCR2YQQhGLiAwjvC9AWv2FiJ1yMrSDRn20z6QQ/enllMasaIn9fa1tQ74POHAYYncAsOAghbaFpo4hX9C2X6Ms4SnA7i96Jw+CYEO2Oj8W6qnmXwp9QJQcUaZBEPihgalAacN2hWa4DZM5+RnbfWHyM2ciHqb7Y61q0gZeqBssMtouUdnbcnWwSSsNZjDRH4oSx8HvR95xRqtpoljvMIDnemPnWIEVAHy8NxZ+YIAO3ukHOi6SOb859/l5Y+2hbG87OeD00xOTrNm+jqnP8VUEu+sMuuYuol93gZvByp/q6PTmFaNgfEK+VTANt7Kmd97jQpJVoFCw==`,
        salt: `Xz1oyGwWGzvIcqbMUH3ulw==`,
        derivedPassword: `muFrN4wFh3K4GjCXuhEMP4nrcAXxQhl+gBwyFGN0YlA=`,
        m1: `9EcJPyk6+YF3tCPe/bBPVkEgDsV1F5fGI91zU87uNKs=`,
        m2: `9X82mTTVb1oB+Zu2uBiS0hvFHWaGJjN/FKRrbeKQJpg=`,
        sessionKey: `8J3j5Tb9toBBTiuZRj/3lj/gM/wgPRSPQj0QLsSpauU=`,
    },
    {
        desc: `leading zero in B`,
        clientSeed: 14568892884637623040541335506615570322841654995545959103931607772126672228828119296160694942493814364889252575840605210971270085026184478686690970614444312076648889858497603635226415616390334579910520607714050310952789998914320896321751812436825414667002584770480438489829565215604417089674917191522290973319957521681996672015624566245644621682492723801510007030922424258900223860331516922583750907438899288276160236239304360149022884979652632495751405724922048909936996502032734638821515020601646119927267376279430323923918035611167618046029514012323539190811114217445969715620929741537294856370345400237361353929145n,
        clientEphemeral: `ZHwX05wOS8Q6XL6c6qG054r75Y7of9XHyttqV4+vUSRDlMuqv++cZnp9wkrb/L2XbbOdBAh2bMB1lhDP7s6RxJ9OeBx5Vc9lJhN1NmUcW/TvIwbx4qAauG2/A+Y3wvE3EVyyZCuLcwNQVKTj5+Cmsu+8IMspVlwzDs9XU/R0BIT9nsRbUfIgLvvakeL/afVGfob2W56lNJtRSQcD/Hx70rt0iXcqjCOiwf76VeDzsI+BEKy5AQ7jOW0mvKZQvsrzTkN7TZfQe1Tu/PpBkwNo2SE5UQQ8Xk75CUD9hY30/UvUhOn4vpQVQp8xs8DGHaW4vRDmHX6DDXJUL0T/peLPdA==`,
        serverPublicValue: `AJNT+zc+daYohz8T12fd8YMANm5+eqpFeDtx+8r54/KtSAr9GIsjzrSDPDi5NEkfmIy2FDAQGioADKx8kggHfZtzX3/OBd7fBsTJZdeJ7TIodKWrze8+EQGEwq4ryNhx0262cMatyTyR52gXRAhRshIxM9gae7BnNezIaK5pBn9gzinxZHjl9LITmVgfUOBfR54AIoLTgXHCMQtgHmqzhFOxUuIvn9WCl32vugmOjHr+SV1a7qaupsnRB8aTocZDVJYi9vK91gLUsN6ezJdsmIbfwKgbbN4gGL3hEZNFOOjHcZA7cdw7/bzBhBlORqSjEVfJtaymzifJP4SqlGAgiA==`,
        salt: `+7no40tipiM4d0vsh00SFA==`,
        derivedPassword: `RzqUK0tOSJYyTNCDy1HtMP/1bsv2/SsFfvEkd0+HIaM=`,
        m1: `8Calb5dSmQENr0EwHf60DQC1jQW1HUiG7RE9/UBAmDs=`,
        m2: `0faH7nfR/aRxsG5UeVoJ7kqqTmVJWMCjIIFmJYx5fcQ=`,
        sessionKey: `qUwD4byqJMoa9rp3rR/7L/lFKyzk56L59DlE1jZ1fAk=`,
    },
    {
        desc: `leading zero in S`,
        clientSeed: 5684805494743519343197433957470658321916134672678690415934058857424453690830825161294341851642312352108269505930062819828090929913190111028609720880155790368122198867442494648573867199696422614903123373220318097837881619652277305353777485952409571994458229550496391202602508181676330989492054709639157319950115920576798402194658623968047710868254221303780794706414646995993390299687209335930650991266061463820524480718624955762192936802476505735431261099516863194622484899072124895568183015906325780960766723898560867057698999046129193591362844002314935107076573720986455345107044788360365323553467994330588316740118n,
        clientEphemeral: `G6h30tC1W48IJnuarzqWWwWVz2sK2qztVna0eOZQbw8H/Wo/YsMpsTg1kWGLy7ByyyNiqMLKyzysVRCl/qL73kLgbp1Pj+ptLC5GIpZjxR1saqSjoteNnbZZkMS8WrXHV8sexYwNOkiYRYB33Rnhsfls+S94SR2lBgEWo8iSxaT1DAClhAika0EOkuO2j9zEu+yXg71BuUQqwmNbxN8YXw672KhiDmXgXr7+6QYESCPjpFGl30fBKU0ekpQeMGXbW34eNZ8jbAVFJr/8p9P1fxV/gt5zfRydTrPyaxvFzkvnP9DLOVulJMifjZt2NSHyt5H3pkeJZipxsCnfosCypw==`,
        serverPublicValue: `Prt2jmwpsocd+fd4loNzQC/3M6YJgqp+L0qoDaOUaYu0fHn9f7LQ2MhKCclugeCJsYUbg1VmqRg9eq6GTUo+EojSC6FCeeOmkkmRIHwcEKc5MUZ9ifuX7BI0Vwol/awD9y3M2+h6NdzvtPyKkJ+F67FN6eNf98kV0QhBkwY4WjWQYeCwyoAz03Ge471Lqvz1zbpCObD20P8uZPvIAZEZ3RJHktRcGyuI07LeTWft6KNXLLJVu/olqBFDlDSgHAKilssC7TPzdw+pizzkqauOwT0py3McytqoCOKB1MfMXWccZIcfdkTXZvAEipYhl4a1PlrpKL1BxSxG+aRzaRRYxA==`,
        salt: `miaSfW5akNt0NwOmjObWGQ==`,
        derivedPassword: `imQhUuWk8sU6pE0vQagoSQQAPRpPR46xaKEA70pITfM=`,
        m1: `f69rrL2BTifg67wW0acH89V6yuqH4bPjCH2ZXzqiFrQ=`,
        m2: `78DAYdIqOyAPcpnwPeGJIk5+lu01ONkXcVAhtI3kRRE=`,
        sessionKey: `P4NVP5RTEESODGehYeqsaSnc1ig6QO7yvc5xYiBSvDU=`,
    },
    {
        desc: `no leading zeros`,
        clientSeed: 31117348692656556242423006103914870975699042824344992330428136973199057192404065560620904286245676488926426065915802429664174196426230082369771886874973608918735896395438877224143820082901873414952662440419591411240797792423365097184912717282724685219154577655217665365609781371034669820208637771775840929913720413435360454453597825440527553979688835896118791174739666686542851385470763614099187764249458717134034339286332873591084769211943793224523643947132420053028028333634760969030863401837245859741508345551238624424566101394038292031555461528937814475440381101350988110455855867981490419925623189583907783968653n,
        clientEphemeral: `lMlzGwoDpYGewXHFymYG9teNZaIBfABoKaAsGEsguJhROjeDkWLGVNSYdWboe9WxjeMGP46T31MUxPofWnHshyFPnRIlVofY0tCXzmUs7zTVDTw7HGBdAvZajPbWszePGl/InuLpHQD1H4udBvSlTy9Z5vxPdwKDFRoFTMijqmAfK5XP36FN6h79RSxmiQeOsM65/nFkOI6BojNWaq2SU1ZSmGjY6JUJxV2a5ozDjjs4pO31iD+9vDHG2VjbRsCGsVZQCAV2rE9/Sdsti+2b+S7NO7gfzu5h/Ivbi3F6lwPxSeXBC2AjhjRALcQBC0qgTFzyCG5sSCrDF/0v+p/gkA==`,
        serverPublicValue: `FZAq3hf6JYClYR1B+yQJ9YpUiArn9KoICQu59aGCSNZqErPIk0o5zKMTc3qcd+LwrsZOuzRiW0GyJRHVkQgRSHiykmrOA0TRkkLf/ExGMbjU94RI0/fvT2UQpbDbvM5Rf12Mtd9fyIDS+ZStPzvUfCyxUjQ84BOP+O1xL5uMbTrswgDlag/eos14m8ro2ygmCyamr0rGoHl3QYNUZvbToxEfX7AzM26rS4mAOfO/u2Dp2ou8bg16OZeYZD2C0Q/3eA1on3XHMqH7N14tAE67/3h9TRifUFsbzMlBglspn+6/mUtx8Qe2DVY33U9ciDjamfBRkQO13vzOybUdhp1XWw==`,
        salt: `Aedn68nCBGkOV3YZ6EuqCA==`,
        derivedPassword: `7Zt6F1snJF0Gn1VdN+0YxJW06DFWEIuWnD8SBP55x9I=`,
        m1: `O9rIn48hfR+oXsPW2OFjyDwb6RH3fc4O327c/cINJOU=`,
        m2: `01a4iJ9LVUuh1N8pHfQxhPPC2QmQyzc+0Sr+EQRGXlc=`,
        sessionKey: `3ljf3/ceqnznKARTeH9SPEjvXZTaljuAuuGFAcZFRVw=`,
    }
])(`padding: $desc`, ({clientSeed, clientEphemeral, serverPublicValue, salt, derivedPassword, m1, m2, sessionKey}) => {
    test(`should match the reference values`, async () => {
        const icloudCrypto = new iCloudCrypto(`Test@iCloud.com`, clientSeed);

        expect(await icloudCrypto.getClientEphemeral()).toEqual(clientEphemeral);
        const [m1Proof, m2Proof] = await icloudCrypto.getProofValues(Buffer.from(derivedPassword, `base64`), serverPublicValue, salt);
        expect(m1Proof).toEqual(m1);
        expect(m2Proof).toEqual(m2);
        expect(await icloudCrypto.getSessionKey()).toEqual(sessionKey);
    });
});
