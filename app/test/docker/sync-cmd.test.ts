import {beforeAll, describe, expect, jest, test} from "@jest/globals";

import {ICPSContainer, StartedICPSContainer} from "../_helpers/testcontainers.helper";
import {afterEach} from "node:test";

describe(`Docker Daemon Command`, () => {
    // Increased timeout due to time consuming tasks
    const timeoutSeconds = 60
    let container: StartedICPSContainer

    // Implementing simple lock with timeout to ensure serial execution of tests
    let releaseLock: (value: unknown) => void
    const executionLock = new Promise((resolve, reject) => {
        setTimeout(() => reject(`Timeout`), timeoutSeconds * 1000)
        releaseLock = resolve
    })
    jest.setTimeout(timeoutSeconds * 1000);

    beforeAll(async () => {
        container = await new ICPSContainer()
            .forSyncTest()
            .start()
    })

    afterEach(async () => {
        // Cleaning dynamic data
        await container.deleteFile(`/opt/icloud-photos-library/.icloud-photos-sync*`)
    })

    test(`Should trigger initial sync`, async () => {
        await container.startSync()

        const metrics = await container.syncMetrics()
        expect(metrics).toMatch(/status="SYNC_START"/)
        expect(metrics).toMatch(/status="WRITE_ASSETS_STARTED",assets_to_be_added=206i,assets_to_be_deleted=0i,assets_to_be_kept=0i/)
        expect(metrics).toMatch(/albums_to_be_added=8i,albums_to_be_deleted=0i,albums_to_be_kept=0i/)
        expect(metrics).toMatch(/status="SYNC_COMPLETED"/)

        const hash = await container.libraryHash()
        expect(hash).toEqual(`cpd/t1tEIihK8nylqHqgbYDQ3bs=`)
        releaseLock(`released`)
    })

    test(`Should trigger incremental sync`, async () => {
        await executionLock
        await container.deleteLibraryAsset(
            `AXyF0KdwxynEGmKsbMffdRel1mzR.jpeg`,
            `AdJWs0a-goRKfyLPbTAyV8ILUFmM.jpeg`,
            `AexevMtFb8wMSLb78udseVvLv-m2.jpeg`,
            `AZmQ91f-NKAp5b67HE23Fqhjt5NO.jpeg`,
            `AXDMJGQac7vQa1exGBIEFkvZoIWL.jpeg`
        )

        await container.unlinkLibraryAsset(
            `.cc40a239-2beb-483e-acee-e897db1b818a/.fc649b1a-d22e-4b49-a5ee-066eb577d023/ali-kazal-6YyuNu1lCBE-unsplash.jpeg`,
            `.cc40a239-2beb-483e-acee-e897db1b818a/.6e7f4f44-445a-41ee-a87e-844a9109069d/.c8254e48-90f0-4f6d-8564-95a6718ee403/andrea-de-santis-cRi_VYej6lE-unsplash.jpeg`,
            `.cc40a239-2beb-483e-acee-e897db1b818a/.6e7f4f44-445a-41ee-a87e-844a9109069d/.311f9778-1f40-4762-9e57-569ebf5fb070/2h-media-MOCpD78SHW0-unsplash.jpeg`,
            `.b971e88c-ca73-4712-9f70-202879ea8b26/2h-media-Q_x3Equ11Jk-unsplash.jpeg`
        )

        await container.startSync()

        const metrics = await container.syncMetrics()
        expect(metrics).toMatch(/status="SYNC_START"/)
        expect(metrics).toMatch(/local_albums_loaded=8i,local_assets_loaded=201i,remote_albums_fetched=8i,remote_assets_fetched=206i/)
        expect(metrics).toMatch(/assets_to_be_added=5i,assets_to_be_deleted=0i,assets_to_be_kept=201i/)
        expect(metrics).toMatch(/albums_to_be_added=5i,albums_to_be_deleted=5i,albums_to_be_kept=3i/)
        expect(metrics).toMatch(/status="SYNC_COMPLETED"/)

        const hash = await container.libraryHash()
        expect(hash).toEqual(`cpd/t1tEIihK8nylqHqgbYDQ3bs=`)

    })
})