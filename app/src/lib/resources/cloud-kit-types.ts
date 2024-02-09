// See https://developer.apple.com/library/archive/documentation/DataManagement/Conceptual/CloudKitWebServicesReference/QueryingRecords.html#//apple_ref/doc/uid/TP40015240-CH5-SW4

import { PhotosAccountZone } from "./resource-types.js"

export type CloudKitQueryResponse<T extends RecordType> = {
  data: {
    /**
     * An array containing a result dictionary for each record requested. If successful, the result dictionary contains the keys described in Record Dictionary. If unsuccessful, the result dictionary contains the keys described in Record Fetch Error Dictionary.
     */
    records: RecordDictionary<T>[]
    /**
     * If included, indicates that there are more results matching this query. To fetch the other results, pass the value of the continuationMarker key as the value of the continuationMarker key in another query.
     */
    continuationMarker?: string
  }
}

export type CloudKitQueryRequest = {
  /**
   * A dictionary that identifies a record zone in the database, described in Zone ID Dictionary.
   */
  zoneID: PhotosAccountZone,
  /**
   * The maximum number of records to fetch. The default is the maximum number of records in a response that is allowed, described in Data Size Limits.
   * @see https://developer.apple.com/library/archive/documentation/DataManagement/Conceptual/CloudKitWebServicesReference/PropertyMetrics.html#//apple_ref/doc/uid/TP40015240-CH23-SW1
   */
  resultsLimit?: number,
  /**
   * The query to apply, described in Query Dictionary. This key is required.
   */
  query: QueryDictionary,
  /**
   * The location of the last batch of results. Use this key when the results of a previous fetch exceeds the maximum. See Response. The default value is null.
   */
  continuationMarker?: string,
  /**
   * An array of strings containing record field names that limits the amount of data returned in this operation. Only the fields specified in the array are returned. The default is null, which fetches all record fields.
   */
  desiredKeys?: PhotosFieldKey[],
  /**
   * A Boolean value determining whether all zones should be searched. This key is ignored if zoneID is non-null. To search all zones, set to true. To search the default zone only, set to false.
   */
  zoneWide?: boolean
}

export type CloudKitOperationRequest = {
  /**
   * An array of dictionaries defining the operations to apply to records in the database. The dictionary keys are described in Record Operation Dictionary. See Data Size Limits for maximum number of operations allowed. This key is required.
   * @see https://developer.apple.com/library/archive/documentation/DataManagement/Conceptual/CloudKitWebServicesReference/PropertyMetrics.html#//apple_ref/doc/uid/TP40015240-CH23-SW1
   */
  operations: OperationDictionary[],
  /**
   * A dictionary that identifies a record zone in the database, described in Zone ID Dictionary.
   */
  zoneID: ZoneIDDictionary,
  /**
   * A Boolean value indicating whether the entire operation fails when one or more operations fail.
   * If true, the entire request fails if one operation fails. If false, some operations may succeed and others may fail.
   * Note this property only applies to custom zones.
   * @default true
   */
  atomic?: boolean,
  /**
   * An array of strings containing record field names that limit the amount of data returned in the enclosing operation dictionaries. Only the fields specified in the array are returned. The default is null, which fetches all record fields.
   */
  desiredKeys?: PhotosFieldKey[],
  /**
   * A Boolean value indicating whether number fields should be represented by strings.
   * @default false
   */
  numbersAsStrings?: boolean,
}

export type CloudKitOperationResponse = {
}

export enum PhotosFieldKey {
  RECORD_NAME = `recordName`,
  IS_DELETED = `isDeleted`,
  ORIGINAL_RESOURCE = `resOriginalRes`,
  ORIGINAL_RESOURCE_FILE_TYPE = `resOriginalFileType`,
  JPEG_RESOURCE = `resJPEGFullRes`,
  JPEG_RESOURCE_FILE_TYPE = `resJPEGFullFileType`,
  VIDEO_RESOURCE = `resVidFullRes`,
  VIDEO_RESOURCE_FILE_TYPE = `resVidFullFileType`,
  ENCODED_FILE_NAME = `filenameEnc`,
  FAVORITE = `isFavorite`,
  IS_HIDDEN = `isHidden`,
  ADJUSTMENT_TYPE = `adjustmentType`,
  MASTER_REF = `masterRef`,
  // Progress state
  PROGRESS = `progress`,
  STATE = `state`,
}

