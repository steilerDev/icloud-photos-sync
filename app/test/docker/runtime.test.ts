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
        const which = await container.execNode(`
            const fs = require('fs');
            const bin = process.env.PATH.split(':').map(dir => dir + '/icloud-photos-sync').find(file => fs.existsSync(file));
            fs.accessSync(bin, fs.constants.X_OK);
            console.log(bin);
        `)
        expect(which.exitCode).toEqual(0)
        expect(which.output.trim()).toEqual(`/usr/local/bin/icloud-photos-sync`)
    })

    test(`Runtime does not provide a shell`, async () => {
        const shell = await container.execNode(`console.log(require('fs').existsSync('/bin/sh'))`)
        expect(shell.exitCode).toEqual(0)
        expect(shell.output.trim()).toEqual(`false`)
    })

    test(`Runs as icps user & owns default library`, async () => {
        const user = await container.execNode(`
            const {uid, gid} = require('fs').statSync('/opt/icloud-photos-library');
            console.log(process.getuid(), process.getgid(), uid, gid);
        `)
        expect(user.exitCode).toEqual(0)
        expect(user.output.trim()).toEqual(`100 101 100 101`)
    })
})
