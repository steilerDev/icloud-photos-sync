# Library Version 2 (Design)

!!! info "Status: accepted design, implementation pending"
    This page describes the target design of the local library for v6.0.0 ([#354](https://github.com/steilerDev/icloud-photos-sync/issues/354)), agreed in October 2026. Nothing on this page is implemented yet. The current layout is described in [Local File Structure](local-file-structure.md), which will be rewritten once v6 ships.

## Why a new layout

The v1 library treats the file system as the only state. Every asset is one file named `<base64url(fileChecksum)>.<ext>` in `_All-Photos`, verified by size and modification time. Every album is a hidden `.{UUID}` folder full of symlinks. That design causes the following problems:

| Problem | Issues |
|---|---|
| A hard-coded UTI→extension map is needed in both directions. Unknown or `unsupported` types drop assets. | [#143](https://github.com/steilerDev/icloud-photos-sync/issues/143) |
| Correctness depends on mtimes. A metadata-only change (e.g. favouriting an edited photo) re-downloads the edit, because its expected mtime is the CPLAsset record's `modified` timestamp. | [#342](https://github.com/steilerDev/icloud-photos-sync/issues/342), [#355](https://github.com/steilerDev/icloud-photos-sync/issues/355) |
| Loading means a synchronous scan with one `stat` per file, which blocks the event loop on large libraries. | [#291](https://github.com/steilerDev/icloud-photos-sync/issues/291), [#1006](https://github.com/steilerDev/icloud-photos-sync/issues/1006) |
| Only one file per asset: no Live Photo videos, no other resolutions. | [#121](https://github.com/steilerDev/icloud-photos-sync/issues/121), [#279](https://github.com/steilerDev/icloud-photos-sync/discussions/279) |
| No state besides "in iCloud" and "deleted", so archiving is a copy-out and age-based archiving is impossible. | [#314](https://github.com/steilerDev/icloud-photos-sync/issues/314), [#284](https://github.com/steilerDev/icloud-photos-sync/issues/284) |
| Album changes rewrite the whole album. A link-name collision rewrites it on every sync. | [#212](https://github.com/steilerDev/icloud-photos-sync/issues/212), [#141](https://github.com/steilerDev/icloud-photos-sync/issues/141) |
| Symlinks are invisible in Synology Photos, File Station and a default Nextcloud. | [D#161](https://github.com/steilerDev/icloud-photos-sync/discussions/161) |

Issue #354 also absorbed further features, which all depend on a new layout: XMP sidecars ([#912](https://github.com/steilerDev/icloud-photos-sync/issues/912)), age-based archiving ([#284](https://github.com/steilerDev/icloud-photos-sync/issues/284)) and shared albums ([#930](https://github.com/steilerDev/icloud-photos-sync/issues/930)).

## Requirements

- **Efficient diff.** Only download what is not on disk. Correctness must not rely on timestamps or similar heuristics.
- **No database.** All state is JSON.
- **Metadata cleaning.** A reconcile step makes the JSON match what is on disk. The diff then works on JSON and file names only, never on the (potentially large) asset files.
- **Never lose user data.** An incomplete remote fetch never deletes anything. Foreign files are never touched.
- **Readable without icps.** Every synced file is a plain file with its original iCloud file name in a date folder (`_All Photos/2023/07/IMG_1234.HEIC`). The library can be browsed in any file manager and over SMB, and imported as-is by Immich (external library), PhotoPrism, Synology Photos and Nextcloud. With the default hard links, removing icps or deleting `.library-data/` leaves an ordinary photo folder behind. This is the layout users know from icloudpd, and the v1 layout's checksum names and symlinks were its main usability gap (see [Views](#views)).
- **Complete Live Photos.** The video part of a Live Photo can be synced (`live` version, [#121](https://github.com/steilerDev/icloud-photos-sync/issues/121)). It shares the still's stem in the same folder (`IMG_1234.HEIC` + `IMG_1234.mov`), so name-based viewers such as PhotoPrism stack the pair, and archiving never deletes a Live Photo whose video is missing locally (see [Archive](#archive)).

## Decisions

| Topic | Decision |
|---|---|
| Store | Blob store plus 256 JSON shards (see [Alternatives considered](#alternatives-considered)) |
| Views | Readable layout for every library, including migrated ones |
| Link mode | Hard links by default; symlink and copy are explicit options |
| Migration | Automatic, and every v1 file is hashed before the switch |
| Release | v5.1.0 guards → 6.0.0 core → 6.1 XMP → 6.2 shared albums → 6.3 age-based archive |
| Extensions | Originals: from their iCloud file name. Rendered files: iCloud's type string plus Apple render-type exceptions. No UTI map, no content sniffing. |
| Extension case | Originals keep their file name's case; rendered files are lower case (`IMG_1234.HEIC`, `IMG_1234-edited.jpeg`, `IMG_1234.mov`) |
| Versions | `--versions` with `original`, `edited`, `live`, `medium`, `thumb`. The default `original,edited` keeps today's behaviour. |
| Reduced versions | `medium` and `thumb` show the asset's current look (the edit if edited) |
| Archive | `archive <path>` accepts album and meta-view folders. `--archive-keep` defaults to `favorites`. `--archive-shared-library` is an explicit opt-in. |

## Overview

v1 packs three things into one file name. v2 keeps them apart, and each layer has exactly one identity and one source of truth:

| Layer | Identity | Source of truth |
|---|---|---|
| **Content**: the downloaded bytes | iCloud `fileChecksum` | the names in the blob store; a blob gets its name only after verification |
| **Records**: what iCloud says about assets and albums, plus the state only icps owns (lifecycle, claimed names) | source + CPLAsset `recordName`; CPLAlbum `recordName` | 256 JSON shards |
| **Views**: everything users and viewers browse | claimed names | derived from the records; hard links to blobs |

The JSON never asserts that content is present. It only records references (what must exist) and ownership (which visible names belong to icps). Both are checked on every sync with names-only directory listings.

### On-disk layout

Store and views must be on the same mount (`DATA_DIR`), because every view entry is a hard link to its blob. In Docker this means a single volume for the data directory; mounting view folders separately breaks the links.

```
<DATA_DIR>/
├─ .icloud-photos-sync                 resource file, shape unchanged; libraryVersion: 2
├─ .library.lock
├─ .library-data/                      skipped by Immich/PhotoPrism; contains .nomedia and .photoviewignore
│  ├─ library.json (+.bak)             library state: layout version, config, account, run counter
│  ├─ state/00.json … ff.json (+.bak)  256 JSON shards; shard = first byte of sha1(record key)
│  ├─ blobs/00/ … ff/<hex checksum>    every resource file exactly once, mode 0444, no extension
│  ├─ journal.jsonl                    release intents of the running sync
│  ├─ archive-ledger.jsonl             append-only record of remote deletes
│  ├─ tmp/  quarantine/  reserve
│  └─ migration/                       verification progress, path map, report
├─ _All Photos/2023/07/IMG_1234.HEIC          personal library, not hidden
│                     IMG_1234-edited.jpeg
│                     IMG_1234.mov            Live Photo video (opt-in)
├─ _Shared Photos/YYYY/MM/…                   iCloud Shared Library
├─ _Hidden Photos/YYYY/MM/…                   with --sync-hidden
├─ _Trash/<view path>                         soft-deleted content
└─ Travel/Paris 2023/IMG_1234.HEIC            iCloud folders and albums as real directories
```

### Records

Each record type is registered in `app/build/schema.ts` and validated on load. The record types allow additional properties, so that newer minor versions can add fields.

```ts
type ResourceKey = `original` | `edited` | `live` | `editedLive` | `medium` | `thumb`;
type ResourceRef = {c: string /* fileChecksum */, s: number /* size */, t?: string /* type as sent */, l?: string /* local digest, unverifiable classes only */};
type AssetRecord = {kind: `asset`, state: `synced` | `missing` | `archived`, missingSince?: number,
    meta: {file?: string, taken?: number, tz?: number, added?: number, fav?: 1, hidden?: 1},
    res: Partial<Record<ResourceKey, ResourceRef>>,
    names: Partial<Record<`all` | `shared` | `hidden`, string>>,   // claimed stems, e.g. "2023/07/IMG_1234"
    in?: Record<string, string>,                                    // album key → claimed stem
    retired?: {path: string, c: string}[]};                         // pending view work
type AlbumRecord = {kind: `album`, type: `folder` | `album`, name: string, parent?: string,
    dir: string, pendingDir?: string, dev?: number, ino?: number, frozen?: {by: `archive` | `v1-archive`}};
type TombstoneRecord = {kind: `gone`, reason: `deleted` | `moved` | `excluded`, names: Record<string, string>,
    trash?: {res: Partial<Record<ResourceKey, ResourceRef>>, seen?: number}, retired?: {path: string, c: string}[]};
```

- **Keys.** Records are keyed `p:`/`s:` + CPLAsset `recordName` (personal or shared library) and `a:` + CPLAlbum `recordName`.
- **Size.** A shard holds about 1,200 records at 300k assets (about 470 KB).
- **Stable bytes.** Writers produce canonical JSON (sorted keys) and records hold no volatile fields such as change tags, timestamps or download URLs. A sync without remote changes therefore writes **0 bytes**.

## Identity and lifecycle

- **Content.** The iCloud `fileChecksum` is the content identity (see [File checksum](api.md#file-checksum)), stored once, as hex. This absorbs three cases with 0 downloads:
    - assets sharing a master (iOS "Duplicate");
    - masters present in both the personal and the shared library zone;
    - moves between the two zones.
- **Visible names.** They are claimed once and never recomputed. Tombstoned names are never reused, because viewers such as Immich identify assets by path.

| From | Trigger | To |
|---|---|---|
| none | in a listing | `synced`: names claimed, missing content downloaded |
| `synced` | normalized projection changed | `synced`: re-download only if a checksum changed; superseded content released |
| `synced` | absent from a complete listing (all sources and the hidden index complete) | `missing` |
| `missing` | absent again in a **later** sync, or in Recently Deleted | tombstone `deleted`, through the mass-deletion guard |
| any | vanished while its original checksum is live in another source | tombstone `moved`: no trash, not guarded, 0 downloads |
| `synced` | hidden while `--sync-hidden` is off | tombstone `excluded` |
| `synced` | `archive --remote-delete` (ledger intent) | `synced` until absent, then `archived`; archived assets are never removed by absence |
| `archived` | the user removed every entry (each seen by an earlier sync) | purged; content released |
| tombstone with trash | the asset reappears | revived; trash content and names reused, no download |
| any | record received but unparsed or partial | unchanged |

## Metadata cleaning (every sync)

The cleaning runs in parallel with the remote fetch:

1. **Load.** Load the 256 shards with `.tmp`/`.bak` generation recovery, plus the archive ledger. A recovered generation freezes this sync's releases. A shard with no valid generation stops the sync.
2. **List names only.** List the 256 blob directories, which gives the set of present content, and every view directory the state implies. Any listing error other than `ENOENT` aborts the sync: unknown is not absent.
3. **Finish.** Complete interrupted releases from the journal. After an unclean stop, adopt `tmp/*.part` files whose size and checksum match.
4. **Reconcile in memory:**
    - A referenced checksum that is missing is repaired from an identical view entry if one exists, otherwise downloaded.
    - A blob nobody references is reported as an orphan and **never deleted**.
    - A missing view entry is re-created. Trash and archived entries are the exception: they count as removed by the user only if an earlier sync saw them.
    - Names icps never claimed are foreign and never touched.

**Guarantees, without opening a single asset file:**

- the set of present content is exact;
- every blob holds bytes that were verified when written;
- every claimed view entry is known to be present or absent;
- the state is schema-valid.

**Cost at 300k assets:** about 5k syscalls and 120 MB of JSON, i.e. 50–120 s on a cold HDD NAS (running during the 3–6 minute fetch) and a few seconds on SSD. Today's loader needs about 400k synchronous syscalls.

A deep check, which re-hashes every blob, will be an explicit `verify` command in 6.x.

## Diff

**The remote snapshot**

- It is built page by page into a compact projection.
- A source counts as complete only if the received asset count matches iCloud's count index.
- The hidden index is fetched once per sync.
- A failed album fetch keeps the stored membership instead of dropping the album.

**The plan** is a pure function of the snapshot and the local state:

- **Content:** `downloads = referenced checksums − present − repairable`, with exactly one download job per checksum.
- **Metadata-only changes** (favourite, hide, date, album membership, zone moves) change no checksum, so they cost a record rewrite, never a download.
- **Releases:** `releases = referenced before − referenced after`. Content is never deleted by a scan.
- **Views:** only the entries that changed are created, replaced or removed. A replacement or removal is checked against the entry's identity first.
- **Deletions** need a complete snapshot of every source plus either Recently Deleted evidence or absence in two different syncs.
- **Mass deletions:** more than max(50, 2 %) of a source, or more than half of it, waits one sync. It then goes to the trash even if soft delete is off.
- **Run counter:** a persisted counter makes all retries of one sync count as one.
- **Account binding:** the library is bound to its account. A different Apple ID on the same data directory stops the sync.

## Apply and crash safety

**Order within one attempt:**

1. Commit the records.
2. Album removals and renames; trash links; removal of retired entries.
3. Releases: space is freed before any download, as today.
4. Repairs, then downloads.
5. Final commit.

**Downloads**

- Each one streams into `tmp/` through a transform that computes the salted SHA-1 (see [File checksum](api.md#file-checksum)) and checks it against the expected checksum and size.
- It is published with `link(tmp, blob)`, which never replaces an existing blob, and then hard-linked into its view entries.
- A file whose checksum type is unknown or doesn't match is downloaded a second time. If both downloads give the same digest at the right size, it is accepted and its local digest recorded.

**Durability.** Without Node's permission model (the default image), temp files are synced before they are renamed, and directories at commit points. Under `--permission`, `fsync` is denied, so writes use `O_DSYNC`. v5 currently writes the resource file with a `flush` option that is silently ignored; v5.1 fixes that.

**Two small append-only files** complement the shards:

- **`journal.jsonl`** finishes interrupted deletions.
    - Content is never deleted by scanning, so before a commit makes blobs unreferenced, the sync appends a release intent per checksum. It executes them after the commit and writes `end`.
    - After a crash in between, the next sync re-checks and completes them. Without the journal, those blobs would leak as orphans.
    - The journal only ever holds one sync.
- **`archive-ledger.jsonl`** protects photos once icps has deleted them from iCloud, when the local copy is the only one.
    - Before every remote delete, an intent line with the checksums and a metadata snapshot (caption, keywords, location, dates) is appended with `O_DSYNC`. The file is never rewritten.
    - Any asset with an intent is treated as archived and its content is never released, even if a crash rolls a shard back.
    - If archiving is never used, the file stays empty.

**Lock.** It is created with `link()`; a stale lock is taken over by renaming it. A lost lock aborts before the next destructive step.

## Views

### Versions and resolutions

`--versions <list>` (env `VERSIONS`) selects what is synced. The default `original,edited` matches today's behaviour.

| Value | iCloud resource | View name |
|---|---|---|
| `original` | `resOriginalRes` | `IMG_1234.HEIC` |
| `edited` | `resJPEGFullRes`/`resVidFullRes` (and `resVidComplRes` with `live`) | `IMG_1234-edited.jpeg` |
| `live` | `resOriginalVidComplRes` | `IMG_1234.mov` (`IMG_1234-edited.mov` when edited) |
| `medium` | `resJPEGMedRes` (~2048 px), `resVidMedRes` (~720p) | `IMG_1234-medium.jpeg` |
| `thumb` | `resJPEGThumbRes`, `resVidSmallRes` | `IMG_1234-thumb.jpeg` |

- **Reduced versions** show the asset's current look: the edit's render if the asset is edited, otherwise the original's. Edited assets carry their own reduced renders (observed on 3,829 and 3,841 of 3,841 edited assets).
- **Video renders** (`medium`, `thumb` of videos and Live videos) come as QuickTime or MPEG-4, so their extension is `mov` or `mp4`.
- **RAW originals** also carry a full-size JPEG rendering on the master (`resJPEGFullRes`). A version for it could follow in 6.x, for viewers that can't read RAW.
- **Not a backup:** a selection without `original` is a space-saving copy (e.g. for a photo frame). It never allows remote deletes.
- **Changing the selection** downloads only what was added. It releases deselected files, which can be re-downloaded, but never archived or trashed content.
- **Stable names:** each asset reserves its whole name family (`T`, `T-edited`, `T-medium`, `T-thumb`), so adding a version never renames an existing file.
- **Live Photos:** the still and its video always share the stem (`T.HEIC` + `T.mov`, `T-edited.jpeg` + `T-edited.mov`), even when a collision suffix is needed (`T (1).HEIC` + `T (1).mov`). Enabling `live` later only adds the videos; no still is renamed.

### Names

- **Meta views** use `{yyyy}/{mm}/{name}`; albums are flat (`{name}`).
- **The date** is `assetDate` in the capture's local time zone, falling back to `originalCreationDate`, then `addedDate`. A custom `--name-format` comes in 6.x.
- **Collisions** are resolved by appending ` (n)` to the stem, using a key that ignores case and Unicode normalization, as macOS, Windows and SMB do. Names are claimed in (capture date, recordName) order.
- **The sanitizer** is the same on every host:
    - Windows-reserved characters, control characters and `DEL` become `_`;
    - trailing dots and spaces are removed;
    - a leading `.`, `@` or `#` becomes `_`;
    - reserved device names get a `_` appended;
    - names are normalized to NFC and capped at 143 bytes, including the suffix and room for `.xmp`.

### File extensions

The extension is only used for view names. Stored blobs have no extension, and loading the library never parses one. `file-type.ts` is removed.

- **Originals** take the extension of their iCloud file name (`filenameEnc`) verbatim. This covers the open-ended set of imported formats: camera RAWs, AVI, PSD, WAV, …
- **Rendered files** (edits, Live videos, reduced versions) have no file name of their own. They take the part of their own type string after the last dot, in lower case (`public.jpeg` → `jpeg`, `public.heic` → `heic`).
    - Apple render types that don't follow that pattern are listed explicitly. Edits, Live videos and reduced renders observed in October 2026 used `public.jpeg`, `public.heic`, `com.apple.quicktime-movie` and `public.mpeg-4` (see [Resource variants](api.md#asset-records)). The list therefore holds two entries: `com.apple.quicktime-movie` → `mov` and `public.mpeg-4` → `mp4`. It never covers camera or import formats.
- **Empty, missing or `unsupported` types** get no extension and one summary warning per sync. The asset still syncs.
- **The RAW alternative** of a RAW+JPEG pair (`resOriginalAltRes`) is nameless and open-ended in format. It is deferred to 6.x.
    - A probe of a 33k-asset library with 26,972 Sony ARW originals found no `resOriginalAltRes` at all, because the RAWs were imported without JPEG pairs. Whether iCloud exposes the alternative's file name therefore needs a RAW+JPEG sample.
    - If it doesn't, the alternative gets no extension rather than a guessed one.

### Link modes and trash

| Mode | Visible to | Extra space | Notes |
|---|---|---|---|
| hardlink (default) | every viewer (plain files) | none | needs one mount; `rsync -a` without `-H` copies every link (≈2.2×) |
| symlink | Linux tools, Immich, PhotoPrism; not Synology File Station/Photos, not default Nextcloud | none | under Node's permission model, needs `--allow-fs-write=*` |
| copy | everything, including exFAT | one copy per entry | explicit only |

- **Mode resolution.** `auto` probes hard links with a real file (and checks the inode). On file systems without hard links (exFAT, some FUSE and network mounts) it falls back to symlinks only if the permission model allows them, otherwise it refuses with guidance.
- **Space.** All names of a file share one copy on disk. Deleting a view entry therefore frees nothing while the blob or another entry still refers to it; the space is freed once icps releases the blob.
- **No lock-in.** Only hard links (and copies) survive the removal of `.library-data/` or of icps itself. With symlinks the views break.
- **Trash.**
    - Internal `_Trash`: hard links you can delete to free space.
    - External `--trash-dir`: an exported copy.

### Viewer and backup guidance

- **Any file manager or SMB share:** with hard links, every entry is a plain file, so Windows, macOS Finder, Synology File Station and Nextcloud show the full library, albums included.
- **Immich:** import `_All Photos` (and `_Shared Photos`) as an external library, not the album folders. Immich identifies assets by path, so albums would duplicate them. Immich pairs Live Photos by the content identifier embedded in both files, not by name.
- **PhotoPrism / Synology Photos:** point the originals folder (or the shared folder) at `_All Photos`; `.library-data/` carries `.nomedia`/`.photoviewignore` and is skipped.
- **Backups:** back up `.library-data/` plus the resource file, since views can be rebuilt without downloading anything. Alternatively use `rsync -aH`.

## Archive

`archive <path> [--remote-delete]`:

- **`<path>`** is an album folder, which becomes frozen, or a folder inside a meta view (e.g. `_All Photos/2019`, `_Shared Photos/2019/03`).
- **`--archive-keep <list>`** (env `ARCHIVE_KEEP`) defines what stays in iCloud: `favorites` (default), `none`, or `albums` (6.3).
- **`--archive-shared-library`** (env `ARCHIVE_SHARED_LIBRARY`) allows remote deletes in the iCloud Shared Library.
    - Deleting there removes the photo **for every participant**.
    - It requires the remote delete to be sent to the shared zone, which is not verified yet.
- **Remote deletes** only happen if every original-class file of the asset is present at the start of the sync, whatever `--versions` says: the original; the edit and the edited Live video, if edited; the Live video, if a Live Photo. They are re-verified first. Reduced resolutions never count.
- **Archived assets** stay in `_All Photos` and their albums. Removing all of an archived asset's entries purges it locally.

### Age-based archiving (6.3)

Keeps the whole library locally while iCloud only holds the recent assets ([#284](https://github.com/steilerDev/icloud-photos-sync/issues/284)), so that a viewer pointed at the library still sees the whole collection. It is the counterpart of icloudpd's `--keep-icloud-recent-days`, one of its most requested features. The scope was agreed in [#354](https://github.com/steilerDev/icloud-photos-sync/issues/354); the details below are a proposal, to be decided before 6.3.

- **Option:** `--archive-older-than <days>` (env `ARCHIVE_OLDER_THAN`), off by default. It runs as part of every sync (daemon or `sync`), not as a separate `archive` run.
- **Age:** measured from the later of `addedDate` and `assetDate`, which is normally the date the asset arrived in iCloud. Every asset then stays in iCloud for at least the threshold, as with S3 lifecycle rules and Exchange retention (see the comparison below). Measuring the capture date, as icloudpd does, would delete a scanned or imported old photo from iCloud on the first sync after the import. Taking the later date also keeps assets whose capture date is in the future because of a wrong camera clock.
- **Selection:** assets older than the threshold, minus `--archive-keep` (default `favorites`; `albums` keeps every asset that is in at least one album). The Shared Library is only included with `--archive-shared-library`.
- **Same path as `archive --remote-delete`:** a ledger intent first, then the remote delete, and only if every original-class file (including the Live video) is present and re-verified. A selection without `original` never deletes remotely.
- **Locally:** the asset becomes `archived` and stays in `_All Photos` and its albums, also when the remote album is emptied or deleted. The ledger tells it apart from a delete on a device.
- **Safety:**
    - a dry run that reports what would be deleted (count, size, date range) without deleting anything;
    - a per-sync limit on remote deletes, so that enabling the option on a large library trims iCloud over several syncs instead of all at once. None of the compared tools limits a run, but here the local copy becomes the only one;
    - a summary of every run in the log, the web UI and the metrics.
- **Undo:** a remote delete moves the asset to iCloud's *Recently Deleted* (see [Modify records](api.md#modify-records)), which Apple keeps for 30 days. That is the undo window, just as the trash is for the other tools. The run summary points to it.
- **Out of scope:** uploading back to iCloud. icps never uploads.
- **Seen elsewhere, not proposed:** a "keep the newest N assets" rule (restic `--keep-last`) and a low-space trigger (Windows Storage Sense). None of the compared tools offers a size target such as "keep iCloud below X GB".

**How other tools handle retention** (from their documentation and, for icloudpd and Immich, their source; October 2026):

| Tool | Age measured from | Kept regardless of age | Preview | Undo |
|---|---|---|---|---|
| icloudpd `--keep-icloud-recent-days` | capture date (`assetDate`) | nothing, favourites are not exempt | `--dry-run` | iCloud Recently Deleted |
| Immich app *Free up space* | the device's creation date | favourites and chosen albums (default: favourites) | review screen | the phone's trash |
| Google Photos *Free up space* | manual, no age | items younger than 30 days may stay | space estimate | the cloud copy stays |
| AWS S3 lifecycle rules | object creation | filters (prefix, tag, size), Object Lock | none | noncurrent versions |
| Exchange Online retention | delivery | retention tags, holds | none | Recoverable Items |
| Windows Storage Sense (OneDrive) | last opened | *Always keep on this device* | none | the file stays in OneDrive |
| rclone `move --min-age` | modification time | filters | `--dry-run` | none |

On the first run, S3 queues the whole backlog at once and Exchange works through it on its weekly cycle. Immich and icloudpd delete everything that matches in one action (Immich in batches of 2,000 on Android and 10,000 on iOS).

## Migration from v1

Migration is automatic on the first v6 sync, after authentication and under the library lock:

1. **Snapshot.** A complete remote fetch is not required, because migration deletes nothing. A failed fetch postpones the migration with an error, so health checks report it.
2. **Inventory and verification.** Every v1 file referenced by iCloud is hashed against its name before anything changes. Progress is persisted, so it resumes after restarts.
    - It takes about 3.6 h per 1.15 TB on HDD (20–40 min on SSD).
    - Mismatches are quarantined and downloaded again later.
3. **Preflight.** Checks: one mount, hard links work with real v1 files, enough free space. If any check fails, the library stays a usable v1 library and guidance is shown.
4. **Switch.** Write the new state, then set `libraryVersion: 2`. From here on, v5 refuses the library.
5. **Records, content and views.**
    - Every verified v1 file gets a second name in the blob store: same inode, nothing copied, nothing downloaded.
    - Album folders are renamed to their display names, and the readable entries replace the old symlinks.
    - `_All-Photos`/`_Shared-Photos` names are removed once everything is linked.
    - v1-archived albums become frozen albums with their files untouched. `_Archive` is left alone.
6. **Path map.** `migration/path-map.jsonl` maps every old visible path to its new one, so that viewer databases (e.g. Immich) can be re-mapped.

!!! warning "Path-based viewers"
    Viewers that identify photos by path (Immich, Photoview) will see every photo as new after the migration. Pin the `:5` Docker tag to postpone the upgrade.

## Delivery

1. **Probes.** Live probes of the remaining unknowns (checksums of large/ADP/shared files, Recently Deleted index, zone moves, render types, shared-zone deletes, completeness rates). Findings are documented in [iCloud API](api.md).
2. **v5.1.0, non-breaking:**
    - a major-version Docker tag (`:5`) and a `5.x` maintenance branch;
    - a guard that refuses libraries written by a newer layout;
    - albums whose contents failed to load are kept;
    - durable resource and lock file writes;
    - a warning when the data directory lacks hard-link support.
3. **Dark launch on `dev`.** The new modules (`app/src/lib/library/`, `sync-engine/plan.ts`, `sync-engine/apply.ts`) land as unwired, unit-tested PRs:
    1. remote snapshot;
    2. durable writer and shards;
    3. blob store and cleaning;
    4. planner;
    5. views;
    6. applier and crash-matrix tests;
    7. migration;
    8. archive;
    9. telemetry.
4. **Switch to 6.0.0.** One breaking PR enables the new library, removes `app/src/lib/photos-library/`, and updates the documentation and dashboards.
5. **6.x.** 6.1 XMP sidecars, 6.2 shared albums, 6.3 [age-based archiving](#age-based-archiving-63), 6.4 fetch optimizations (change feed, `records/lookup`).
6. **Distribution, after 6.0.** Comparable tools reach most of their users through NAS app catalogs: docker-icloudpd, which is listed in Unraid's Community Apps, has about 4M Docker pulls, five times as many as icloudpd's own image (October 2026). These entries wait for 6.0, so that new users start on the readable layout instead of migrating shortly after:
    - an Unraid Community Applications template;
    - a TrueNAS apps catalog entry;
    - a Synology Container Manager guide in the user docs;
    - each pinned to the major tag (`:6`) and the `/opt/icloud-photos-library` volume, and listed in the docs and the README.

## Testing

- **Planner:** table-driven unit tests for every lifecycle transition, plus regression cases:
    - retries never count as two syncs;
    - a zone move costs 0 downloads;
    - favouriting an edited asset costs 0 downloads.
- **Store, cleaning and views:** tests on the existing mock file system helper, extended with hard links.
- **Crash matrix:** inject a failure at every mutating operation. The resulting tree must equal a clean run, and a second clean run must be a no-op.
- **API tests:** verify the salted SHA-1 of all test-library downloads.
- **Docker end-to-end tests:**
    - fresh sync;
    - incremental repair;
    - migration of a library written by the v5 image: 0 downloads, inodes reused, readable views;
    - a sync under the permission model.
- **Performance:** a synthetic 300k-record state, checking event-loop blocking, reconcile syscalls and heap.

## Alternatives considered

| Layout | Why not |
|---|---|
| Per-asset folders, `.library-data/<lifecycle>/<assetUUID>/{resOriginalRes, …, metadata.json}` (the [#354](https://github.com/steilerDev/icloud-photos-sync/issues/354) sketch) | An exact disk check needs about 1.2M syscalls on 300k assets (30–80 min on a cold HDD), so it can only check a rolling slice per sync. Duplicates and zone moves need extra hard-link logic. About 930k inodes. |
| Blob store + one JSON file per asset | Every sync reads about 300k small files: 10–60 min on a cold HDD NAS. |
| One JSON index file | Full rewrites at 300k assets and a single point of corruption |
| SQLite (`node:sqlite`) | Excluded (no database). WAL is unsafe on network file systems, and its file access bypasses Node's permission model. |
