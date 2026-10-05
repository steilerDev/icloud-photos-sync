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
- `tools/release/` — semantic-release dependencies (kept outside `.github/` so Dependabot updates them).
- `.github/` — workflows plus composite actions (see "CI/CD").

## Accounts, secrets and trust tokens

The maintainer keeps two real Apple accounts. Each has a `secrets/<name>.env` file, with a `*.sample` listing its variable names.

| File | Account | Variables | Use |
|---|---|---|---|
| `secrets/prod.env` | Maintainer's personal account: large library, many albums and folders, shared albums, a shared photo library | `APPLE_ID_USER`, `APPLE_ID_PWD`, `DATA_DIR`, … (the app's own option env vars) | Investigation and debugging of real-world API behaviour. Read-only use: never run `archive --remote-delete` or anything else that modifies the remote library against it. |
| `secrets/test.env` | Dedicated test account (the library is described in `docs/src/dev/test-environment.md`) | `TEST_APPLE_ID_USER`, `TEST_APPLE_ID_PWD`, `TEST_TRUST_TOKEN` | `npm run test:api`, `npm run test:docker` and `.vscode/launch.json`. Expected API responses live in `app/test/api/_data/`. |

`adp.env` is optional, for an Advanced Data Protection account. Load an env file with `set -a; . ../secrets/test.env; set +a` before running a command. Never print, log or commit the values, and never paste them into files or tool output.

**When a trust token expires, renew it together with the user.** Expiry shows up as the signin returning 409 / "MFA code required" where a trusted session was expected; API tests then fail during authentication. Renewing needs an MFA code that only the user can provide:

1. Tell the user the token expired, and which account it belongs to.
2. Build (`npm run build:dev`). Run the token command with the account's credentials, a scratch data dir and a non-privileged port, e.g. `APPLE_ID_USER=… APPLE_ID_PWD=… node build/out/src/main.js token -d "$(mktemp -d)" -P 8080`. For the test account, map `TEST_APPLE_ID_USER`/`TEST_APPLE_ID_PWD` to `APPLE_ID_USER`/`APPLE_ID_PWD`.
3. Wait until it prints "MFA code required".
   - **Test account:** its trusted devices are unreachable, so the automatic device push never arrives (a long-standing quirk). Always request an SMS to phone id `2`: `curl -X POST "localhost:8080/api/resend_mfa?method=sms&phoneNumberId=2"`. `acquire-trust-token.sh` does the same.
   - **Prod account:** the automatic trusted-device push works, so no extra request is needed.
   - Then ask the user for the code and submit it with `curl -X POST "localhost:8080/api/mfa?code=<code>"`. The default MFA timeout is 10 minutes, so ask promptly.
4. The new token is printed ("Validated token") and stored in `<data-dir>/.icloud-photos-sync` (`.trustToken`). Update `TEST_TRUST_TOKEN` in `secrets/test.env` only after confirming with the user. For `prod`, the token lives in that account's own data dir.
5. CI does **not** read the token from GitHub secrets. The self-hosted `residential` runner keeps `TEST_*` in `/opt/actions-runner/.env`. Remind the user to run `.github/acquire-trust-token.sh` on that runner host (it does the same flow using the published image).

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
- `test:api` hits the real iCloud backend with the test account.
- `test:docker` runs testcontainers against `$IMAGE_NAME` (default `steilerdev/icloud-photos-sync:nightly`). `test:docker:unit` is the subset that needs no credentials.

## Architecture

**Entry and app selection.** `src/main.ts` calls `appFactory()` (`src/app/factory.ts`), which parses the commander options. Every option has an env-var twin, e.g. `APPLE_ID_USER`, `DATA_DIR`, `REFRESH_TOKEN`. The factory calls `Resources.setup(options)` and returns one of the app classes from `src/app/icloud-app.ts`:
- `DaemonApp` — a cron schedule that runs `SyncApp`.
- `TokenApp`, `SyncApp`, `ArchiveApp` — an inheritance chain: `ArchiveApp` extends `SyncApp`, which extends the abstract `iCloudApp`. Each `run()` calls `super.run()` first, and only the concrete class that was instantiated calls `clean()` (checked via `this.constructor.name`).

**Resources singleton (`src/lib/resources/main.ts`).** A namespace that holds the process-wide singletons. Code reaches them through static accessors instead of injecting them; constructors take only domain objects, e.g. `new SyncEngine(icloud, photosLibrary)`:
- `Resources.event()` — EventManager: the event bus.
- `Resources.state()` — StateManager: app state READY/RUNNING/BLOCKED and the library lock.
- `Resources.manager()` — ResourceManager: CLI options plus the persisted `.icloud-photos-sync` file.
- `Resources.network()` — NetworkManager: axios plus the header/cookie jar, rate limiting and HAR capture.
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

