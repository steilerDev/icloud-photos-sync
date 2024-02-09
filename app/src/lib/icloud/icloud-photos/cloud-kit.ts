import { AxiosRequestConfig } from "axios";
import { CloudKitQueryRequest, CloudKitQueryResponse, FilterDictionary, PhotosFieldKey, QueryRecordTypeValue, RecordDictionary, RecordType, RecordTypeValue,  } from "../../resources/cloud-kit-types.js";
import { ENDPOINTS } from "../../resources/network-types.js";
import * as QueryBuilder from './query-builder.js';
import { Resources } from "../../resources/main.js";
import { CLOUD_KIT_ERR} from "../../../app/error/error-codes.js";
import { iCPSError } from "../../../app/error/error.js";

export interface CloudKit<T extends RecordType> {
    endpoint: string;

    async execute(): Promise<RecordDictionary<T>[]>;
}

export type CloudKitQueryConfig<T extends RecordType> = {
    zone: QueryBuilder.Zones, 
    recordType: T, 
    filterBy?: FilterDictionary[], 
    desiredKeys?: PhotosFieldKey[], 
    continuationMarker?: string
}
/**
 * This class creates and executes a CloudKit query
 */
export class CloudKitQuery<T extends RecordType> implements CloudKit<T> {
    endpoint = ENDPOINTS.PHOTOS.PATH.QUERY;
    queryRequest = {} as CloudKitQueryRequest;

    static build<U extends RecordType>(config: CloudKitQueryConfig<U>): CloudKitQuery<U> {
        const query = new CloudKitQuery<U>();
        query.queryRequest = {
            query: {
                recordType: config.recordType,
                filterBy: config.filterBy,
            },
            desiredKeys: config.desiredKeys,
            continuationMarker: config.continuationMarker,
            zoneID: QueryBuilder.getZoneID(config.zone),
        }

        return query;
    }

    async execute(): Promise<RecordDictionary<T>[]> {
        const config: AxiosRequestConfig = {
            params: {
                remapEnums: `True`,
            },
        };

        try {
            Resources.logger(this).debug(`Getting records for ${JSON.stringify(this.queryRequest)}`);
            const queryResponse = await Resources.network().post(this.endpoint, this.queryRequest, config);
            const validatedQueryResponse = Resources.validator().validateCloudKitQueryResponse(queryResponse);
            const {records, continuationMarker} = validatedQueryResponse.data;

            Resources.logger(this).debug(`Found ${records.length} records in query response for ${JSON.stringify(this.queryRequest)}`);
            if (continuationMarker) {
                Resources.logger(this).debug(`Found continuation marker: ${continuationMarker}`);
                this.queryRequest.continuationMarker = continuationMarker;
                records.push(...await this.execute());
            }
            return records;
        } catch (err) {
            throw new iCPSError(CLOUD_KIT_ERR.QUERY).addCause(err);
        }
    }
}

/**
 * Creates a CloudKit query for the IndexingState record type
 */
export class CloudKitIndexingState extends CloudKitQuery<QueryRecordTypeValue.INDEXING_STATE> {
    constructor(zone: QueryBuilder.Zones) {
        super(zone, QueryRecordTypeValue.INDEXING_STATE);
    }

    async execute(): Promise<RecordDictionary<QueryRecordTypeValue.INDEXING_STATE>[]> {
        try {
            const records = await super.execute();
            if(records.length !== 1) {
                throw new iCPSError(CLOUD_KIT_ERR.TOO_MANY_RECORDS).addContext('response', records)
            }
            return [Resources.validator().validateIndexingStateRecordDictionary(records[0])];
        } catch (err) {
            throw new iCPSError(CLOUD_KIT_ERR.INDEXING_STATE).addCause(err);
        }
    }
}

export class CloudKitFetch implements CloudKit {
    endpoint = ENDPOINTS.PHOTOS.PATH.FETCH_CHANGES;
    request: CloudKitFetchChangesRequest;
    constructor(
        zoneID: PhotosAccountZone,
        options: FetchChangesOptions
    ) { }

    execute(): Promise<CloudKitFetchResponse> {

    }
}

export class 