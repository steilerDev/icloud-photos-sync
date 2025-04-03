import { GenericContainer, StartedTestContainer, AbstractStartedContainer, Wait, ExecResult } from "testcontainers";
import  {extract} from 'tar-stream'
import {createHash} from 'crypto'

/**
 * Delay the execution
 * @param ms Sleep time in ms
 * @returns Resolves after the timer has ended
 */
export const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

export class ICPSContainer extends GenericContainer {
    constructor() {
        super(process.env[`IMAGE_NAME`] ?? `steilerdev/icloud-photos-sync:latest`)
    }

    /**
     * Creates an ICPS container with the help command
     */
    withHelpCommand(): this {
        return this.withCommand([`help`])
            .withWaitStrategy(Wait.forLogMessage(`Find the full documentation at https://icps.steiler.dev/`))
    }

    /**
     * Creates an ICPS container with the daemon command
     * @param schedule An option schedule for daemon mode
     */
    withDaemonCommand(schedule = `0 2 * * *`): this {
        return this.withCommand([`daemon`])
            .withSyncMetrics()
            .withUTCTimezone()
            .withEnvironment({
                SCHEDULE: schedule
            })
            .withWaitStrategy(Wait.forLogMessage(`Started in daemon mode`))
    }

    /**
     * Creates an ICPS container setup with secrets and enabled sync metrics for re-using during sync tests
     */
    forSyncTest() {
        return this.asDummy()
            .withSyncMetrics()
            .withEnvironmentSecrets()
    }

    /**
     * Sets the entrypoint to keep container open
     */
    asDummy(): this {
        return this.withEntrypoint([`tail`, `-f`, `/dev/null`])
    }

    /**
     * Populates the container with dummy credentials
     */
    withDummyCredentials() {
        return this.withCredentials(`test@apple.com`, `testPass`)
    }

    /**
     * Populates the container with secrets acquired from the environment
     */
    withEnvironmentSecrets() {
        if(!process.env[`TEST_APPLE_ID_USER`]) {
            throw new Error(`TEST_APPLE_ID_USER variable not defined`)
        }

        if(!process.env[`TEST_APPLE_ID_PWD`]) {
            throw new Error(`TEST_APPLE_ID_PWD variable not defined`)
        }

        if(!process.env[`TEST_TRUST_TOKEN`]) {
            throw new Error(`TEST_TRUST_TOKEN variable not defined`)
        }

        return this.withEnvironment({
            APPLE_ID_USER: process.env[`TEST_APPLE_ID_USER`],
            APPLE_ID_PWD: process.env[`TEST_APPLE_ID_PWD`],
            TRUST_TOKEN: process.env[`TEST_TRUST_TOKEN`]
        })
    }

    /**
     * Populates the container with the supplied credentials
     * @param username The Apple ID username
     * @param password The Apple ID password
     */
    withCredentials(username: string, password: string): this {
        return this.withEnvironment({
            APPLE_ID_USER: username,
            APPLE_ID_PWD: password
        })
    }

    /**
     * Sets the timezone of the container to UTC
     */
    withUTCTimezone(): this {
        return this.withEnvironment({
            TZ: `Etc/UTC`
        })
    }

    /**
     * Enables exporting sync metrics
     */
    withSyncMetrics(): this {
        return this.withEnvironment({
            EXPORT_METRICS: `true`
        })
    }
  
    /**
     * Starts the container 
     * @returns A running container instance
     */
    public override async start(): Promise<StartedICPSContainer> {
        return new StartedICPSContainer(await super.start());
    }
}
  
export class StartedICPSContainer extends AbstractStartedContainer {

    constructor(startedTestContainer: StartedTestContainer) {
        super(startedTestContainer);
    }

    /**
     * Executes the command to start a sync execution within the running container
     * @returns The execution result
     */
    async startSync(): Promise<ExecResult> {
        return this.exec([`icloud-photos-sync`, `sync`])
    }

    /**
     * @param [timeout=0] Optional timeout in seconds, will resolve on timeout
     * @returns The full log of the container - will only return once the container exited
     */
    async getFullLogs(timeout: number = 0): Promise<string> {
        const logStream = await this.logs()
        return new Promise( (resolve, reject) => {
            let log = ``;
            logStream.on(`data`, (line) =>  {
                //console.log(line)
                log += line
            })
                .on(`err`, reject)
                .on(`end`, () => resolve(log))

            if(timeout > 0) {
                setTimeout(() => resolve(log), timeout * 1000)
            }
        })
    }

    /**
     * Uses `unlink` to remove file
     */
    async unlinkFile(...filePath) {
        for (const _path of filePath) {
            this.exec([`unlink`, _path])
        }
    }

    /**
     * Unlinks an asset from the icloud-photos directory tree folder
     * @param asset The file path
     * @returns An exec result
     */
    async unlinkLibraryAsset(...asset: string[]): Promise<void> {
        return this.unlinkFile(...asset.map(assetPath => `/opt/icloud-photos-library/` + assetPath))
    }

    /**
     * Deletes a file or folder in the container's path
     * @param filePath - Path to delete
     * @returns The execution result
     */
    async deleteFile(...filePath: string[]): Promise<ExecResult> {
        return this.exec([`rm`, `-rf`, ...filePath])
    }

    /**
     * Deletes an asset from the '_All-Photos' folder
     * @param asset The asset name
     * @returns An exec result
     */
    async deleteLibraryAsset(...asset: string[]): Promise<ExecResult> {
        return this.deleteFile(...asset.map(assetName => `/opt/icloud-photos-library/_All-Photos/` + assetName))
    }

    /**
     * Returns the content of the first file location or empty string
     * @param filePath - Path of the file
     */
    async readFile(filePath: string): Promise<string> {
        const tarArchiveStream = await this.copyArchiveFromContainer(filePath)

        const extractStream = extract()
        tarArchiveStream.pipe(extractStream)

        for await (const entry of extractStream) {
            if(entry.header.type === `file`) {
                let content =``
                for await (const buffer of entry) {
                    content += buffer.toString()
                }
                return content
            }
            entry.resume() 
        }
        return ``
    }

    /**
     * Reads the sync metrics file from the execution
     * @return The content of the metrics file
     */
    async syncMetrics(): Promise<string> {
        return this.readFile(`/opt/icloud-photos-library/.icloud-photos-sync.metrics`)
    }

    /**
     * Removes dynamic content (metrics file & library configuration) and calculates the hash of the library
     * @returns Base64 encoded string
     */
    async libraryHash(): Promise<string> {

        const tarArchiveStream = await this.copyArchiveFromContainer(`/opt/icloud-photos-library`)

        const extractStream = extract()
        tarArchiveStream.pipe(extractStream)

        const hash = createHash(`sha1`)

        for await (const entry of extractStream) {
            const header = entry.header
            if(header.name.match(/\.icloud-photos-sync.*/)){
                entry.resume() 
                continue
            }

            if(header.type === `symlink` && header.linkname) {
                hash.update(header.name)
                hash.update(header.linkname)
            }
            if(header.type === `file`) {
                hash.update(header.name)
                for await (const chunk of entry) {
                    hash.update(chunk)
                }
            }
            entry.resume() 
        }
        return hash.digest(`base64`)
    }
}
  