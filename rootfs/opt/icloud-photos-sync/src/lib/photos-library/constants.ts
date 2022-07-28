export const ASSET_DIR = `all-photos`;

export enum EVENTS {
    SAVED = `saved`,
    READY = `ready`,
    ERROR = `error`
}

export type DiffFlag = `deleted` | `moved` | `added`