export type RecordType = RecordTypeValue | QueryRecordTypeValue;

export enum RecordTypeValue {
  /**
   * Record 
   */
  CPL_MASTER = `CPLMaster`,
  CPL_ASSET = `CPLAsset`,
  CPL_ALBUM = `CPLAlbum`,
  CONTAINER_RELATION = `CPLContainerRelation`, // Useless at the moment
}

/**
 * Record type values used in queries
 */
export enum QueryRecordTypeValue {
  /**
   * Used to get the indexing state of a zone
   */
  INDEXING_STATE = `CheckIndexingState`,
  /**
   * Used to get photos records
   */
  PHOTO_RECORDS = `CPLContainerRelationLiveByPosition`, // Record CPLContainerRelationLiveByAssetDate
  ALBUM_RECORDS = `CPLAlbumByPositionLive`,
  INDEX_COUNT = `HyperionIndexCountLookup`,
  ALL_PHOTOS = `CPLAssetAndMasterByAssetDateWithoutHiddenOrDeleted`, // CPLAssetAndMasterByAssetDateWithoutHiddenOrDeleted
}

/**
 * A CKValue represents a field type value.
 */
type CKValue = AssetDictionary | boolean | string | number | LocationDictionary | ReferenceDictionary | CKValue[];

export type RecordDictionary<T extends RecordType> = {
  /**
   * A record dictionary describes a record in a database. Some keys in the record dictionary are used in requests and others appear in responses. Also, some keys are specific to whether the record is shared or is a share, a record of type cloudKit.shared.
   */
  recordName: string;
  /**
   * The name of the record type. This key is required for certain operations if the record doesn’t exist.
   */
  recordType: T;
  /**
   * A string containing the server change token for the record. Use this tag to indicate which version of the record you last fetched. This key is required if the operation type is update, replace, or delete. This key is not required if the operation is forceUpdate, forceReplace, or forceDelete.
   */
  recordChangeTag: string;
  /**
   * The dictionary of key-value pairs whose keys are the record field names and values are field-value dictionaries, described in Record Field Dictionary. The default value is an empty dictionary. If the operation is create and this key is omitted or set to null, all fields in a newly created record are set to null.
   */
  fields: RecordFields &
    T extends QueryRecordTypeValue.INDEXING_STATE ? ProgressRecordField & StateRecordField : {} ;
}

interface RecordFields {
  [key: string]: RecordFieldDictionary;
}

interface ProgressRecordField extends RecordFields {
    progress: {
      value: number,
      type: "NUMBER_INT64"
    }
}

interface StateRecordField extends RecordFields {
  state: {
    value: "FINISHED" | "RUNNING",
    type: "STRING"
  }
}

/**
 * An asset dictionary represents an Asset field type
 */
type AssetDictionary = {
    /**
     * The signature of a file returned from the file upload step. This key is required for the public and private database.
     */
    fileChecksum: string;
    /**
     * The size of the file, calculated by the asset upload step. This key is required for the public and private database.
     */
    size: number;
    /**
     * The checksum of the wrapping key returned from the upload step. This key is required for the private database
     */
    referenceChecksum: string;
    /**
     * The secret key used to encrypt the asset. This key is required for the private database.
     */
    wrappingKey: string;
    /**
     * The receipt for uploading the asset, described in Upload Asset Data. This key is required for the public and private database when saving the enclosing record.
     */
    receipt: string;
    /**
     * The location of the asset data to download. This key is present only when fetching the enclosing record.
     */
    downloadURL: string;
};

