import { GenericContainer, TestContainer, StartedTestContainer, AbstractStartedContainer, Wait } from "testcontainers";
  
export class ICPSContainer extends GenericContainer {
    constructor() {
        super(process.env[`IMAGE_NAME`] ?? `steilerdev/icloud-photos-sync:latest`)
    }

    withHelpCommand(): this {
        return this.withCommand([`help`])
            .withWaitStrategy(Wait.forLogMessage(`Find the full documentation at https://icps.steiler.dev/`))
    }

    withDaemonCommand(): this {
        return this.withCommand([`daemon`])
            .withWaitStrategy(Wait.forLogMessage(`Started in daemon mode!`))
    }

    asDummy(): this {
        return this.withEntrypoint([`tail`, `-f`, `/dev/null`])
    }

    withCredentials(username: string, password: string): this {
        return this.withEnvironment({
            APPLE_ID_USER: username,
            APPLE_ID_PWD: password
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
            logStream.on(`data`, (line) =>  log += line)
                .on(`err`, reject)
                .on(`end`, () => resolve(log))
        })
    }
}
  