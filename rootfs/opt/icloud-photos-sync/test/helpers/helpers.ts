import { AssetID, CPLMaster } from "../../src/lib/icloud/icloud-photos/query-parser";

/**
 * Helper to compare objects, that have string property 'recordName'
 * @param a 
 * @param b 
 * @returns 
 */
export function sortByRecordName(a: any, b: any): number {
    return a.recordName.localeCompare(b.recordName)
}

/**
 * This function will filter variable data (that we cannot test), in order to make test possible
 * @param a 
 * @returns 
 */
export function filterVariableData(a: CPLMaster): any {
    return {
        filenameEnc: a.filenameEnc,
        modified: a.modified,
        recordName: a.recordName,
        resource: {
            fileChecksum: a.resource.fileChecksum,
            referenceChecksum: a.resource.referenceChecksum,
            size: a.resource.size,
            wrappingKey: a.resource.wrappingKey,
            resourceType: a.resourceType
        }
    }
}