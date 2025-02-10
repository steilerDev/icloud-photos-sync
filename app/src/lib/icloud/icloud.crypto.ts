import {Client, Hash, Mode, Srp, util} from "@foxt/js-srp";
import crypto from "crypto";
import {Resources} from "../resources/main.js";
import {SRPProtocol} from "../resources/network-types.js";

/**
 * This class handles the GSA SRP protocol required for authentication
 */
export class iCloudCrypto {
    /**
     * A promise that will resolve to the srp client used for authentication
     */
    srpClient: Promise<Client>;
    /**
     * Access to the underlying js-srp library
     */
    srp: Srp;

    /**
     * Creates a new crypto object and initiates the ephemeral values for this session
     */
    constructor() {
        this.srp = new Srp(Mode.GSA, Hash.SHA256, 2048);
        this.srpClient = this.srp.newClient(
            Buffer.from(Resources.manager().username),
            // Placeholder, until we can derive the password key using the server response
            new Uint8Array(),
        );
    }

    /**
     * @returns A Promise that will resolve to the clients's ephemeral challenge used in the SRP protocol, formatted as a base64 string
     */
    async getClientEphemeral(): Promise<string> {
        return Buffer.from(
            util.bytesFromBigint((await this.srpClient).A),
        ).toString(`base64`);
    }

    /**
     * This function will use the PBKDF2 algorithm to derive the password key
     * @param protocol - The protocol to use for hashing the password
     * @param salt - The salt value to use for password hashing as a base64 string
     * @param iterations - Number of iterations to use for key derivation
     * @returns A Promise that will resolve to the derived password key
     */
    async derivePassword(protocol: SRPProtocol, salt: string, iterations: number): Promise<Uint8Array> {
        const encodedPassword = new TextEncoder().encode(Resources.manager().password)
        let passHash = new Uint8Array(await util.hash(this.srp.h, encodedPassword.buffer as ArrayBuffer));
        if (protocol === `s2k_fo`) {
            passHash = Buffer.from(util.toHex(passHash));
        }

        const imported = await crypto.subtle.importKey(
            `raw`,
            passHash,
            {name: `PBKDF2`},
            false,
            [`deriveBits`],
        );

        const derived = await crypto.subtle.deriveBits({
            name: `PBKDF2`,
            hash: `SHA-256`,
            salt: Buffer.from(salt, `base64`),
            iterations,
        }, imported, 256);

        return new Uint8Array(derived);
    }

    /**
     * Generates the proof values required for authentication
     * @param derivedPassword - The PBKDF2 derived password key
     * @param serverPublicValue - The public value shared by the server - base64 encoded string
     * @param salt - The salt value shared by the server - base64 encoded string
     * @returns A tuple containing the proof values m1 and m2, formatted as base64 strings
     */
    async getProofValues(derivedPassword: Uint8Array, serverPublicValue: string, salt: string): Promise<[m1: string, m2: string]> {
        const client = await this.srpClient;
        client.p = derivedPassword;
        const m1 = Buffer.from(
            await client.generate(Buffer.from(salt, `base64`), Buffer.from(serverPublicValue, `base64`)),
            `hex`,
        ).toString(`base64`);

        const m2 = Buffer.from(
            await client.generateM2(),
        ).toString(`base64`);

        return [m1, m2];
    }
}