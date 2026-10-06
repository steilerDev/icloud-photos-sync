import {describe, expect, test, jest} from "@jest/globals";

import {Wait} from "testcontainers";
import {delay, ICPSContainer} from "../_helpers/testcontainers.helper";

describe(`Docker Daemon Command`, () => {

    // Setting timeout to 20sec, in order for Docker environment to spin up
    jest.setTimeout(20 * 1000);

    test(`Container should enter daemon mode`, async () => {
        const container = await new ICPSContainer()
            .withDaemonCommand()
            .withDummyCredentials()
            .start();

        // wait a second to make sure status file was written
        await delay(2000)

        expect(await container.syncMetrics()).toMatch(/status="SCHEDULED"/)
    })

    test(`Container should enter daemon mode with permission model`, async () => {
        const container = await new ICPSContainer()
            .withDaemonCommand()
            .withDummyCredentials()
            .withPermissionModel()
            .withEnvironment({ENABLE_CRASH_REPORTING: `true`})
            .start();

        // wait a second to make sure status file was written
        await delay(2000)

        expect(await container.syncMetrics()).toMatch(/status="SCHEDULED"/)
    })

    test(`Container should fail with insufficient permissions`, async () => {
        const container = await new ICPSContainer()
            .withCommand([`daemon`])
            .withDummyCredentials()
            .withPermissionModel(`--allow-fs-read=* --allow-fs-write=/opt/icloud-photos-library --allow-net`)
            .withWaitStrategy(Wait.forLogMessage(`APP_INSUFFICIENT_PERMISSIONS`))
            .start();

        expect(await container.getFullLogs()).toMatch(`APP_INSUFFICIENT_PERMISSIONS: Node.js permission model is enabled, but required permissions are missing (missing --allow-fs-write=*)`)
    })

    test(`Should trigger run`, async () => {

        // schedule next run in 15 seconds
        const nextRun = new Date(Date.now() + 3000)
        const cron = `${nextRun.getUTCSeconds()} ${nextRun.getUTCMinutes()} * * * *`

        const container = await new ICPSContainer()
            .withDaemonCommand(cron)
            .withDummyCredentials()
            .start();

        await delay(4000)

        expect(await container.syncMetrics()).toMatch(/status="AUTHENTICATION_STARTED"/)
    })
})