/**
 * This class handles access to the .icloud-photos-sync resource file and handles currently applied configurations from the CLI and environment variables
 */

import {iCPSError} from "../../app/error/error.js";
import {RES_MANAGER_ERR} from "../../app/error/error-codes.js";
import {iCPSAppOptions} from "../../app/factory.js";
import {EventEmitter} from "stream";
import * as RESOURCE_MANAGER from './constants.js';
import * as path from 'path';
import {readFileSync} from "fs";
import {ResourceFile} from "./resource-file.js";
import Ajv from "ajv/dist/jtd.js";
import ResourceFileSchema from "./resource-file.schema.json" assert { type: "json" }; // eslint-disable-line
import {JSONSchemaType} from "ajv";
import {getLogger} from "../logger.js";
import {HANDLER_EVENT} from "../../app/event/error-handler.js";

export class ResourceManager extends EventEmitter {
    /**
     * Default logger for the class
     */
    protected logger = getLogger(this);

    /**
     * The singleton instance of the ResourceManager
     */
    static _instance: ResourceManager;

    /**
     * Prepares the ResourceManager singleton.
     * This function should only be called once.
     * @param appOptions - The parsed app options
     * @throws If the function is called with an already initiated singleton
     */
    static setup(appOptions: iCPSAppOptions) {
        if (this._instance) {
            throw new iCPSError(RES_MANAGER_ERR.ALREADY_INITIATED);
        }

        this._instance = new ResourceManager(appOptions);
    }

    static get instance() {
        if (!this._instance) {
            throw new iCPSError(RES_MANAGER_ERR.NOT_INITIATED);
        }

        return this._instance;
    }

    resourceFile: ResourceFile;
    appOptions: iCPSAppOptions;

    constructor(appOptions: iCPSAppOptions) {
        super();
        this.appOptions = appOptions;

        try {
            const resourceFileData = readFileSync(this.resourceFilePath, {"encoding": RESOURCE_MANAGER.RESOURCE_FILE_ENCODING});
            const resourceFileParser = new Ajv.default({"verbose": true, "logger": this.logger}).compileParser<ResourceFile>(ResourceFileSchema);

            const _resourceFile = resourceFileParser(resourceFileData);
            if (!_resourceFile) {
                throw new iCPSError(RES_MANAGER_ERR.UNABLE_TO_PARSE_FILE)
                    .addMessage(`${resourceFileParser.message}`)
                    .addMessage(`${resourceFileParser.position}`);
            }
        } catch (err) {
            this.emit(HANDLER_EVENT, new iCPSError(RES_MANAGER_ERR.UNABLE_TO_LOAD_FILE)
                .setWarning()
                .addCause(err));
        }
    }

    /**
     * Returns the data dir read from the CLI Options
     */
    get dataDir() {
        return this.appOptions.dataDir;
    }

    get resourceFilePath() {
        return path.format({
            "dir": this.dataDir,
            "base": RESOURCE_MANAGER.RESOURCE_FILE_NAME,
        });
    }
}