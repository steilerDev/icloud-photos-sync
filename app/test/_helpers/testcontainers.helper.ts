import { GenericContainer, StartedTestContainer, AbstractStartedContainer, Wait } from "testcontainers";
import  {extract} from 'tar-stream'

export const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

export class ICPSContainer extends GenericContainer {
    constructor() {
        super(process.env[`IMAGE_NAME`] ?? `steilerdev/icloud-photos-sync:latest`)
    }

    withHelpCommand(): this {
        return this.withCommand([`help`])
            .withWaitStrategy(Wait.forLogMessage(`Find the full documentation at https://icps.steiler.dev/`))
    }

    withDaemonCommand(schedule = `0 2 * * *`): this {
        return this.withCommand([`daemon`])
            .withEnvironment({
                TIMEZONE: `etc/utc`,
                EXPORT_METRICS: `true`,
                SCHEDULE: schedule
            })
            .withWaitStrategy(Wait.forLogMessage(`Started in daemon mode!`))
    }

    asDummy(): this {
        return this.withEntrypoint([`tail`, `-f`, `/dev/null`])
    }

    withDummyCredentials() {
        return this.withCredentials(`test@apple.com`, `testPass`)
    }

    withEnvironmentCredentials() {
        if(!process.env[`TEST_APPLE_ID_USER`]) {
            throw new Error(`TEST_APPLE_ID_USER variable not defined`)
        }

        if(!process.env[`TEST_APPLE_ID_PWD`]) {
            throw new Error(`TEST_APPLE_ID_PWD variable not defined`)
        }

        return this.withCredentials(
            process.env[`TEST_APPLE_ID_USER`],
            process.env[`TEST_APPLE_ID_PWD`]
        )
    }

    withCredentials(username: string, password: string): this {
        return this.withEnvironment({
            APPLE_ID_USER: username,
            APPLE_ID_PWD: password
        })
    }

    withUTCTimezone(): this {
        return this.withEnvironment({
            TZ: `Etc/UTC`
        })
    }
  
    public override async start(): Promise<StartedICPSContainer> {
        return new StartedICPSContainer(await super.start());
    }
}
  
export class StartedICPSContainer extends AbstractStartedContainer {
    constructor(startedTestContainer: StartedTestContainer) {
        super(startedTestContainer);
    }

    /**
     * @returns The full log of the container - will only return once the container exited
     */
    async getFullLogs(): Promise<string> {
        const logStream = await this.logs()
        return new Promise( (resolve, reject) => {
            let log = ``;
            logStream.on(`data`, (line) =>  {
                log += line
            })
                .on(`err`, reject)
                .on(`end`, () => resolve(log))
        })
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
                let content = ``
                for await (const buffer of entry) {
                    content += buffer.toString()
                }
                return content
            }
            entry.resume() 
        }
        return ``
    }
}
  