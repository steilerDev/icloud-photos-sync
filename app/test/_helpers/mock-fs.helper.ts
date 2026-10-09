import * as fs from 'fs';
import os from 'os';
import path from 'path';
import * as Config from './_config';

/**
 * This helper provides the subset of the `mock-fs` API used by this test suite, backed by the real file system.
 * `mock-fs` patches Node's internal fs bindings and is incompatible with Node >= 24 (see https://github.com/tschaub/mock-fs/issues/447).
 *
 * Instead of replacing the file system, the provided tree is written to disk. In order to protect the host, only paths within the OS' temp directory are accepted.
 * Every call to `mockfs()` removes the previously created tree, `mockfs.restore()` removes the current tree.
 * Similar to the empty file system provided by `mock-fs`, both also remove the (per test file) temporary data dir.
 */

type MockFileOptions = {
    content?: string | Buffer,
    mode?: number,
    mtime?: Date,
    atime?: Date,
    ctime?: Date,
    birthtime?: Date,
}

type MockDirectoryOptions = {
    items?: MockTree,
    mode?: number,
    mtime?: Date,
    atime?: Date,
}

type MockSymlinkOptions = {
    path: string,
    mtime?: Date,
    atime?: Date,
}

class MockFile {
    constructor(public options: MockFileOptions) {}
}

class MockDirectory {
    constructor(public options: MockDirectoryOptions) {}
}

class MockSymlink {
    constructor(public options: MockSymlinkOptions) {}
}

type MockTreeEntry = string | Buffer | MockFile | MockDirectory | MockSymlink | MockTree

type MockTree = {
    [path: string]: MockTreeEntry
}

/**
 * The root directory all mocked trees need to reside in
 */
const TEMP_ROOT = fs.realpathSync(os.tmpdir());

/**
 * The top-level paths created by the current tree
 */
let createdPaths: string[] = [];

/**
 * Makes sure the given path is located within the temp directory
 * @param target - The absolute path to check
 * @returns The resolved path
 * @throws If the path is outside of the temp directory
 */
function assertWithinTempRoot(target: string): string {
    const resolved = path.resolve(target);
    if (resolved === TEMP_ROOT || !resolved.startsWith(TEMP_ROOT + path.sep)) {
        throw new Error(`Refusing to create test fixture outside of temp directory: ${resolved}`);
    }

    return resolved;
}

/**
 * Applies access and modification times, if provided
 */
function applyTimes(target: string, options: {mtime?: Date, atime?: Date}, isSymlink: boolean = false) {
    if (!options.mtime && !options.atime) {
        return;
    }

    const mtime = options.mtime ?? options.atime!;
    const atime = options.atime ?? mtime;
    if (isSymlink) {
        fs.lutimesSync(target, atime, mtime);
        return;
    }

    fs.utimesSync(target, atime, mtime);
}

/**
 * Recursively writes the given entry to the target path
 * @param target - The path to write to
 * @param entry - The entry describing the file system object
 */
function writeEntry(target: string, entry: MockTreeEntry) {
    fs.mkdirSync(path.dirname(target), {recursive: true});

    if (typeof entry === `string` || Buffer.isBuffer(entry)) {
        fs.writeFileSync(target, entry);
        return;
    }

    if (entry instanceof MockFile) {
        fs.writeFileSync(target, entry.options.content ?? ``);
        applyTimes(target, entry.options);
        if (entry.options.mode !== undefined) {
            fs.chmodSync(target, entry.options.mode);
        }

        return;
    }

    if (entry instanceof MockSymlink) {
        fs.symlinkSync(entry.options.path, target);
        applyTimes(target, entry.options, true);
        return;
    }

    const options: MockDirectoryOptions = entry instanceof MockDirectory
        ? entry.options
        : {items: entry};

    fs.mkdirSync(target, {recursive: true});
    for (const [name, child] of Object.entries(options.items ?? {})) {
        writeEntry(path.join(target, name), child);
    }

    // Times and mode need to be applied after the children were created
    applyTimes(target, options);
    if (options.mode !== undefined) {
        fs.chmodSync(target, options.mode);
    }
}

/**
 * Makes sure all directories within the given path are accessible, so they can be removed
 */
function makeRemovable(target: string) {
    let stat: fs.Stats;
    try {
        stat = fs.lstatSync(target);
    } catch {
        return;
    }

    if (!stat.isDirectory()) {
        return;
    }

    fs.chmodSync(target, 0o700);
    for (const child of fs.readdirSync(target)) {
        makeRemovable(path.join(target, child));
    }
}

/**
 * Removes the currently created tree
 */
function restore() {
    for (const createdPath of [...createdPaths, Config.defaultConfig.dataDir]) {
        makeRemovable(createdPath);
        fs.rmSync(createdPath, {recursive: true, force: true});
    }

    createdPaths = [];
}

/**
 * Writes the given tree to disk, after removing any previously created tree
 * @param tree - An object, where the keys are absolute paths within the temp directory and the values describe the file system objects
 */
function mockfs(tree: MockTree = {}) {
    restore();

    for (const [target, entry] of Object.entries(tree)) {
        const resolved = assertWithinTempRoot(target);
        // Tracking the top-most directory within the temp root, so everything created on the way gets removed
        createdPaths.push(path.join(TEMP_ROOT, path.relative(TEMP_ROOT, resolved).split(path.sep)[0]));
        writeEntry(resolved, entry);
    }
}

mockfs.restore = restore;
mockfs.file = (options: MockFileOptions = {}) => new MockFile(options);
mockfs.directory = (options: MockDirectoryOptions = {}) => new MockDirectory(options);
mockfs.symlink = (options: MockSymlinkOptions) => new MockSymlink(options);

export default mockfs;
