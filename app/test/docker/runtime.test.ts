import {beforeEach, describe, expect, jest, test} from "@jest/globals";
import {ICPSContainer, StartedICPSContainer} from "../_helpers/testcontainers.helper";

describe(`Docker Runtime`, () => {
    let container: StartedICPSContainer

    // Setting timeout to 10sec, in order for Docker environment to spin up
    jest.setTimeout(10 * 1000);

    beforeEach(async () => {
        container = await new ICPSContainer()
            .asDummy()
            .start()
    })

    test(`icloud-photos-sync linked & executable`, async () => {
        const which = await container.exec([`/usr/bin/which`, `icloud-photos-sync`])
        expect(which.exitCode).toEqual(0)

        const target = await container.exec([`/usr/bin/readlink`, `-f`, which.output.trim()])
        expect(target.exitCode).toEqual(0)
        
        const stat = await container.exec([`/bin/stat`, `-c`, `%a`, target.output.trim()])
        expect(stat.exitCode).toEqual(0)
        expect(stat.output.trim()).toEqual(`755`)
    })
})