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

    test.each([{
        bin: `enter_mfa`
    }, {
        bin: `resend_mfa`
    }, {
        bin: `icloud-photos-sync`
    }])(`$bin linked & executable`, async ({bin}) => {
        const which = await container.exec([`/usr/bin/which`, bin])
        expect(which.exitCode).toEqual(0)

        const target = await container.exec([`/usr/bin/readlink`, `-f`, which.output.trim()])
        expect(target.exitCode).toEqual(0)
        
        const stat = await container.exec([`/bin/stat`, `-c`, `%a`, target.output.trim()])
        expect(stat.exitCode).toEqual(0)
        expect(stat.output.trim()).toEqual(`755`)
    })
})