import {describe, expect, test, jest} from "@jest/globals";

import {delay, ICPSContainer} from "../_helpers/testcontainers.helper";

describe(`Docker Daemon Command`, () => {

    // Setting timeout to 30sec, in order for Docker environment to spin up
    jest.setTimeout(30 * 1000);

    test(`Container should enter daemon mode`, async () => {
        const container = await new ICPSContainer()
            .withDaemonCommand()
            .withDummyCredentials()
            .start();

        // wait a second to make sure status file was written
        await delay(2000)

        expect(await container.syncMetrics()).toMatch(/status="SCHEDULED"/)
    })

    test(`Should trigger run`, async () => {

        // schedule next run in 15 seconds
        const nextRun = new Date(Date.now() + 2000)
        const cron = `${nextRun.getUTCSeconds()} ${nextRun.getUTCMinutes()} * * * *`

        const container = await new ICPSContainer()
            .withDaemonCommand(cron)
            .withDummyCredentials()
            .start();
        //await container.getFullLogs()

        await delay(2000)

        expect(await container.syncMetrics()).toMatch(/status="AUTHENTICATION_STARTED"/)
    })

    test.only(`Container should enter daemon mode`, async () => {
        const container =  await new ICPSContainer()
            .asDummy()
            .withDummyCredentials()
            .withSyncMetrics()
            .withUTCTimezone()
            .start()

        const result = await container.exec([`ls`, `-al`, `/opt`])
        console.log(result.stdout)
        const result1 = await container.exec([`tree`, `-a`, `/opt/`])
        console.log(result1.stdout)

        const syncResult = await container.startSync()
        console.log(syncResult)


        expect(await container.syncMetrics()).toMatch(/status="SCHEDULED"/)
    })
})