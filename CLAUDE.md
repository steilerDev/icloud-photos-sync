# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository layout

- `app/` — the TypeScript application (ESM, Node >= 26, published to npm as `icloud-photos-sync`). All npm commands run from here.
- `docker/` — Dockerfile; the image installs the `npm-pack.tgz` built from `app/`.
- `docs/` — mkdocs site (https://icps.steiler.dev).
  - `docs/api/openapi.yaml` — contract of the app's own web API.
  - `docs/postman/` — Postman collection of the iCloud API. It is **outdated**; see "iCloud API surface" below.
  - `docs/src/dev/` — developer docs, including `api.md` (iCloud auth flow) and `local-file-structure.md` (on-disk library layout).
- `secrets/` — env files for real Apple accounts (see next section).
- `.github/` — workflows plus composite actions (see "CI/CD").

## Accounts, secrets and trust tokens

The maintainer keeps three real Apple accounts. Each has a `secrets/<name>.env` file, with a `*.sample` listing its variable names.

| File | Account | Variables | Use |
|---|---|---|---|
| `secrets/prod.env` | Maintainer's personal account: large library, many albums and folders, shared albums, a shared photo library | `APPLE_ID_USER`, `APPLE_ID_PWD`, `TRUST_TOKEN`, `DATA_DIR`, … (the app's own option env vars) | Investigation and debugging of real-world API behaviour. Read-only use: never run `archive --remote-delete` or anything else that modifies the remote library against it. |
| `secrets/test.env` | Dedicated test account (the library is described in `docs/src/dev/test-environment.md`) | `TEST_APPLE_ID_USER`, `TEST_APPLE_ID_PWD`, `TEST_TRUST_TOKEN` | `npm run test:api`, `npm run test:docker` and `.vscode/launch.json`. Expected API responses live in `app/test/api/_data/`. |
| `secrets/adp.env` | Maintainer's account with Advanced Data Protection (ADP) enabled | `APPLE_ID_USER`, `APPLE_ID_PWD`, `TRUST_TOKEN`, `DATA_DIR`, … (same shape as `prod.env`) | Reproducing and debugging ADP-specific behaviour: escrow, `pcsRequired` and the `requestPCS` approval loop. **Only with the user present:** every MFA code and every PCS request has to be approved by the user on their device, so never start an ADP run while they are away. Treat it as read-only like `prod`. |

Two further files hold Backtrace API tokens (see "Error reports (Backtrace)"): `secrets/backtrace.env` for the production project and `secrets/backtrace-dev.env` for the development project, each with `BACKTRACE_API_TOKEN` and `BACKTRACE_PROJECT`.

Load an env file with `set -a; . ../secrets/test.env; set +a` before running a command. Never print, log or commit the values, and never paste them into files or tool output.

