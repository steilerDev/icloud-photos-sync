#!/usr/bin/env ts-node
import fs from 'fs/promises';
import path from 'path';

// This script copies the build app from srcPath to targetPath, while updating all '*.js.map' references to the original TS source file
const srcPath = `build/out/src`;
const targetPath = `bin/`;

// Moves a src directory to a target directory
/**
 * Recursively copies a directory (and its content) from dirSrc to dirTarget. 'js.map' file references will be updated
 * @param dirSrc - Source directory
 * @param dirTarget - Target directory
 */
async function copyDir(dirSrc: string, dirTarget: string) {
    console.log(`Moving ${dirSrc} to ${dirTarget}`);
    const srcStat = await fs.readdir(dirSrc, {withFileTypes: true});
    for (const entry of srcStat) {
        if (entry.isDirectory()) {
            copyDir(path.join(entry.path, entry.name), path.join(dirTarget, entry.name));
            continue;
        }

        if (entry.isFile()) {
            await copyFile(path.join(entry.path, entry.name), path.join(dirTarget, entry.name));
        }
    }
}

/**
 * Copies a file from fileSrc to fileTarget - src is validated to be a file and not a directory. Will maintain 'js.map' references to the original TS source file
 * @param fileSrc - Src file
 * @param fileTarget - Target file
 */
async function copyFile(fileSrc: string, fileTarget: string) {
    // Making sure src file exists (we need the dirent anyway)
    const srcFile = await (fs.stat(fileSrc)
        .catch(() => undefined));
    if (!srcFile) {
        console.log(`Not moving file ${fileSrc}, because it does not exist`);
        return;
    }

    // Making sure target dir exists, creating it otherwise
    const fileTargetDir = path.dirname(fileTarget);
    const targetDir = await (fs.stat(fileTargetDir)
        .catch(() => undefined));
    if (!targetDir) {
        console.log(`Creating directory ${fileTargetDir}`);
        await fs.mkdir(fileTargetDir, {recursive: true});
    }

    // Checking if target file exists and is newer than src file
    const targetFile = await (fs.stat(fileTarget)
        .catch(() => undefined));
    if (targetFile && srcFile.mtimeMs < targetFile.mtimeMs) {
        console.log(`Skipping ${fileSrc} as it is older than ${fileTarget}`);
        return;
    }

    // Special treatment of 'js.map' files
    if (fileSrc.endsWith(`js.map`)) {
        await moveSrcMap(fileSrc, fileTarget);
        return;
    }

    console.log(`Copying regular file ${fileSrc} to ${fileTarget}`);
    await fs.copyFile(fileSrc, fileTarget);
}

/**
 * Moves a source map file, while updating the source map's source reference to the original TS file
 * @param fileSrc - Source map file
 * @param fileTarget - Target file
 */
async function moveSrcMap(fileSrc: string, fileTarget: string) {
    const fileSrcDirectory = path.dirname(fileSrc);
    const fileTargetDirectory = path.dirname(fileTarget);

    // Getting content
    const srcMapContent = JSON.parse(await fs.readFile(fileSrc, {encoding: `utf-8`}));
    if (srcMapContent.sources.length !== 1) {
        console.warn(`Unexpected number of sources in ${fileSrc}, skipping file`);
        return;
    }

    // Resolves the TS source file path based on the src map's 'sources' entry
    const tsFileLocation = path.resolve(fileSrcDirectory, srcMapContent.sources[0]);

    // Creates the relative path from the target file to the TS source file
    const newReference = path.relative(fileTargetDirectory, tsFileLocation);

    console.log(`Moving src map file ${fileSrc} to ${fileTarget}, while still pointing to ${srcMapContent.sources[0]}, by updating it to ${newReference}`);

    // Making sure new reference is valid
    if (path.resolve(fileTargetDirectory, newReference) !== tsFileLocation) {
        throw new Error(`Target mismatch for ${fileSrc} -> ${fileTarget} -> ${newReference} -> ${tsFileLocation}`);
    }

    srcMapContent.sources = [newReference];
    await fs.writeFile(fileTarget, JSON.stringify(srcMapContent), {encoding: `utf-8`});
}

await copyDir(srcPath, targetPath);