import {PhotosSetupResponseZone} from "../../resources/network-types.js";

export type ZoneReference = PhotosSetupResponseZone & {
    area: `private` | `shared`;
}