**Validated external data.** Response and resource types live in `resource-types.ts` / `network-types.ts`. `app/build/schema.ts` generates JSON schemas from them, which `validator.ts` imports. To validate a new type, register it in `schema.ts` and change the TS type, never the generated JSON. TSDoc schema tags (`@minimum`, `@pattern`, …) shape the schema. CloudKit query responses are **not** schema-validated; `query-parser.ts` parses them defensively.

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
- Photos: `<webservices.ckdatabasews.url>/database/1/com.apple.photos.cloud/production/{private|shared}`. This becomes axios `baseURL`, so photos calls use relative paths.
- Downloads: the per-record `downloadURL`, fetched verbatim on a separate streaming axios instance (no jar headers, no cookies, no HAR).

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
- Internal members use a **public `_` prefix** (`_axios`, `_resources`, `_sitemap`) so tests can reach them. `private` is rare.

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
  - For axios errors use the `isAxiosError` guard.
- All HTTP goes through `Resources.network().get/post/put`, never raw axios.
- Read JSON with `jsonc` rather than `JSON.*`. For JSON imports, use `with {type: 'json'}`.
- **Prefer Node built-ins over small dependencies.** This is an active trend: `events.once`, `util.styleText`, `RegExp.escape`, `Error.isError`, `crypto` for SRP, native TS type stripping for `build/*.ts`. Don't add lodash-style utilities.
- `/* c8 ignore start/stop */` marks code that can't be tested.

## Testing conventions

- Import Jest globals explicitly from `@jest/globals`.
- Titles are backtick strings in nested `describe`s. `test.each`/`describe.each` take object rows with a `desc` field, used as `$desc` in the title.
- **Resources:** `const instances = prepareResources()!` in `beforeEach` (`test/_helpers/_general.ts`). It returns typed mocks:
  - `instances.manager` — set config directly, e.g. `_resources.maxRetries = 4`; resource-file I/O is stubbed.
  - `instances.network.mock` — an `axios-mock-adapter` with `onNoMatch: throwException`.
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
- `e2e` (`test:docker`) and `api` (`test:api`, 30 min) run on the **self-hosted `residential` runner**, with `TEST_*` taken from the runner's `.env`. These runs are needed for beta/main PRs and stay queued when the runner is offline.

**Release** (semantic-release, dependencies in `tools/release/`):
- The config is assembled at runtime by `helper/prepare-semantic-release` from `releaserc.json` files next to `release/{app,docker,github}-setup`, and patched **by array index**. Don't reorder plugins or assets.
- semantic-release runs three times on the same commit (npm, docker, github). The app and docker runs delete their git tag so all three compute the same version; only the GitHub run keeps the tag.
- Channels:
  - `dev`: `nightly` (`X.Y.Z-nightly.N`)
  - `beta`: `beta`
  - `main`: `latest`
- npm uses trusted publishing (OIDC, no token). Backtrace sourcemaps are uploaded with `BT_TOKEN`.
- DockerHub gets `steilerdev/icloud-photos-sync:{version,nightly|beta|latest}`, multi-arch with SBOM and provenance. The README is synced to DockerHub on `main`.
- GitHub releases (with tarball assets) happen only on beta/main.
- After a `main` release, `clean-after-prod-release` merges `main` into `dev` and deletes `*-nightly*` tags.
- `app/package.json` stays at `0.0.0-development`; nothing commits a version back.
- Release rules:
  - breaking or `majorfeat`: major
  - `feat`: minor
  - `fix|docs|refactor|perf|test|build|ci|chore`: patch
  - `style|no-release`: none
  - On `dev`, a catch-all makes **every push publish a nightly** to npm and DockerHub. (CONTRIBUTING.md's type table differs slightly; the CI rules are what apply.)

**Repo secrets:** `DOCKER_TOKEN` (also needed for PR builds), `BT_TOKEN`, `GITHUB_TOKEN`. Release jobs use GitHub Environments named `dev`/`beta`/`main`.

**Dependabot:** all ecosystems target `dev`.
- Commit prefixes: `chore: [ci]`, `[app]`, `[docker]`, `[docs]`, `[dev]`, `[semantic-release]`.
- Ignored majors: `@types/node` (tied to `app/node-version`), `typescript`, and `node` in Docker.
- In the Dockerfile, `node` and `alpine` are grouped because their Alpine versions must match.

**Keep these stable when editing app scripts or CI:**
- npm script names CI calls: `build`, `dist`, `build:dev`, `build:schema`, `test:unit`, `test:api`, `test:docker`, `test:docker:unit`, `doc:cli` (output dir as the last argument).
- The CTRF report path `app/coverage/ctrf-report.json`.
- `docs/mkdocs.yml` `site_dir`/`docs_dir`: these must stay single-quoted on one line, because CI greps them.
- The Node version: it is set in `app/node-version` (drives every `setup-node`), `docker/Dockerfile` (`node:<ver>-alpine<ver>`, matching the runtime `alpine` stage) and `.devcontainer.json`. Update all three together.
- Actions use major tags, except `devmasx/merge-branch`, which is pinned by SHA. `actionlint.yaml` declares the `residential` label.

## Git workflow

- Branch from `dev` and open PRs against `dev`. `beta` and `main` only receive release PRs (`dev` → `beta` → `main`), and branch protection blocks direct commits.
- Commits follow conventional commits, since semantic-release derives versions and notes from them.
- Summaries are imperative, lower-case, with no trailing period. Use an area tag after the type, e.g. `fix: [app] restore MFA flow for iOS 26.4+`, `chore: [docs] …`, `ci: …`.
