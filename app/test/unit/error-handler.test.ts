import {afterEach, beforeEach, describe, expect, jest, test} from '@jest/globals';
import {BacktraceClientBuilder} from '@backtrace/node';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {MachineIdAttributeProvider, ShellFreeBacktraceClientBuilder} from '../../src/app/event/error-handler';

type AttributeProvider = ConstructorParameters<typeof MachineIdAttributeProvider>[0] & {}

/**
 * Exposes the attribute providers registered with a builder
 * @param builder - The builder to inspect
 * @returns The registered attribute providers
 */
function attributeProviders(builder: BacktraceClientBuilder): AttributeProvider[] {
    return (builder as unknown as {clientSetup: {attributeProviders: AttributeProvider[]}}).clientSetup.attributeProviders;
}

/**
 * Simulates running on the provided platform
 * @param platform - The platform to report through `process.platform`
 */
function mockPlatform(platform: NodeJS.Platform) {
    Object.defineProperty(process, `platform`, {...originalPlatform, value: platform});
}

const originalPlatform = Object.getOwnPropertyDescriptor(process, `platform`)!;

describe(`MachineIdAttributeProvider`, () => {
    let tmpDir: string;

    beforeEach(() => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), `icps-machine-id-`));
    });

    afterEach(() => {
        fs.rmSync(tmpDir, {recursive: true, force: true});
        Object.defineProperty(process, `platform`, originalPlatform);
        Reflect.deleteProperty(process, `permission`);
    });

    /**
     * Writes a machine id file to the temporary directory
     * @param name - The file name
     * @param content - The file content
     * @returns The path to the file
     */
    function machineIdFile(name: string, content: string): string {
        const filePath = path.join(tmpDir, name);
        fs.writeFileSync(filePath, content);
        return filePath;
    }

    describe(`Linux`, () => {
        beforeEach(() => {
            mockPlatform(`linux`);
        });

        test(`Reads first line of first machine id file`, () => {
            const dbusMachineId = machineIdFile(`dbus-machine-id`, `ABCDEF0123456789\nsecond line\n`);
            const etcMachineId = machineIdFile(`etc-machine-id`, `fedcba9876543210\n`);

            expect(new MachineIdAttributeProvider(undefined, [dbusMachineId, etcMachineId]).get()).toEqual({guid: `abcdef0123456789`});
        });

        test(`Falls back to next machine id file`, () => {
            const etcMachineId = machineIdFile(`etc-machine-id`, `fedcba9876543210\n`);

            expect(new MachineIdAttributeProvider(undefined, [path.join(tmpDir, `missing`), etcMachineId]).get()).toEqual({guid: `fedcba9876543210`});
        });

        test(`Falls back to next machine id file if first is empty`, () => {
            const dbusMachineId = machineIdFile(`dbus-machine-id`, ``);
            const etcMachineId = machineIdFile(`etc-machine-id`, `fedcba9876543210\n`);

            expect(new MachineIdAttributeProvider(undefined, [dbusMachineId, etcMachineId]).get()).toEqual({guid: `fedcba9876543210`});
        });

        test(`Falls back to hostname if existing machine id file is empty`, () => {
            const etcMachineId = machineIdFile(`etc-machine-id`, ``);

            expect(new MachineIdAttributeProvider(undefined, [path.join(tmpDir, `missing`), etcMachineId]).generateGuid()).toEqual(os.hostname().replace(/\s+/g, ``).toLowerCase());
        });

        test(`Falls back to hostname`, () => {
            expect(new MachineIdAttributeProvider(undefined, [path.join(tmpDir, `missing`)]).generateGuid()).toEqual(os.hostname().replace(/\s+/g, ``).toLowerCase());
        });

        test(`Does not use shell provider`, () => {
            const shellProvider = {type: `scoped` as const, get: jest.fn(() => ({guid: `shell`}))};
            const etcMachineId = machineIdFile(`etc-machine-id`, `fedcba9876543210\n`);

            expect(new MachineIdAttributeProvider(shellProvider, [etcMachineId]).get()).toEqual({guid: `fedcba9876543210`});
            expect(shellProvider.get).not.toHaveBeenCalled();
        });
    });

    describe(`Other platforms`, () => {
        beforeEach(() => {
            mockPlatform(`darwin`);
        });

        test(`Uses shell provider`, () => {
            const shellProvider = {type: `scoped` as const, get: jest.fn(() => ({guid: `shell-guid`}))};

            expect(new MachineIdAttributeProvider(shellProvider).get()).toEqual({guid: `shell-guid`});
        });

        test(`Uses random guid if child processes are denied`, () => {
            Object.defineProperty(process, `permission`, {value: {has: () => false}, configurable: true});
            const shellProvider = {type: `scoped` as const, get: jest.fn(() => ({guid: `shell-guid`}))};

            const {guid} = new MachineIdAttributeProvider(shellProvider).get();

            expect(guid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
            expect(shellProvider.get).not.toHaveBeenCalled();
        });

        test(`Uses random guid without shell provider`, () => {
            expect(new MachineIdAttributeProvider().get().guid).toMatch(/^[0-9a-f-]{36}$/);
        });
    });
});

describe(`ShellFreeBacktraceClientBuilder`, () => {
    test(`Replaces Backtrace's machine identifier provider`, () => {
        const providers = attributeProviders(new ShellFreeBacktraceClientBuilder({url: `https://localhost`}));
        const guidProviders = providers.filter(provider => `generateGuid` in provider);

        expect(providers.length).toEqual(attributeProviders(new BacktraceClientBuilder({options: {url: `https://localhost`}})).length);
        expect(guidProviders).toHaveLength(1);
        expect(guidProviders[0]).toBeInstanceOf(MachineIdAttributeProvider);
    });

    (process.platform === `linux` ? test : test.skip)(`Produces the same guid as Backtrace's machine identifier provider`, () => {
        const shellProvider = attributeProviders(new BacktraceClientBuilder({options: {url: `https://localhost`}}))
            .find(provider => `generateGuid` in provider)!;

        expect(new MachineIdAttributeProvider().get()).toEqual(shellProvider.get());
    });
});