type QueryDictionary = {
  /**
   * The name of the record type. This key is required.
   */
  recordType: RecordTypeValue | QueryRecordTypeValue;
  /**
   * An Array of filter dictionaries (described in Filter Dictionary) used to determine whether a record matches the query.
   */
  filterBy?: FilterDictionary[];
  /**
   * An Array of sort descriptor dictionaries (described in Sort Descriptor Dictionary) that specify how to order the fetched records.
   */
  sortBy?: SortDescriptorDictionary[];
};

/**
 * A location dictionary represents values used to set a field of type Location with the following keys.
 */
type LocationDictionary = {
    /**
     * The latitude of the coordinate point. This key is required.
     */
    latitude: number,
    /**
     * The longitude of the coordinate point. This key is required.
     */
    longitude: number,
    /**
     * The radius of uncertainty for the location, measured in meters.
     */
    horizontalAccuracy?: number,
    /**
     * The accuracy of the altitude value in meters.
     */
    verticalAccuracy?: number,
    /**
     * The altitude measured in meters.
     */
    altitude?: number,
    /**
     * The instantaneous speed of the device in meters per second.
     */
    speed?: number,
    /**
     * The direction in which the device is traveling.
     */
    course?: string,
    /**
     * The time at which this location was determined.
     */
    timestamp: number
};

enum ActionValue {
  /**
   * No action when a referenced record is deleted.
   * @see https://developer.apple.com/documentation/cloudkit/ckreferenceaction/ckreferenceactionnone
   */
  NONE = `NONE`,
  /**
   * Deletes a source record when the target record is deleted. See CKReferenceActionDeleteSelf.
   * @see https://developer.apple.com/documentation/cloudkit/ckrecord/referenceaction/deleteself
   */
  DELETE_SELF = `DELETE_SELF`,
  /**
   * Deletes a target record only after all source records are deleted. Verifies that the target record exists before creating this type of reference. If it doesn’t exist, creating the reference fails.
   */
  VALIDATE = `VALIDATE`
}

/**
 * A reference dictionary represents a Reference field type with the following keys:
 */
type ReferenceDictionary = {
  /**
   * The unique name used to identify the record within a zone. This key is required.
   */
  recordName: string;
  /**
   * The dictionary that identifies a record zone in the database, described in Zone ID Dictionary.
   */
  zoneID: ZoneIDDictionary;
  /**
   * The delete action for the reference object. This key is required unless the dictionary is included in a query.
   */
  action: ActionValue;
};

/**
 * A zone dictionary describes a successful zone fetch containing the following keys:
 */
type ZoneDictionary = {
  /**
   * The dictionary that identifies a record zone in the database, described in Zone ID Dictionary.
   */
  zoneID: ZoneIDDictionary;
  /**
   * The current point in the zone’s change history.
   */
  syncToken: string;
  /**
   * A Boolean value indicating whether this zone supports atomic operations.
   */
  atomic: boolean;
};

/**
 * The zone ID identifies an area for organizing related records in a database.
 */
type ZoneIDDictionary = {
  /**
   * The name that identifies the record zone. The default value is _defaultZone, which indicates the default zone of the current database. This key is required.
   * @default "_defaultZone"
   */
  zoneName: string
  /**
   * String representing the zone owner’s user record name. Use this key to identify a zone owned by another user. The default value is the current user’s record name.
   */
  ownerRecordName: string
};

type RecordFieldType = "STRING" | "NUMBER_INT64";

export type RecordFieldDictionary = {
  value: CKValue;
  type: RecordFieldType;
};

