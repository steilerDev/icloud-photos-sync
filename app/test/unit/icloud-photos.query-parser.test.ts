import {describe, expect, test} from '@jest/globals';
import {AssetID, CPLAlbum, CPLAsset, CPLMaster} from '../../src/lib/icloud/icloud-photos/query-parser';

const rawAssetID = {
    type: `ASSETID`,
    value: {
        fileChecksum: `someChecksum`,
        size: 42,
        wrappingKey: `someWrappingKey`,
        referenceChecksum: `someReferenceChecksum`,
        downloadURL: `https://cvws.icloud-content.com/someAsset`,
    },
};

const rawMaster = {
    recordType: `CPLMaster`,
    recordName: `someMaster`,
    modified: {timestamp: 1000},
    fields: {
        resOriginalRes: rawAssetID,
        resOriginalFileType: {value: `public.jpeg`},
        filenameEnc: {value: `c29tZUZpbGUuanBlZw==`},
    },
    zoneID: {zoneName: `PrimarySync`},
};

const rawAsset = {
    recordType: `CPLAsset`,
    recordName: `someAsset`,
    modified: {timestamp: 2000},
    fields: {
        masterRef: {value: {recordName: `someMaster`}},
    },
    zoneID: {zoneName: `PrimarySync`},
};

const rawAlbum = {
    recordType: `CPLAlbum`,
    recordName: `someAlbum`,
    modified: {timestamp: 3000},
    fields: {
        albumType: {value: 0},
        albumNameEnc: {value: `c29tZUFsYnVt`},
    },
};

describe(`AssetID`, () => {
    test(`Parses valid record`, () => {
        expect(AssetID.parseFromQuery(rawAssetID)).toEqual({
            fileChecksum: `someChecksum`,
            size: 42,
            wrappingKey: `someWrappingKey`,
            referenceChecksum: `someReferenceChecksum`,
            downloadURL: `https://cvws.icloud-content.com/someAsset`,
        });
    });

    test.each([
        {
            desc: `Wrong type`,
            record: {...rawAssetID, type: `STRING`},
        }, {
            desc: `Missing type`,
            record: {value: rawAssetID.value},
        }, {
            desc: `Missing download URL`,
            record: {...rawAssetID, value: {...rawAssetID.value, downloadURL: undefined}},
        }, {
            desc: `Missing checksum`,
            record: {...rawAssetID, value: {...rawAssetID.value, fileChecksum: undefined}},
        },
    ])(`Rejects $desc`, ({record}) => {
        expect(() => AssetID.parseFromQuery(record)).toThrow(/^Unexpected query format for assetId$/);
    });
});

describe(`CPLMaster`, () => {
    test(`Parses valid record`, () => {
        const master = CPLMaster.parseFromQuery(rawMaster);

        expect(master.recordName).toEqual(`someMaster`);
        expect(master.modified).toEqual(1000);
        expect(master.resource).toEqual(AssetID.parseFromQuery(rawAssetID));
        expect(master.resourceType).toEqual(`public.jpeg`);
        expect(master.filenameEnc).toEqual(`c29tZUZpbGUuanBlZw==`);
        expect(master.zoneName).toEqual(`PrimarySync`);
    });

    test.each([
        {
            desc: `Wrong record type`,
            record: {...rawMaster, recordType: `CPLAsset`},
        }, {
            desc: `Missing record name`,
            record: {...rawMaster, recordName: undefined},
        }, {
            desc: `Missing original resource`,
            record: {...rawMaster, fields: {...rawMaster.fields, resOriginalRes: undefined}},
        }, {
            desc: `Invalid original resource`,
            record: {...rawMaster, fields: {...rawMaster.fields, resOriginalRes: {...rawAssetID, type: `STRING`}}},
        }, {
            desc: `Missing zone name`,
            record: {...rawMaster, zoneID: {}},
        },
    ])(`Rejects $desc`, ({record}) => {
        expect(() => CPLMaster.parseFromQuery(record)).toThrow(/^Unexpected query format for CPL Master$/);
    });
});

