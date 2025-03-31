import {beforeEach, describe, expect, test} from "@jest/globals";
import {ICPSContainer, StartedICPSContainer} from "../_helpers/testcontainer.helper";

describe(`Docker Runtime`, () => {
    let container: StartedICPSContainer
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