type ComparatorValue = `EQUALS` // The left-hand value is equal to the right-hand value.
  | `NOT_EQUALS` // The left-hand value is not equal to the right-hand value.
  | `LESS_THAN` // The left-hand value is less than the right-hand value.
  | `LESS_THAN_OR_EQUALS` // The left-hand value is less than or equal to the right-hand value.
  | `GREATER_THAN` // The left-hand value is greater than the right-hand value.
  | `GREATER_THAN_OR_EQUALS` // The left-hand value is greater than or equal to the right-hand value.
  | `NEAR` // The left-hand location is within the specified distance of the right-hand location.
  | `CONTAINS_ALL_TOKENS` // The records have text fields that contain all specified tokens.
  | `IN` // The left-hand value is in the right-hand list.
  | `NOT_IN` // The left-hand value is not in the right-hand list.
  | `CONTAINS_ANY_TOKENS` // The records with text fields contain any of the specified tokens.
  | `LIST_CONTAINS` // The records contain values in a list field.
  | `NOT_LIST_CONTAINS` // The records don’t contain the specified values in a list field.
  | `NOT_LIST_CONTAINS_ANY` // The records don’t contain any of the specified values in a list field.
  | `BEGINS_WITH` // The records with a field that begins with a specified value.
  | `NOT_BEGINS_WITH` // The records with a field that doesn’t begin with a specified value.
  | `LIST_MEMBER_BEGINS_WITH` // The records contain a specified value as the first item in a list field.
  | `NOT_LIST_MEMBER_BEGINS_WITH` // The records don’t contain a specified value as the first item in a list field.
  | `LIST_CONTAINS_ALL` // The records contain all values in a list field.
  | `NOT_LIST_CONTAINS_ALL` // The records don’t contain all specified values in a list field.

/**
 * A filter dictionary defines the logical conditions for determining whether a record matches the query.
 */
export type FilterDictionary = {
    /**
     * A string representing the filter comparison operator. Possible values are described in Comparator Values. This key is required.
     */
    comparator: ComparatorValue,
    /**
      * The name of a field belonging to the record type.
      */
    fieldName: string,
    /**
     * A field-value dictionary, described in Record Field Dictionary, representing the value of the field that you want all fetched records to match. This key is required.
     */
    fieldValue: RecordFieldDictionary
    /**
     * A radius in meters used to determine whether a field of type Location is inside a circular area. The center of the circle is fieldValue and the radius is distance. The key is used only if fieldName is a Location type.
     */
    distance: number
}

/**
 * A sort descriptor dictionary determines the order of the fetched records.
 */
export type SortDescriptorDictionary = {
  /**
   * The name of a field belonging to the record type. Used to sort the fetched records. This key is required.
   */
  fieldName: string,
  /**
   * A Boolean value that indicates whether the fetched records should be sorted in ascending order. If true, the records are sorted in ascending order. If false, the records are sorted in descending order. The default value is true.
   */
  ascending: boolean,
  /**
   * A field-value dictionary, described in Record Field Dictionary, that is the reference location to use when sorting. Records are sorted based on their distance to this location. Used only if fieldName is a Location type.
   */
  relativeLocation?: RecordFieldDictionary
}

export type OperationDictionary = {
  /**
   * The type of operation. Possible values are described in Operation Type Values. This key is required.
   */
  operationType: OperationTypeValues,
  /**
   * A dictionary representing the record to modify, as described in Record Dictionary. This key is required.
   */
  record: RecordDictionary<RecordType>,
  /**
   * An array of strings containing record field names that limits the amount of data returned in this operation. Only the fields specified in the array are returned. The default is null, which fetches all record fields. This desiredKeys setting overrides the desiredKeys setting in the enclosing dictionary.
   */
  desiredKeys?: PhotosFieldKey[]
}

/**
 * The possible values for the operationType key are:
 */
export enum OperationTypeValues {
  /**
   * Create a new record. This operation fails if a record with the same record name already exists.
   */
  CREATE = `create`,
  /**
   * Update an existing record. Only the fields you specify are changed.
   */
  UPDATE = `update`,
  /**
   * Update an existing record regardless of conflicts. Creates a record if it doesn’t exist.
   */
  FORCE_UPDATE = `forceUpdate`,
  /**
   * Replace a record with the specified record. The fields whose values you do not specify are set to null.
   */
  REPLACE = `replace`,
  /**
   * Replace a record with the specified record regardless of conflicts. Creates a record if it doesn’t exist.
   */
  FORCE_REPLACE = `forceReplace`,
  /**
   * Delete the specified record.
   */
  DELETE = `delete`,
  /**
   * Delete the specified record regardless of conflicts.
   */
  FORCE_DELETE = `forceDelete`
}