describe(`CPLAsset`, () => {
    test(`Parses unmodified record`, () => {
        const asset = CPLAsset.parseFromQuery(rawAsset);

        expect(asset.recordName).toEqual(`someAsset`);
        expect(asset.masterRef).toEqual(`someMaster`);
        expect(asset.favorite).toEqual(0);
        expect(asset.modified).toEqual(2000);
        expect(asset.zoneName).toEqual(`PrimarySync`);
        expect(asset.adjustmentType).toBeUndefined();
        expect(asset.resource).toBeUndefined();
        expect(asset.resourceType).toBeUndefined();
    });

    test(`Parses favorite`, () => {
        const asset = CPLAsset.parseFromQuery({...rawAsset, fields: {...rawAsset.fields, isFavorite: {value: 1}}});

        expect(asset.favorite).toEqual(1);
    });

    test.each([
        {
            desc: `Edited photo`,
            fields: {
                adjustmentType: {value: `com.apple.photo`},
                resJPEGFullRes: rawAssetID,
                resJPEGFullFileType: {value: `public.jpeg`},
            },
            expectedResourceType: `public.jpeg`,
        }, {
            desc: `Edited video`,
            fields: {
                adjustmentType: {value: `com.apple.video`},
                resVidFullRes: rawAssetID,
                resVidFullFileType: {value: `com.apple.quicktime-movie`},
            },
            expectedResourceType: `com.apple.quicktime-movie`,
        },
    ])(`Parses $desc`, ({fields, expectedResourceType}) => {
        const asset = CPLAsset.parseFromQuery({...rawAsset, fields: {...rawAsset.fields, ...fields}});

        expect(asset.adjustmentType).toEqual(fields.adjustmentType.value);
        expect(asset.resource).toEqual(AssetID.parseFromQuery(rawAssetID));
        expect(asset.resourceType).toEqual(expectedResourceType);
    });

    test(`Parses Slo-Mo video without edited resource`, () => {
        const asset = CPLAsset.parseFromQuery({...rawAsset, fields: {...rawAsset.fields, adjustmentType: {value: `com.apple.video.slomo`}}});

        expect(asset.adjustmentType).toEqual(`com.apple.video.slomo`);
        expect(asset.resource).toBeUndefined();
        expect(asset.resourceType).toBeUndefined();
    });

    test.each([
        {
            desc: `Wrong record type`,
            record: {...rawAsset, recordType: `CPLMaster`},
        }, {
            desc: `Missing record name`,
            record: {...rawAsset, recordName: undefined},
        }, {
            desc: `Missing master reference`,
            record: {...rawAsset, fields: {}},
        }, {
            desc: `Missing modified timestamp`,
            record: {...rawAsset, modified: undefined},
        }, {
            desc: `Missing zone name`,
            record: {...rawAsset, zoneID: {}},
        }, {
            desc: `Adjusted without edited resource`,
            record: {...rawAsset, fields: {...rawAsset.fields, adjustmentType: {value: `com.apple.photo`}}},
        }, {
            desc: `Adjusted with invalid edited photo resource`,
            record: {...rawAsset, fields: {...rawAsset.fields, adjustmentType: {value: `com.apple.photo`}, resJPEGFullRes: {...rawAssetID, type: `STRING`}, resJPEGFullFileType: {value: `public.jpeg`}}},
        }, {
            desc: `Adjusted without edited photo file type`,
            record: {...rawAsset, fields: {...rawAsset.fields, adjustmentType: {value: `com.apple.photo`}, resJPEGFullRes: rawAssetID}},
        }, {
            desc: `Adjusted with invalid edited video resource`,
            record: {...rawAsset, fields: {...rawAsset.fields, adjustmentType: {value: `com.apple.video`}, resVidFullRes: {...rawAssetID, type: `STRING`}, resVidFullFileType: {value: `com.apple.quicktime-movie`}}},
        }, {
            desc: `Adjusted without edited video file type`,
            record: {...rawAsset, fields: {...rawAsset.fields, adjustmentType: {value: `com.apple.video`}, resVidFullRes: rawAssetID}},
        },
    ])(`Rejects $desc`, ({record}) => {
        expect(() => CPLAsset.parseFromQuery(record)).toThrow(/^Unexpected query format for CPL Asset$/);
    });
});

describe(`CPLAlbum`, () => {
    test(`Parses root album`, () => {
        const album = CPLAlbum.parseFromQuery(rawAlbum);

        expect(album.recordName).toEqual(`someAlbum`);
        expect(album.modified).toEqual(3000);
        expect(album.albumType).toEqual(0);
        expect(album.albumNameEnc).toEqual(`c29tZUFsYnVt`);
        expect(album.parentId).toBeUndefined();
        expect(album.assets).toBeUndefined();
    });

    test(`Parses nested album with assets`, () => {
        const assets = {'someAsset.jpeg': `someFile.jpeg`};
        const album = CPLAlbum.parseFromQuery({...rawAlbum, fields: {...rawAlbum.fields, parentId: {value: `someFolder`}}}, assets);

        expect(album.parentId).toEqual(`someFolder`);
        expect(album.assets).toEqual(assets);
    });

    test.each([
        {
            desc: `Wrong record type`,
            record: {...rawAlbum, recordType: `CPLAsset`},
        }, {
            desc: `Missing record name`,
            record: {...rawAlbum, recordName: undefined},
        }, {
            desc: `Missing modified timestamp`,
            record: {...rawAlbum, modified: {}},
        }, {
            desc: `Missing album type`,
            record: {...rawAlbum, fields: {...rawAlbum.fields, albumType: {}}},
        }, {
            desc: `Missing album name`,
            record: {...rawAlbum, fields: {...rawAlbum.fields, albumNameEnc: {}}},
        },
    ])(`Rejects $desc`, ({record}) => {
        expect(() => CPLAlbum.parseFromQuery(record)).toThrow(/^Unexpected query format for CPL Album$/);
    });
});
