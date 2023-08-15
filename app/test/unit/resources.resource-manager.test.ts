
import mockfs from 'mock-fs';
import * as fs from 'fs';
import {test, beforeEach, expect, jest, describe, afterEach} from '@jest/globals';
import * as Config from '../_helpers/_config';
import {ResourceManager} from '../../src/lib/resources/resource-manager';
import {MockedResourceManager, prepareResources, spyOnEvent} from '../_helpers/_general';
import {Resources} from '../../src/lib/resources/main';
import {EventManager} from '../../src/lib/resources/event-manager';
import {iCPSEventError, iCPSEventResourceManager} from '../../src/lib/resources/events-types';
import {Validator} from '../../src/lib/resources/validator';
import path from 'path';

describe(`ResourceManager`, () => {
    describe(`constructor`, () => {
        const originalWriteResourceFile = ResourceManager.prototype._writeResourceFile;
        const originalReadResourceFile = ResourceManager.prototype._readResourceFile;

        beforeEach(() => {
            ResourceManager.prototype._writeResourceFile = jest.fn<typeof ResourceManager.prototype._writeResourceFile>()
                .mockReturnValue();

            ResourceManager.prototype._readResourceFile = jest.fn<typeof ResourceManager.prototype._readResourceFile>();
        });

        afterEach(() => {
            ResourceManager.prototype._writeResourceFile = originalWriteResourceFile;
            ResourceManager.prototype._readResourceFile = originalReadResourceFile;
        });

        test(`should create a new instance of ResourceManager`, () => {
            (ResourceManager.prototype._readResourceFile as jest.Mock)
                .mockReturnValue({
                    libraryVersion: 1,
                    trustToken: undefined,
                });
            const resourceManager = new ResourceManager(Config.defaultConfig);
            expect(resourceManager).toBeInstanceOf(ResourceManager);
            expect(resourceManager._readResourceFile).toHaveBeenCalledTimes(1);
            expect(resourceManager._writeResourceFile).toHaveBeenCalledTimes(1);
            expect(((resourceManager._writeResourceFile as jest.Mock).mock.contexts[0] as ResourceManager)._resources.trustToken).toBeUndefined();
            expect(((resourceManager._writeResourceFile as jest.Mock).mock.contexts[0] as ResourceManager)._resources.libraryVersion).toEqual(1);
            expect(resourceManager._resources).toEqual({
                ...Config.defaultConfig,
                libraryVersion: 1,
            });
        });

        test(`should set the trustToken property if it is present in the appOptions`, () => {
            (ResourceManager.prototype._readResourceFile as jest.Mock)
                .mockReturnValue({
                    libraryVersion: 1,
                });

            const resourceManager = new ResourceManager({
                ...Config.defaultConfig,
                trustToken: Config.trustToken,
            });

            expect(resourceManager._writeResourceFile).toHaveBeenCalledTimes(1);
            // Checking what would have been written
            expect(((resourceManager._writeResourceFile as jest.Mock).mock.contexts[0] as ResourceManager)._resources.trustToken).toEqual(Config.trustToken);
            expect(((resourceManager._writeResourceFile as jest.Mock).mock.contexts[0] as ResourceManager)._resources.libraryVersion).toEqual(1);
            expect(resourceManager._resources).toEqual({
                ...Config.defaultConfig,
                libraryVersion: 1,
                trustToken: Config.trustToken,
            });
        });

        test(`should set the trustToken property if it is present in the resource file`, () => {
            (ResourceManager.prototype._readResourceFile as jest.Mock)
                .mockReturnValue({
                    libraryVersion: 1,
                    trustToken: Config.trustToken,
                });

            const resourceManager = new ResourceManager(Config.defaultConfig);

            expect(resourceManager._writeResourceFile).toHaveBeenCalledTimes(1);
            // Checking what would have been written
            expect(((resourceManager._writeResourceFile as jest.Mock).mock.contexts[0] as ResourceManager)._resources.trustToken).toEqual(Config.trustToken);
            expect(((resourceManager._writeResourceFile as jest.Mock).mock.contexts[0] as ResourceManager)._resources.libraryVersion).toEqual(1);
            expect(resourceManager._resources).toEqual({
                ...Config.defaultConfig,
                libraryVersion: 1,
                trustToken: Config.trustToken,
            });
        });

        test(`should set the trustToken property from appOption if it is present in the resource file and the appOptions`, () => {
            (ResourceManager.prototype._readResourceFile as jest.Mock)
                .mockReturnValue({
                    libraryVersion: 1,
                    trustToken: Config.trustTokenModified,
                });

            const resourceManager = new ResourceManager({
                ...Config.defaultConfig,
                trustToken: Config.trustToken,
            });

            expect(resourceManager._writeResourceFile).toHaveBeenCalledTimes(1);
            // Checking what would have been written
            expect(((resourceManager._writeResourceFile as jest.Mock).mock.contexts[0] as ResourceManager)._resources.trustToken).toEqual(Config.trustToken);
            expect(((resourceManager._writeResourceFile as jest.Mock).mock.contexts[0] as ResourceManager)._resources.libraryVersion).toEqual(1);
            expect(resourceManager._resources).toEqual({
                ...Config.defaultConfig,
                libraryVersion: 1,
                trustToken: Config.trustToken,
            });
        });

        test(`should clear the trustToken if refreshToken is present in the appOptions`, () => {
            (ResourceManager.prototype._readResourceFile as jest.Mock)
                .mockReturnValue({
                    libraryVersion: 1,
                    trustToken: Config.trustTokenModified,
                });

            const resourceManager = new ResourceManager({
                ...Config.defaultConfig,
                trustToken: Config.trustToken,
                refreshToken: true,
            });

            expect(resourceManager._writeResourceFile).toHaveBeenCalledTimes(1);
            // Checking what would have been written
            expect(((resourceManager._writeResourceFile as jest.Mock).mock.contexts[0] as ResourceManager)._resources.trustToken).toBeUndefined();
            expect(((resourceManager._writeResourceFile as jest.Mock).mock.contexts[0] as ResourceManager)._resources.libraryVersion).toEqual(1);
            expect(resourceManager._resources).toEqual({
                ...Config.defaultConfig,
                libraryVersion: 1,
                trustToken: undefined,
                refreshToken: true,
            });
        });
    });

    describe(`resource file`, () => {
        const resourceFilePath = `${Config.defaultConfig.dataDir}/.icloud-photos-sync`;
        let resourceManager: ResourceManager;
        let eventManager: EventManager;
        let validator: Validator;

        beforeEach(() => {
            mockfs({});
            prepareResources(false);

            const instances = Resources.setup(Config.defaultConfig);

            eventManager = instances.event;
            resourceManager = instances.manager;
            validator = instances.validator;
        });

        afterEach(() => {
            mockfs.restore();
        });

        describe(`_readResourceFile`, () => {
            test(`should read the contents of the resource file and return a valid resource file object`, () => {
                const data = {
                    libraryVersion: 1,
                    trustToken: Config.trustToken,
                };

                mockfs({
                    [resourceFilePath]: JSON.stringify(data),
                });

                validator.validateResourceFile = jest.fn<typeof validator.validateResourceFile>()
                    .mockReturnValue(data);

                const result = resourceManager._readResourceFile();

                expect(validator.validateResourceFile).toHaveBeenCalledWith(data);

                expect(result).toEqual(data);
            });

            test(`should emit a NO_RESOURCE_FILE_FOUND event and return a default resource file object if the resource file cannot be read`, () => {
                mockfs({
                    [`${Config.defaultConfig.dataDir}/.icloud-photos-sync`]: mockfs.file({
                        content: ``,
                        mode: 0o000, // Make the file unreadable
                    }),
                });

                const noResourceFileFoundEvent = spyOnEvent(eventManager._eventBus, iCPSEventResourceManager.NO_RESOURCE_FILE_FOUND);

                const result = resourceManager._readResourceFile();

                expect(noResourceFileFoundEvent).toHaveBeenCalled();
                expect(result).toEqual({
                    libraryVersion: 1,
                    trustToken: undefined,
                });
            });

            test(`should emit a RESOURCE_FILE_INVALID event and return a default resource file object if the resource file is invalid`, () => {
                mockfs({
                    [resourceFilePath]: JSON.stringify({
                        invalid: `json`,
                    }),
                });
                const noResourceFileFoundEvent = spyOnEvent(eventManager._eventBus, iCPSEventResourceManager.NO_RESOURCE_FILE_FOUND);

                const result = resourceManager._readResourceFile();

                expect(noResourceFileFoundEvent).toHaveBeenCalled();
                expect(result).toEqual({
                    libraryVersion: 1,
                    trustToken: undefined,
                });
            });
        });

        describe(`_writeResourceFile`, () => {
            test(`should write the resource file to disk with the correct contents`, () => {
                mockfs({
                    [Config.defaultConfig.dataDir]: {},
                });

                resourceManager._resources.libraryVersion = 1;
                resourceManager._resources.trustToken = Config.trustToken;

                resourceManager._writeResourceFile();

                const resourceFileData = JSON.parse(fs.readFileSync(resourceFilePath, {encoding: `utf8`}));
                expect(resourceFileData).toEqual({
                    libraryVersion: 1,
                    trustToken: Config.trustToken,
                });
            });

            test(`should emit an error event if the resource file cannot be written`, () => {
                mockfs({
                    [resourceFilePath]: mockfs.file({
                        content: ``,
                        mode: 0o444, // Make the file read-only
                    }),
                });
                const handlerEvent = spyOnEvent(eventManager._eventBus, iCPSEventError.HANDLER_EVENT);

                resourceManager._writeResourceFile();

                expect(handlerEvent).toHaveBeenCalledWith(expect.any(Error));
            });

            test(`should overwrite an existing resource file with the correct contents`, () => {
                mockfs({
                    [resourceFilePath]: JSON.stringify({
                        libraryVersion: 0,
                        trustToken: Config.trustToken,
                    }),
                });

                resourceManager._resources.libraryVersion = 1;
                resourceManager._resources.trustToken = Config.trustTokenModified;

                resourceManager._writeResourceFile();

                const resourceFileData = JSON.parse(fs.readFileSync(resourceFilePath, {encoding: `utf8`}));
                expect(resourceFileData).toEqual({
                    libraryVersion: 1,
                    trustToken: Config.trustTokenModified,
                });
            });
        });
    });

    describe(`getter and setter`, () => {
        let resourceManager: MockedResourceManager;

        const resources = {
            ...Config.defaultConfig,
            sessionSecret: Config.iCloudAuthSecrets.sessionSecret,
            libraryVersion: 1,
            primaryZone: Config.primaryZone,
            sharedZone: Config.sharedZone,
        };

        beforeEach(() => {
            resourceManager = prepareResources(true, resources as any)!.manager;
        });

        describe(`dataDir`, () => {
            test(`should return the data dir from the resources`, () => {
                expect(resourceManager.dataDir).toEqual(resources.dataDir);
            });
        });

        describe(`resourceFilePath`, () => {
            test(`should return the path to the resource file`, () => {
                const expectedPath = path.join(resources.dataDir, `.icloud-photos-sync`);
                expect(resourceManager.resourceFilePath).toEqual(expectedPath);
            });
        });

        describe(`logFilePath`, () => {
            test(`should return the path to the log file if logging to CLI is disabled`, () => {
                resourceManager._resources.logToCli = false;
                const expectedPath = path.join(resources.dataDir, `.icloud-photos-sync.log`);
                expect(resourceManager.logFilePath).toEqual(expectedPath);
            });

            test(`should return undefined if logging to CLI is enabled`, () => {
                resourceManager._resources.logToCli = true;
                expect(resourceManager.logFilePath).toBeUndefined();
            });
        });

        describe(`metricsFilePath`, () => {
            test(`should return the path to the metrics file if exportMetrics is enabled`, () => {
                resourceManager._resources.exportMetrics = true;
                const expectedPath = path.join(resources.dataDir, `.icloud-photos-sync.metrics`);
                expect(resourceManager.metricsFilePath).toEqual(expectedPath);
            });

            test(`should return undefined if exportMetrics is disabled`, () => {
                resourceManager._resources.exportMetrics = false;
                expect(resourceManager.metricsFilePath).toBeUndefined();
            });
        });

        describe(`harFilePath`, () => {
            test(`should return the path to the HAR file if enableNetworkCapture is enabled`, () => {
                resourceManager._resources.enableNetworkCapture = true;
                const expectedPath = path.join(resources.dataDir, `.icloud-photos-sync.har`);
                expect(resourceManager.harFilePath).toEqual(expectedPath);
            });

            test(`should return undefined if enableNetworkCapture is disabled`, () => {
                resourceManager._resources.enableNetworkCapture = false;

                expect(resourceManager.harFilePath).toBeUndefined();
            });
        });

        describe(`libraryVersion`, () => {
            test(`should return the library version from the resources`, () => {
                (resourceManager._readResourceFile as jest.Mock).mockReset(); // Was called during construction
                expect(resourceManager.libraryVersion).toEqual(resources.libraryVersion);
                expect(resourceManager._readResourceFile).not.toHaveBeenCalled();
            });
        });

        describe(`trustToken`, () => {
            test(`should return the trust token from the file`, () => {
                resourceManager._resources.trustToken = Config.trustTokenModified;
                resourceManager._readResourceFile = jest.fn<typeof resourceManager._readResourceFile>()
                    .mockReturnValue({
                        libraryVersion: 1,
                        trustToken: resources.trustToken,
                    });
                expect(resourceManager.trustToken).toEqual(resources.trustToken);
                expect(resourceManager._readResourceFile).toHaveBeenCalled();
            });

            test(`should return undefined, if trust token is not set in file`, () => {
                resourceManager._readResourceFile = jest.fn<typeof resourceManager._readResourceFile>()
                    .mockReturnValue({
                        libraryVersion: 1,
                        trustToken: undefined,
                    });
                expect(resourceManager.trustToken).toBeUndefined();
                expect(resourceManager._readResourceFile).toHaveBeenCalled();
            });
        });

        describe(`trustToken setter`, () => {
            test(`should set the trust token in the resources and write it to the resource file`, () => {
                (resourceManager._writeResourceFile as jest.Mock).mockReset();
                resourceManager.trustToken = Config.trustTokenModified;
                expect(resourceManager._writeResourceFile).toHaveBeenCalledTimes(1);
                // Checking what would have been written
                expect(((resourceManager._writeResourceFile as jest.Mock).mock.contexts[0] as ResourceManager)._resources.trustToken).toEqual(Config.trustTokenModified);
                expect(((resourceManager._writeResourceFile as jest.Mock).mock.contexts[0] as ResourceManager)._resources.libraryVersion).toEqual(1);
                expect(resourceManager._resources.trustToken).toEqual(Config.trustTokenModified);
            });
        });

        describe(`username`, () => {
            test(`should return the username from the resources`, () => {
                expect(resourceManager.username).toEqual(resources.username);
            });
        });

        describe(`password`, () => {
            test(`should return the password from the resources`, () => {
                expect(resourceManager.password).toEqual(resources.password);
            });
        });

        describe(`mfaServerPort`, () => {
            test(`should return the port from the resources`, () => {
                expect(resourceManager.mfaServerPort).toEqual(resources.port);
            });
        });

        describe(`maxRetries`, () => {
            test(`should return the max retries from the resources`, () => {
                expect(resourceManager.maxRetries).toEqual(resources.maxRetries);
            });
        });

        describe(`downloadThreads`, () => {
            test(`should return the download threads from the resources`, () => {
                expect(resourceManager.downloadThreads).toEqual(resources.downloadThreads);
            });
        });

        describe(`schedule`, () => {
            test(`should return the schedule from the resources`, () => {
                expect(resourceManager.schedule).toEqual(resources.schedule);
            });
        });

        describe(`enableCrashReporting`, () => {
            test(`should return the enable crash reporting flag from the resources`, () => {
                expect(resourceManager.enableCrashReporting).toEqual(resources.enableCrashReporting);
            });
        });

        describe(`failOnMfa`, () => {
            test(`should return the fail on MFA flag from the resources`, () => {
                expect(resourceManager.failOnMfa).toEqual(resources.failOnMfa);
            });
        });

        describe(`force`, () => {
            test(`should return the force flag from the resources`, () => {
                expect(resourceManager.force).toEqual(resources.force);
            });
        });

        describe(`remoteDelete`, () => {
            test(`should return the remote delete flag from the resources`, () => {
                expect(resourceManager.remoteDelete).toEqual(resources.remoteDelete);
            });
        });

        describe(`logLevel`, () => {
            test(`should return the log level from the resources`, () => {
                expect(resourceManager.logLevel).toEqual(resources.logLevel);
            });
        });

        describe(`silent`, () => {
            test(`should return the silent flag from the resources`, () => {
                expect(resourceManager.silent).toEqual(resources.silent);
            });
        });

        describe(`logToCli`, () => {
            test(`should return the log to CLI flag from the resources`, () => {
                expect(resourceManager.logToCli).toEqual(resources.logToCli);
            });
        });

        describe(`suppressWarnings`, () => {
            test(`should return the suppress warnings flag from the resources`, () => {
                expect(resourceManager.suppressWarnings).toEqual(resources.suppressWarnings);
            });
        });

        describe(`exportMetrics`, () => {
            test(`should return the export metrics flag from the resources`, () => {
                expect(resourceManager.exportMetrics).toEqual(resources.exportMetrics);
            });
        });

        describe(`metadataRate`, () => {
            test(`should return the metadata rate from the resources`, () => {
                expect(resourceManager.metadataRate).toEqual(resources.metadataRate);
            });
        });

        describe(`enableNetworkCapture`, () => {
            test(`should return the enable network capture flag from the resources`, () => {
                expect(resourceManager.enableNetworkCapture).toEqual(resources.enableNetworkCapture);
            });
        });

        describe(`sessionSecret`, () => {
            test(`should return the session secret from the resources`, () => {
                expect(resourceManager.sessionSecret).toEqual(resources.sessionSecret);
            });

            test(`should throw an error if no session secret is set`, () => {
                resourceManager._resources.sessionSecret = undefined!;
                expect(() => resourceManager.sessionSecret).toThrowError(/^No session secret present$/);
            });
        });

        describe(`sessionSecret setter`, () => {
            test(`should set the session secret in the resources`, () => {
                resourceManager.sessionSecret = Config.iCloudAuthSecrets.sessionSecretModified;
                expect(resourceManager._resources.sessionSecret).toEqual(Config.iCloudAuthSecrets.sessionSecretModified);
            });
        });

        describe(`primaryZone`, () => {
            test(`should return the primary zone from the resources`, () => {
                expect(resourceManager.primaryZone).toEqual(resources.primaryZone);
            });

            test(`should throw an error if no primary zone is set`, () => {
                resourceManager._resources.primaryZone = undefined!;
                expect(() => resourceManager.primaryZone).toThrowError(/^No primary photos zone present$/);
            });
        });

        describe(`primaryZone setter`, () => {
            test(`should set the primary zone in the resources`, () => {
                resourceManager._resources.primaryZone = undefined!;
                resourceManager.primaryZone = Config.primaryZone;
                expect(resourceManager._resources.primaryZone).toEqual(Config.primaryZone);
            });
        });

        describe(`sharedZone`, () => {
            test(`should return the shared zone from the resources`, () => {
                expect(resourceManager.sharedZone).toEqual(resources.sharedZone);
            });

            test(`should throw an error if no shared zone is set`, () => {
                resourceManager._resources.sharedZone = undefined!;
                expect(() => resourceManager.sharedZone).toThrowError(/^No shared photos zone present$/);
            });
        });

        describe(`sharedZone setter`, () => {
            test(`should set the shared zone in the resources`, () => {
                resourceManager._resources.sharedZone = undefined!;
                resourceManager.sharedZone = Config.sharedZone;
                expect(resourceManager._resources.sharedZone).toEqual(Config.sharedZone);
            });
        });

        describe(`sharedZoneAvailable`, () => {
            test(`should return true if the shared zone is set`, () => {
                expect(resourceManager.sharedZoneAvailable).toBeTruthy();
            });

            test(`should return false if the shared zone is not set`, () => {
                resourceManager._resources.sharedZone = undefined!;
                expect(resourceManager.sharedZoneAvailable).toBeFalsy();
            });
        });
    });
});