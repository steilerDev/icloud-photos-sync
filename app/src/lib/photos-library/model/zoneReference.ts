import { PhotosSetupResponseZone } from "../../resources/network-types.js";

export type ZoneReference = PhotosSetupResponseZone & {
    zoneID: {
        area: 'private' | 'shared',
    }
}