**How trust tokens behave** (from the maintainer's experience):
- Tokens expire roughly every 30 days. The app has no client-side expiry check, so an auth failure on a token older than about a month is most likely plain expiry.
- Many trust tokens can co-exist for the same account. Acquiring a new one does not invalidate the others, so renew a token only where it actually expired.
- Tokens are **bound to the IP they were acquired from**. A token from one network (e.g. this machine) is rejected from another (e.g. the CI runner), and the failure looks just like an expired token. Never copy a token between machines; each location acquires its own.

**When a trust token expires, renew it together with the user.** Expiry shows up as the signin returning 409 / "MFA code required" where a trusted session was expected; API tests then fail during authentication. Renewing needs an MFA code that only the user can provide:

1. Tell the user the token expired, and which account it belongs to.
2. Build (`npm run build:dev`). Run the token command with the account's credentials, a scratch data dir and a non-privileged port, e.g. `APPLE_ID_USER=… APPLE_ID_PWD=… node build/out/src/main.js token -d "$(mktemp -d)" -P 8080`. For the test account, map `TEST_APPLE_ID_USER`/`TEST_APPLE_ID_PWD` to `APPLE_ID_USER`/`APPLE_ID_PWD`.
3. Wait until it prints "MFA code required".
   - **Test account:** its trusted devices are unreachable, so the automatic device push never arrives (a long-standing quirk). Always request an SMS to phone id `2`: `curl -X POST "localhost:8080/api/resend_mfa?method=sms&phoneNumberId=2"`. `acquire-trust-token.sh` does the same.
   - **Prod account:** the automatic trusted-device push works, so no extra request is needed.
   - **ADP account:** the automatic trusted-device push works as well. The user must be present to read the code off their device.
   - Then ask the user for the code and submit it with `curl -X POST "localhost:8080/api/mfa?code=<code>"`. The default MFA timeout is 10 minutes, so ask promptly.
4. The new token is printed ("Validated token") and stored in `<data-dir>/.icloud-photos-sync` (`.trustToken`). Update the env file only after confirming with the user: `TEST_TRUST_TOKEN` in `secrets/test.env`, `TRUST_TOKEN` in `secrets/prod.env` and `secrets/adp.env` (it overrides the token stored in the data dir). `DATA_DIR` in `adp.env` points to `/opt/adp-data-dir/`, which isn't writable in the sandbox; there the ADP data dir is `~/icps-data/adp`, so pass `-d ~/icps-data/adp` to reuse it.
   - The `token` command stops at `TRUSTED`, so it never reaches the ADP-only PCS step. Exercising `requestPCS` needs a `sync` (or `daemon`) run, during which the app polls every 10s until the user approves the request on a device.
5. CI has its own token. The self-hosted `residential` runner keeps `TEST_*` in `/opt/actions-runner/.env`, not in GitHub secrets. Because tokens are IP-bound, it must be renewed **on the runner host** by the user, with `.github/acquire-trust-token.sh`, which runs the same flow using the published image. This is only needed when the CI API/e2e jobs fail authentication. A locally renewed token neither fixes nor breaks the runner's token.

## Commands (run in `app/`)

```sh
npm ci                     # .npmrc sets ignore-scripts and save-exact
npm run build:schema       # REQUIRED before tests/tsc: generates gitignored src/lib/resources/schemas/*.json
npm run build:dev          # schema + tsc -> build/out/
npm run build              # eslint --fix + knip, then build:dev (what CI runs, followed by `npm run dist`)
npm run test:unit          # jest unit tests (coverage on by default)
npm test -- --coverage false test/unit/sync-engine.test.ts -t "<test name>"   # single file / single test
npm run execute -- sync    # run the compiled CLI (subcommands: daemon (default), sync, token, archive <path>)
npm run doc:cli -- ../docs/src   # generate docs/src/user-guides/cli.md from the commander options (build artifact, not committed)
```

- Tests must go through `npm test`, which sets `TZ=UTC` and `NODE_OPTIONS=--experimental-vm-modules` (ts-jest ESM preset). Running `npx jest` directly fails.
- **Running the API tests and the full Docker tests:** always use the stored test account credentials from `secrets/test.env`. Never use the prod account for them, and never ask the user to type credentials. Load the file into the environment of the same command:
  ```sh
  set -a; . ../secrets/test.env; set +a; npm run test:api
  set -a; . ../secrets/test.env; set +a; IMAGE_NAME=<image> npm run test:docker
  ```
  If authentication fails, the stored `TEST_TRUST_TOKEN` has most likely expired. Follow the renewal steps above, together with the user.
- `test:api` hits the real iCloud backend.
- `test:docker` runs testcontainers against `$IMAGE_NAME` (default `steilerdev/icloud-photos-sync:nightly`). `test:docker:unit` is the subset that needs no credentials.
- **Testing local code in the Docker tests:** build an image first. `npm run build && npm run dist && npm pack`, then move the tarball to `../docker/npm-pack.tgz` (gitignored) and run `docker build -t icps:local ../docker`. Then use `IMAGE_NAME=icps:local`.

## Architecture

**Entry and app selection.** `src/main.ts` calls `appFactory()` (`src/app/factory.ts`), which parses the commander options. Every option has an env-var twin, e.g. `APPLE_ID_USER`, `DATA_DIR`, `REFRESH_TOKEN`. The factory calls `Resources.setup(options)` and returns one of the app classes from `src/app/icloud-app.ts`:
- `DaemonApp` — a cron schedule that runs `SyncApp`.
- `TokenApp`, `SyncApp`, `ArchiveApp` — an inheritance chain: `ArchiveApp` extends `SyncApp`, which extends the abstract `iCloudApp`. Each `run()` calls `super.run()` first, and only the concrete class that was instantiated calls `clean()` (checked via `this.constructor.name`).

**Resources singleton (`src/lib/resources/main.ts`).** A namespace that holds the process-wide singletons. Code reaches them through static accessors instead of injecting them; constructors take only domain objects, e.g. `new SyncEngine(icloud, photosLibrary)`:
- `Resources.event()` — EventManager: the event bus.
- `Resources.state()` — StateManager: app state READY/RUNNING/BLOCKED and the library lock.
- `Resources.manager()` — ResourceManager: CLI options plus the persisted `.icloud-photos-sync` file.
- `Resources.network()` — NetworkManager: session state and rate limiting on top of `HttpClient` (`http-client.ts`, Node's built-in `fetch`), which owns the header/cookie jar and the HAR capture.
- `Resources.validator()` — Validator: ajv validation against the generated schemas.

**Event-driven side effects.** Core classes emit typed events (`events-types.ts`) via `Resources.emit(...)` and never print directly. `main.ts` instantiates independent listeners that subscribe with `Resources.events(this).on(...)`:
- `LogInterface` and `CLIInterface` (progress bars)
- `MetricsExporter` (Influx line protocol)
- `HealthCheckPingExecutor`
- `WebServer`

An app's `clean()` must remove listeners with `Resources.events(obj).removeListeners()`. The auth flow is itself an event chain; see below.

**Sync pipeline.** `SyncEngine.sync()` repeats these steps until they succeed, up to `--max-retries`. Before each retry it settles the download queue and calls `setupAccount()` again.
1. `fetchAndLoadState` — fetches the remote state (`iCloudPhotos`) and the local state (`PhotosLibrary`) in parallel.
2. `diffState` — produces processing queues.
3. `writeState` — deletes before it adds (assets, then albums).

`ArchiveEngine` then optionally archives a folder.

**No database: the file system is the state.**
- Assets live in `_All-Photos`/`_Shared-Photos`, named by iCloud checksum, with mtime set to the remote modified date.
- Albums are hidden `.{UUID}` folders full of symlinks to assets, plus a display-name symlink.
- Folders that contain non-"safe" files are treated as archived and left untouched.

Read `docs/src/dev/local-file-structure.md` before changing `photos-library/` or `sync-engine/`.

**Persistence.** `.icloud-photos-sync` in the data dir stores only `libraryVersion`, `trustToken`, `notificationVapidCredentials` and `notificationSubscriptions` (schema-validated). Session secrets, cookies and zones stay in memory. The trust token is written only after a fresh MFA, by `/2sv/trust`. `--refresh-token` clears it at startup, which forces MFA. There is no client-side expiry check.

**Validated external data.** Response and resource types live in `resource-types.ts` / `network-types.ts`. `app/build/schema.ts` generates JSON schemas from them, which `validator.ts` imports. To validate a new type, register it in `schema.ts` and change the TS type, never the generated JSON. TSDoc schema tags (`@minimum`, `@pattern`, …) shape the schema. **Every request validates its response:** `get/post/put` require a `ResponseValidator` and resolve to its result, e.g. `Resources.network().post(url, data, Resources.validator().response.setup)`. `ResponseValidator` is a branded type that only `validator.ts` can create (`Validator.response`), so an ad-hoc function does not compile and there is no opt-out. A new endpoint needs a response type, a `schema.ts` entry, a `validate…Response` method and a `Validator.response` entry. Schemas should only require what the code relies on. For CloudKit queries/operations only the envelope (`data.records` array) is schema-validated; `query-parser.ts` parses the records defensively. Tests may use `RAW_RESPONSE` from `test/_helpers/http-mock.helper.ts`.

**Web UI and API** (`src/app/web-ui/`).
- A dependency-free `node:http` server. Routes are the `_sitemap` map in `web-server.ts`: UI pages (`/`, `/state`, `/submit-mfa`, `/request-mfa`), PWA assets, and the JSON API under `/api/*`.
- The `/api/*` endpoints are `state`, `log`, `vapid-public-key`, `reauthenticate`, `mfa`, `resend_mfa`, `sync` and `subscribe`. Parameters are passed as query strings.
- **`docs/api/openapi.yaml` is the contract for `/api/*`.** Any change to an API route, parameter, status code or response message must update it in the same change.
- HTML, CSS and client JS are TypeScript template strings. Views extend `View` and override `get content()`. There are no static asset files.

## iCloud API surface (as implemented)

The code is the source of truth. `docs/src/dev/api.md` is mostly current. `docs/postman/` predates SRP, escrow, PCS and the iOS 26.4 MFA changes, so don't rely on it.
- **Endpoints and headers:** URLs live in `ENDPOINTS` in `network-types.ts`.
- **Header/cookie jar:** `HeaderJar` in `network-manager.ts` attaches headers and cookies by matching each request URL against a domain.
- **Request flow:** `icloud.ts` drives the requests.
- **Per-method MFA payloads:** in `mfa/mfa-method.ts`.

**Hosts.**
- Auth: `https://idmsa.apple.com/appleauth/auth`, the same for both regions.
- Setup: `https://setup.icloud.com` (`.com.cn` for `--region china`).
- Photos: `<webservices.ckdatabasews.url>/database/1/com.apple.photos.cloud/production/{private|shared}`. This becomes the client's `baseURL`, so photos calls use relative paths.
- Downloads: the per-record `downloadURL`, fetched verbatim and streamed to disk by `HttpClient.download` (no jar headers, no cookies, no HAR; the partial file is removed on failure).

**Headers.**
- **idmsa requests:** a static set: `X-Apple-Widget-Key`/`X-Apple-OAuth-Client-Id` (`CLIENT_ID`), the `X-Apple-OAuth-*` headers, `X-Apple-I-FD-Client-Info`, `X-Apple-Domain-Id: 3`, and a per-flow UUID in `X-Apple-Frame-Id`/`X-Apple-OAuth-State`. All requests also carry a Chrome User-Agent.
- **Captured and echoed:**
  - `scnt` and `X-Apple-Auth-Attributes`, from every idmsa response.
  - `X-Apple-ID-Session-Id`, from signin.
  - All `Set-Cookie` values (including `aasp` and `X-APPLE-WEBAUTH-*`), handled by tough-cookie.
- **`X-Apple-Session-Token`:** stored as `sessionSecret` and sent later as `dsWebAuthToken`. Signin, MFA 409, escrow and trust responses update it.

**Auth flow.** Events chain the steps: `authenticate → MFA_REQUIRED → submitMFA → AUTHENTICATED → getTokens → TRUSTED → setupAccount → [PCS_REQUIRED] → ACCOUNT_READY → photos.setup → READY`.
1. **SRP signin** (`icloud.crypto.ts`, dependency-free, mirrors Apple's web client):
   - Init: `POST /signin/init` with `{a, accountName, protocols:[s2k,s2k_fo]}`.
   - Complete: `POST /signin/complete?isRememberMeEnabled=true` with `{accountName, trustTokens:[token], m1, m2, c}`.
   - Password derivation: `SHA256(pwd)` (hex string for `s2k_fo`), then PBKDF2-SHA256 with the server salt and iteration count. The 2048-bit RFC 5054 group is used.
   - `--legacy-login` uses `POST /signin` with the plaintext password instead.
2. **Signin result:**
   - 200: the trust token is valid, emit `TRUSTED`.
   - 409 with `X-Apple-EDP`/`X-Apple-PDP`: the token is accepted but escrow is required (step 5), then `TRUSTED`.
   - 409 without those headers: MFA is needed.
   - 401: wrong password. 403: unknown user. 412: precondition failed.
3. **MFA:**
   - Trusted phones come from `GET /appleauth/auth` (JSON, or `boot_args` in the HTML).
   - Request a code:
     - Device: `PUT /verify/trusteddevice/securitycode`, which is now requested explicitly; 200 or 202 means success.
     - SMS/voice: `PUT /verify/phone` with `{phoneNumber:{id}, mode}`.
   - Submit the code:
     - Device: `POST /verify/trusteddevice/securitycode` (204).
     - Phone: `POST /verify/phone/securitycode` with `nonFTEU` (200).
   - Since iOS 26.4 a **409 counts as success** if `securityCode.valid` is true or a new session token arrives. 400 or service error `-21669` means the code was rejected.
4. **Trust:** `GET /2sv/trust` returns 204 with `X-Apple-TwoSV-Trust-Token`, which is persisted. This only happens after MFA.
5. **Escrow** (iOS 26.4+): a second SRP proof with an empty account name.
   - Init: `POST /escrow/init`.
   - Complete: `POST /escrow/complete` with `{m1, m2, c, k}`.
6. **Account:** `POST setup…/setup/ws/1/accountLogin` with `{dsWebAuthToken, accountCountryCode, extended_login:true, trustToken}`.
   - The response provides the ckdatabasews URL.
   - **421** means the session expired; the app re-authenticates from scratch.
   - If `pcsRequired` is set and the PCS cookies are missing (ADP accounts), the app polls `POST /setup/ws/1/requestPCS` every 10s until the user approves on a device.
7. **Logout:** `POST /setup/ws/1/logout`, called in `clean()`.

**CloudKit Photos.**
- **Zones:** `POST /{private,shared}/changes/database`.
  - The primary zone is `PrimarySync`.
  - The shared library is a `SharedSync-*` zone, in private when the user owns it, otherwise in shared.
- **Queries:** `POST /{area}/records/query?remapEnums=True`. Record types used:
  - `CheckIndexingState`
  - `HyperionIndexCountLookup` (counts)
  - `CPLAssetAndMasterByAssetDateWithoutHiddenOrDeleted` (all photos)
  - `CPLContainerRelationLiveByPosition` (album contents)
  - `CPLAlbumByPositionLive` (albums and folders, walked breadth-first, primary zone only)
- **`desiredKeys`:** `QUERY_KEYS` in `query-builder.ts`.
- **Pagination:** there is no `continuationMarker`. The code takes the count first, then fires parallel queries with `resultsLimit: 198` and `startRank` offsets. The step is 99 for all photos (asset+master per item) and 66 for albums (+relation). Results are de-duplicated afterwards.
- **Assets:** the original is `CPLMaster.resOriginalRes`. If `adjustmentType` is set, the edited version is `resJPEGFullRes`/`resVidFullRes`. Live-photo video is not fetched.
- **Remote delete** (`archive --remote-delete`, non-favorites only): `POST /private/records/modify` sets `isDeleted: 1` on a `CPLAsset`.
- **Rate limiting:** all metadata calls go through a p-queue set by `--metadata-rate`. Downloads use a separate concurrency queue (`--download-threads`, `--download-timeout`). There are no HTTP-level retries; retries happen at sync level.

## Error reports (Backtrace)

Users who enable crash reporting send errors to Backtrace (`ErrorHandler` in `src/app/event/error-handler.ts`). Use this data to find what fails in the field, pin it to code, and fix it. Reach it through the HTTP API with the project API tokens. Don't use morgue or the MCP server: morgue needs an SSO session token that resets with server maintenance.

**Projects.** The universe is `steilerdev`, the host is `https://steilerdev.sp.backtrace.io`.

| Env file | Project | Receives |
|---|---|---|
| `secrets/backtrace.env` | `icloud-photos-sync` | Every published build (releases and `-nightly`/`-beta`) |
| `secrets/backtrace-dev.env` | `dev-icloud-photos-sync` | Local and CI builds (`0.0.0-development`), including test runs |

The SDK chooses the project by `application.version` via the submission tokens hard-coded in `error-handler.ts`. Those are write-only and can't read anything. The production project keeps about 90 days of reports.

**Calling the API.** Every call takes `universe` and `project` as query parameters and the token in the `X-Coroner-Token` header (`?token=` also works). Load the env file in the same command, as with the other secrets, and never echo the token:
```sh
(set -a; . ../secrets/backtrace.env; set +a
 curl -s -X POST "https://steilerdev.sp.backtrace.io/api/query?universe=steilerdev&project=$BACKTRACE_PROJECT" \
   -H "X-Coroner-Token: $BACKTRACE_API_TOKEN" -H 'Content-Type: application/json' -d '<query JSON>')
```
- **Schema:** `POST /api/query?…&action=describe` with body `{}` lists all attributes.
- **Query** (`POST /api/query`):
  - `filter` is `[{"<attr>": [["<op>", "<value>"]]}]`. Ops: `equal`, `not-equal`, `regular-expression`, `contains`, `not-contains`, `is-set`, `at-least`, `at-most`, `greater-than`, `less-than`. Values are strings, timestamps are Unix seconds.
  - A query **must** have a filter that rejects missing data, e.g. `"timestamp": [["at-least", "<epoch>"]]`, otherwise it errors.
  - Either aggregate with `group` (one attribute) + `fold` (`{"<attr>": [["head"], ["unique"], ["range"], ["distribution", 5]]}`), or list rows with `select` (an attribute list). The two are mutually exclusive.
  - `order` is `[{"name": ";count" | "<attr>", "ordering": "descending"}]`; `limit` and `offset` paginate.
- **Responses:** errors come back as `{"error": {"message": …}}` (often with HTTP 200). The data is in `response`:
  - `group`: `response.values` is `[[groupKey, [one result per fold, in column order], count], …]`, e.g. `head` → `[v]`, `range` → `[min, max]`, `unique` → `[n]`. A group key `*` means the attribute is unset.
  - `select`: `response.values` is one entry per column, **run-length encoded**: `["*", [value, runLength], …]`. Expand the runs and zip the columns into rows. Always select `_tx` to get the object id.
- **One report in full:** `GET /api/get?…&object=<_tx in hex>&resource=json.gz` returns the gzipped report:
  - `threads.main.stack`: source-mapped frames with `library` (a `src/…` path), `line` and `column`.
  - `annotations.error`: the full `iCPSError` cause chain, with messages and context.
  - `annotations["Environment Variables"]` and `["Exec Arguments"]`: the user's configuration; credentials show up masked as `<APPLE ID USERNAME>` etc.
  - `attributes`: the runtime, OS and memory.
- **Attachments are not reachable with an API token.** The log (`icps.log.br`) and HAR (`icps.har.br`) are uploaded as attachments, but `/api/list?view=attachments` rejects API tokens and `/api/get?attachment_name=…` fails. If the log or HAR is needed, ask the user to download it from the web console.

**Attributes that matter.**
- `icps.rootErrorCode` and `icps.errorCodeStack`: the iCPSError root code and the full code chain, e.g. `APP_DAEMON->APP_SYNC->AUTH_FAILED->AUTH_UNEXPECTED_RESPONSE->EXT#ERR_BAD_RESPONSE`. Codes map to `src/app/error/codes/`; an `EXT#` prefix marks a wrapped non-iCPS error (`HttpError`, `ENOSPC`, …). `HttpError` keeps axios' former codes (`ERR_BAD_REQUEST` for 4xx, `ERR_BAD_RESPONSE` otherwise, `ECONNABORTED` for timeouts) and unwraps network codes such as `ECONNREFUSED` from fetch's error cause.
- `icps.description`: the chained messages, including the HTTP status. `icps.uuid`: shown to the user as `(error code: <uuid>)` in the error message (`iCPSError.btUUID`), so use it to find a report a user quotes in a GitHub issue.
- `icps.filetype.extension` / `icps.filetype.descriptor`: set only on "Reporting unknown file type" reports (fingerprint `000…0`). These are requests for file-type support (`src/lib/photos-library/model/file-type.ts`), not crashes.
- `application.version`, `guid` (one id per install), `application.session`, `timestamp`, `callstack`, `error.message`, `classifiers` (the error class, e.g. `iCloudAuthError`), `lang.version` (Node), `uname.sysname`, `cpu.arch`.
- `fingerprint` groups reports into issues. Issue fields are reachable on report rows as `fingerprint;issues;<field>` (`state`, `tags`, `ticket`, `assignee`, `id`).

**Triage pitfalls.**
- **Rank by `unique(guid)`, not by report count.** Daemon mode retries on its cron schedule, so a single broken install sends thousands of identical reports. Most issues come from one or two installs.
- **The fingerprint is a hash of the call stack**, not of the cause. One fingerprint can mix several root causes (e.g. a 503 and a 403 during `iCloud.authenticate`), and one root cause can span several fingerprints. Group by `icps.errorCodeStack` (or `icps.rootErrorCode`) to find causes, and use the fingerprint only to update issue state.
- Many reports are environmental and need no code change: Apple 5xx/`ERR_BAD_RESPONSE`, `AUTH_SETUP_TIMEOUT`, `ENOSPC`, `ERR_SERVER_ALREADY_LISTEN` (port in use). Look for a pattern across installs or versions before you treat one as a bug. Codes on `reportDenyList` in `error-handler.ts` are never reported.
- Compare against the latest release before you call something a regression. Old versions (e.g. 1.x) keep reporting, and their bugs are usually fixed already.

**Updating issues.** Issues live in the `issues` table. Change them with `POST /api/query` and `{"table": "issues", "filter": [{"fingerprint": [["equal", "<sha256>"]]}], "set": {…}}`; `set` and `select` are mutually exclusive. To read them, `select` from the same table, e.g. `["fingerprint", "state", "tags", "ticket", "last_modified"]`.
- `state`: the console uses `open`, `in-progress`, `resolved` and `muted`. The server accepts **any** string, so use exactly these.
- `tags` (space-separated) and `ticket` (a URL) **replace** the current value; `null` clears it. Read the current tags first and write back the merged list.
- The token has write access, and changes show up in the console immediately. **Ask the user before changing issues in the production project.** In the dev project, change them only as part of the task at hand.

**Workflow: from a Backtrace issue to a fix.**
1. List recent causes in the production project: filter on `timestamp`, `group` by `icps.errorCodeStack`, and fold `guid` (`unique`), `application.version` (`range`), `timestamp` (`range`), `fingerprint` (`unique`) and `fingerprint;issues;state` (`head`). Skip `resolved` and `muted` issues, and anything seen only on outdated versions.
2. For a candidate, `select` a few recent `_tx` values and download each report (`json.gz`). Read the source-mapped stack frames and `annotations.error`, then open those lines in `src/`.
3. Check GitHub for an existing issue (`gh issue list --search "<error code>"`). Otherwise propose one to the user, with the error code chain, the affected versions, the number of installs and a sample `icps.uuid`. Never paste raw report data into a public issue: reports contain user configuration, hostnames and library paths.
4. Fix it on a branch from `dev`, following the normal workflow, and reference the GitHub issue.
5. Once the fix is merged, set the Backtrace issue's `ticket` to the GitHub issue (or PR) URL and its `state` to `resolved`, after confirming with the user. After the release, check that `application.version` past the fix no longer reports this `icps.errorCodeStack`.

## Coding style (app)

Lint is `eslint recommended` + `typescript-eslint recommended`, plus:
- `@stylistic/quotes: backtick` — **every string literal is a template literal**, even without interpolation. Normal quotes appear only where template literals aren't allowed: imports, object keys, `with {type: 'json'}`.
- 4-space indent, with `case` at the same level as `switch`.
- `quote-props: as-needed`, and braces without inner spaces (`{foo}`).
- `_`-prefixed names are exempt from unused-var checks.
- `any` is allowed.

Semicolons and import order are not enforced, so match the surrounding file. Add new domain words to `.vscode/icloud-photos-sync.cspell`.

**Naming.**
- Classes are PascalCase, but project-branded types use a lowercase prefix: `iCloud`, `iCloudPhotos`, `iCPSError`, `iCPSApp`, `iCPSEvent<Area>`.
- Files are kebab-case (`sync-engine.ts`, `icloud.crypto.ts`). Tests are `<area>.<module>.test.ts`.
- Enum members are `UPPER_SNAKE` with backtick string values. Event values look like `` `icloud-auth_started` ``.
- Internal members use a **public `_` prefix** (`_http`, `_resources`, `_sitemap`) so tests can reach them. `private` is rare.

**Modules.**
- `src` relative imports end in `.js`; **test imports omit the extension** (Jest maps it).
- Named exports only, no `export default` in src.
- Node built-ins are imported without the `node:` prefix (`'fs'`, `'path'`, `'events'`).
- The only TS namespace is `Resources`; shared types live in `Resources.Types`.
- Object shapes are `type X = {…}`, not `interface`. Labeled tuples and tuple returns are common (`Promise<[Asset[], Album[]]>`).
- Static helper bundles are exported object literals (`SyncEngineHelper`).

**Docs.** Every class, member, enum member and type field in `lib/` gets TSDoc:
- `@param name - …`, `@returns …`, `@throws An iCPSError, if …`
- The custom `@emits iCPSEventX.MEMBER - when … - payload …`, listed for every emitted event.

**Idioms.**
- Log with `Resources.logger(this).debug|info|warn|error(…)`, never `console.*`.
- Recoverable per-item problems are emitted as `iCPSEventRuntimeWarning.*`, not thrown.
- Errors:
  - Throw `new iCPSError(AREA_ERR.CODE)` and chain `.addMessage()`, `.addCause(err)`, `.addContext(key, value)`. Catch blocks wrap and rethrow.
  - Error codes are defined in `src/app/error/codes/<area>.ts` with `buildErrorStruct(name, prefix, code, message)` and re-exported as `<AREA>_ERR` from `error-codes.ts`. A new error name must also be added to the `ErrorName` union.
  - For HTTP errors use the `isHttpError` guard (`err.response?.status`, `err.code`).
- All HTTP goes through `Resources.network().get/post/put` (or an own `HttpClient`, like the health check), never raw `fetch`. Proxies are only applied with `--use-system-proxy`.
- Read JSON with `jsonc` rather than `JSON.*`. For JSON imports, use `with {type: 'json'}`.
- **Prefer Node built-ins over small dependencies.** This is an active trend: `events.once`, `util.styleText`, `RegExp.escape`, `Error.isError`, `crypto` for SRP, native TS type stripping for `build/*.ts`. Don't add lodash-style utilities.
- `/* c8 ignore start/stop */` marks code that can't be tested.

## Testing conventions

- Import Jest globals explicitly from `@jest/globals`.
- Titles are backtick strings in nested `describe`s. `test.each`/`describe.each` take object rows with a `desc` field, used as `$desc` in the title.
- **Resources:** `const instances = prepareResources()!` in `beforeEach` (`test/_helpers/_general.ts`). It returns typed mocks:
  - `instances.manager` — set config directly, e.g. `_resources.maxRetries = 4`; resource-file I/O is stubbed.
  - `instances.network.mock` — an `HttpMock` (`test/_helpers/http-mock.helper.ts`, mirrors the axios-mock-adapter API: `onPost(url, body, {headers}).reply(status, data, headers)`, `history`) with `onNoMatch: throwException`. Header matchers compare the full header set.
  - `instances.event.spyOnEvent(iCPSEventX.Y)` — removes existing listeners by default.
- **Mocking:** reassign methods with typed jest.fn, e.g. `obj.method = jest.fn<typeof obj.method>().mockResolvedValue(…)`.
- **File system:** `test/_helpers/mock-fs.helper.ts` is a drop-in for the mock-fs API (`mockfs({...})`, `mockfs.file/directory/symlink`, `mockfs.restore()`) that writes to a **real temp dir**.
  - Only paths under `os.tmpdir()` are allowed.
  - Each test file gets its own `Config.defaultConfig.dataDir`, removed in a global `afterAll`.
  - Round `mtimeMs` in assertions, since real file systems report sub-ms times.
- **Web:** `node-mocks-http` with `sendMockedRequest`; UI checks use jsdom and `@testing-library/dom`.
- **Fixtures:** in `test/_helpers/*.helper.ts` and `_config.ts`. API expectations live in `test/api/_data/*.json`.
- **Coverage:** always collected (v8). There is no threshold, but suites are thorough; new code is expected to come with tests.

## CI/CD

**Triggers** (`.github/workflows/`):
- `event_pr.yml` (PR to `dev`/`beta`/`main`): builds all artifacts without releasing, then runs tests chosen by base branch:
  - `dev`: unit-ubuntu, unit-docker
  - `beta`: unit-ubuntu, e2e, api
  - `main`: unit-ubuntu, unit-macos, e2e, api
- `event_push.yml` (push to `dev`/`beta`/`main`): runs unit-ubuntu, then `artifacts_build-release.yml` with `release: true`. Docs are built and released only on `main`. `concurrency: release` queues releases.
- `monitor_api.yml`: API tests. The cron is **currently commented out** because the runner is unavailable, so it runs on `workflow_dispatch` only.
- `artifacts_build-release.yml` and `artifacts_test.yml` are reusable (`workflow_call`) and call composite actions in `.github/actions/{build,test,release,helper}/`.

**Build** (`artifacts_build-release.yml`):
1. `app-build`: `npm run build && npm run dist`, then `npm pack`, uploaded as `app-artifact-build`.
2. `app-release`.
3. `docker-build`: builds amd64 and arm64 tarballs tagged `latest-ci-build` and uploads them as `docker-artifact`. Docker Scout runs only when the actor is `steilerdev`. The image is built from the release tarball if one exists, else the build tarball.
4. `docker-release`.
5. `docs-build`: `doc:cli` + `mkdocs build`, plus unit coverage pulled from the latest beta PR run, published under `dev/coverage`.
6. `docs-release`: deploys to GitHub Pages.
7. `github-release`.

**Tests** (`artifacts_test.yml`):
- unit runs on `ubuntu-latest`/`macos-latest`. It uploads `coverage-artifact-<OS>` and the CTRF report, which posts a PR comment per suite.
- `unit-docker` (`test:docker:unit`) loads `docker-artifact` from the same run.
- `e2e` (`test:docker`) and `api` (`test:api`, 30 min) run on the **self-hosted `residential` runner**, with `TEST_*` taken from the runner's `.env`. They can't use GitHub-hosted runners: trust tokens are IP-bound, and hosted runners get a different IP on every run, which trips Apple's security. Don't move these jobs to `ubuntu-latest`. They are required for beta/main PRs and stay queued while the runner is offline.

**Release** (semantic-release, dependencies in `.github/actions/helper/prepare-semantic-release/`):
- The config is assembled at runtime by `helper/prepare-semantic-release` from `releaserc.json` files next to `release/{app,docker,github}-setup`, and patched **by array index**. Don't reorder plugins or assets.
- semantic-release runs three times on the same commit (npm, docker, github). The app and docker runs delete their git tag so all three compute the same version; only the GitHub run keeps the tag.
- Channels:
  - `dev`: `nightly` (`X.Y.Z-nightly.N`)
  - `beta`: `beta`
  - `main`: `latest`
- npm uses trusted publishing (OIDC, no token). Backtrace sourcemaps are uploaded with `BT_TOKEN`.
- DockerHub gets `steilerdev/icloud-photos-sync:{version,nightly|beta|latest}`, multi-arch with SBOM and provenance. The README is synced to DockerHub on `main`.
- GitHub releases (with tarball assets) happen only on beta/main.
- After a `main` release, `clean-after-prod-release` opens a `main` → `dev` PR and deletes `*-nightly*` tags. Workflows don't run on PRs opened by `GITHUB_TOKEN`, so an admin merges it with a merge commit, bypassing the required checks (or closes and re-opens it to run them).
- `app/package.json` stays at `0.0.0-development`; nothing commits a version back.
- Release rules:
  - breaking or `majorfeat`: major
  - `feat`: minor
  - `fix|docs|refactor|perf|test|build|ci|chore`: patch
  - `style|no-release`: none
  - On `dev`, a catch-all makes **every push publish a nightly** to npm and DockerHub. (CONTRIBUTING.md's type table differs slightly; the CI rules are what apply.)

**Branch rulesets** (repository settings, not in the repo): all three branches block deletion and force pushes, and require these checks:
- `dev`: `build / app-build`, `build / docker-build`, `build / docs-build`, `test / unit-ubuntu`, `test / unit-docker`. Repository admins may bypass.
- `beta`: the `build / *` checks above, plus `test / unit-ubuntu`, `test / docker` and `test / api`, and a PR with a successful `dev` deployment.
- `main`: as `beta`, plus `test / unit-macos`, and a successful `beta` deployment.
- A skipped check counts as passing, so one ruleset covers every base-branch test matrix in `event_pr.yml`.

**Repo secrets:** `DOCKER_TOKEN` (also needed for PR builds), `BT_TOKEN`, `GITHUB_TOKEN`. Release jobs use GitHub Environments named `dev`/`beta`/`main`.

**Dependabot:** all ecosystems target `dev`. Security updates are enabled.
- Dependabot reads `dependabot.yml` **from the default branch (`main`)**, so a config change on `dev` takes effect only after the next production release.
- GitHub pauses version updates when nobody acts on Dependabot PRs for about 90 days. Merge or close them regularly.
- Commit prefixes: `chore: [ci]`, `[app]`, `[docker]`, `[docs]`, `[dev]`, `[semantic-release]`.
- Ignored majors: `@types/node` (tied to `app/node-version`), `typescript`, and `node` in Docker.
- In the Dockerfile, `node` and `alpine` are grouped because their Alpine versions must match.
- The docs toolchain (`docs/requirements.txt`) is **frozen on purpose** and has no Dependabot entry. MkDocs 1.x is unmaintained and Material for MkDocs is EOL, but the output is static HTML, so the maintainer accepts that. Don't upgrade it or migrate it (e.g. to Zensical) unless a new docs capability requires it (#1118).

**Keep these stable when editing app scripts or CI:**
- npm script names CI calls: `build`, `dist`, `build:dev`, `build:schema`, `test:unit`, `test:api`, `test:docker`, `test:docker:unit`, `doc:cli` (output dir as the last argument).
- The CTRF report path `app/coverage/ctrf-report.json`.
- `docs/mkdocs.yml` `site_dir`/`docs_dir`: these must stay single-quoted on one line, because CI greps them.
- The Node version: it is set in `app/node-version` (drives every `setup-node`), `docker/Dockerfile` (`node:<ver>-alpine<ver>`, matching the runtime `alpine` stage) and `.devcontainer.json`. Update all three together.
- Job names in `artifacts_build-release.yml` and `artifacts_test.yml`: the branch rulesets require them as `build / <job>` and `test / <job>`. Renaming a job blocks every PR until the ruleset is updated as well.
- Actions use major tags. `actionlint.yaml` declares the `residential` label.

## Git workflow

- Branch from `dev` and open PRs against `dev`. `beta` and `main` only receive release PRs (`dev` → `beta` → `main`), and branch protection blocks direct commits.
- `dev` is the base branch, but GitHub's default branch is `main`. Claude Code worktrees branch from `origin/HEAD`, so the maintainer's clone sets `git remote set-head origin dev` together with `remote.origin.followRemoteHEAD=never`. In any other clone, check that new work starts from `dev` before committing: `git merge-base --is-ancestor origin/dev HEAD`. If the branch started from `main`, rebase it onto `origin/dev`.
- **Once a PR is merged, remove its worktree, its local branch and its remote branch.**
  1. Leave the worktree (`ExitWorktree`), then run the cleanup from the main checkout.
  2. Confirm the PR is merged: `gh pr view <number> --json state` must say `MERGED`. Then `git fetch origin`.
  3. Run `git worktree remove .claude/worktrees/<name>` and `git branch -d <branch>`. `-d` may warn that the branch is "not yet merged to HEAD" when the main checkout's local `dev` is behind `origin/dev`; that is harmless.
  4. Delete the remote branch: `git push origin --delete <branch>`.
  5. **Never delete `dev`, `beta` or `main`**, locally or remotely. Release PRs use them as their head branch.
  6. If `git worktree remove` refuses because of uncommitted or untracked changes, stop and ask the user instead of forcing it. Don't delete either branch in that case.
- **Issue labels.** When working on a GitHub issue, keep **exactly one `class(...)` and exactly one `status(...)` label** on it. Use only the existing labels; never create new ones.
  - **Classes:** `class(bug)`, `class(feature)` (new functionality), `class(improvement)` (improves an existing feature), `class(documentation)`, `class(known issue)`, `class(duplicate)`, `class(invalid)`.
  - **Status lifecycle:**
    - `status(open)`: new; nobody has looked at it yet.
    - `status(investigating)`: the root cause is being analysed.
    - `status(backlog)`: analysed, but coding has not started.
    - `status(help needed)`: input from other people is needed.
    - `status(wontfix)`: will not be worked on.
    - `status(in progress)`: actively being worked on, and the work has not completed yet. Set it **when you start coding**, and check the class label at the same time. Don't use it for work that stalled or for an unreviewed community PR; use `backlog` (if analysed) or `open` for those.
    - `status(implemented)`: set it **once the PR is merged into `dev`**.
    - **Beta release:** semantic-release adds `status(previewed)` (configured in `.github/actions/release/github-setup/action.yml`).
    - **Production release from `main`:** semantic-release adds `status(released)`.
  - semantic-release only *adds* its label and never removes the previous status. Whenever you touch an issue that has more than one `status(...)`, keep only the most advanced stage (`released` > `previewed` > `implemented`) and remove the rest.
  - Reference the issue with a closing keyword (`Fixes #<n>`) in the PR description and the commit footer, so semantic-release can find it when it releases. PRs target `dev`, not the default branch, so merging does not close the issue on GitHub.
  - Change labels with the REST API; `gh issue edit` can fail on the retired Projects-classic API. To swap the status while keeping all other labels:
    ```sh
    gh api repos/steilerDev/icloud-photos-sync/issues/<n> --jq '{labels: ([.labels[].name | select(startswith("status(") | not)] + ["status(implemented)"])}' \
      | gh api -X PUT repos/steilerDev/icloud-photos-sync/issues/<n>/labels --input -
    ```
    Swap a class the same way, filtering on `class(` instead.
- Commits follow conventional commits, since semantic-release derives versions and notes from them.
- Summaries are imperative, lower-case, with no trailing period. Use an area tag after the type, e.g. `fix: [app] restore MFA flow for iOS 26.4+`, `chore: [docs] …`, `ci: …`.
