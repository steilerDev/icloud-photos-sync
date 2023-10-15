
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
        expect(icloudCrypto.srp).toBeDefined();
        expect(icloudCrypto.srpClient).toBeDefined();
        const client = await icloudCrypto.srpClient;

        expect(client.i).toEqual(Buffer.from(mockedResourceManager.username));
        expect(client.p).toEqual(new Uint8Array());
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
        icloudCrypto = new iCloudCrypto();
        icloudCrypto.srpClient = icloudCrypto.srp.newClient(
            Buffer.from(mockedResourceManager.username),
            new Uint8Array(),
            clientSeed,
        );
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
});