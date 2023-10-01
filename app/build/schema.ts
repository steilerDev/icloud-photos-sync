#!/usr/bin/env ts-node
// This script generates the json schema used for validation of externally provided date
import * as tsj from "ts-json-schema-generator";
import path from "path";
import fs from "fs/promises";

const tsConfigPath = `tsconfig.json`;
const targetDir = `src/lib/resources/schemas/`;
const schemaList = [
    {
        typeName: `ResourceFile`,
        srcPath: `src/lib/resources/resource-types.ts`,
        allowAdditionalProperties: false,
    }, {
        typeName: `SigninResponse`,
        srcPath: `src/lib/resources/network-types.ts`,
        allowAdditionalProperties: true,
    }, {
        typeName: `ResendMFADeviceResponse`,
        srcPath: `src/lib/resources/network-types.ts`,
        allowAdditionalProperties: true,
    }, {
        typeName: `ResendMFAPhoneResponse`,
        srcPath: `src/lib/resources/network-types.ts`,
        allowAdditionalProperties: true,
    }, {
        typeName: `TrustResponse`,
        srcPath: `src/lib/resources/network-types.ts`,
        allowAdditionalProperties: true,
    }, {
        typeName: `SetupResponse`,
        srcPath: `src/lib/resources/network-types.ts`,
        allowAdditionalProperties: true,
    }, {
        typeName: `PCSResponse`,
        srcPath: `src/lib/resources/network-types.ts`,
        allowAdditionalProperties: true,
    }, {
        typeName: `PhotosSetupResponse`,
        srcPath: `src/lib/resources/network-types.ts`,
        allowAdditionalProperties: true,
    },
];

await fs.mkdir(targetDir, {recursive: true});

await Promise.all(schemaList.map(async schemaConfig => {
    const outputFilename = schemaConfig.typeName
        .replace(/(?<!^)[A-Z][a-z]/g, str => `-${str}`) // Match big to small transitions, except at the beginning of the string and prefix them with a dash
        .replace(/[a-z][A-Z]/g, str => `${str.charAt(0)}-${str.charAt(1)}`) // Match small to big transitions and insert a dash between them
        .toLowerCase() + `.json`; // Make everything lower case and append file extension

    const outputPath = path.join(targetDir, outputFilename);

    const srcStat = await fs.stat(schemaConfig.srcPath);

    try {
        const outputStat = await fs.stat(outputPath);
        if (srcStat.mtimeMs < outputStat.mtimeMs) {
            console.log(`Skipping ${schemaConfig.srcPath} as it is older than ${outputPath}`);
            return;
        }
    } catch (err) {
        console.log(`No existing schema for ${schemaConfig.typeName} found at ${outputPath}`);
    }

    const config: tsj.Config = {
        path: schemaConfig.srcPath,
        tsconfig: tsConfigPath,
        type: schemaConfig.typeName,
        additionalProperties: schemaConfig.allowAdditionalProperties,
        jsDoc: `extended`,
        discriminatorType: `json-schema`,
        skipTypeCheck: true,
    };

    const schema = tsj.createGenerator(config).createSchema(config.type);

    await fs.writeFile(outputPath,
        JSON.stringify(schema, null, 2),
        {encoding: `utf-8`},
    );

    console.log(`Wrote schema for type ${schemaConfig.typeName} to ${outputPath}`);
}));