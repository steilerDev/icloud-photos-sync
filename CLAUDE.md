# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository layout

- `app/` — the TypeScript application (ESM, Node >= 26, published to npm as `icloud-photos-sync`). All npm commands run from here.
- `docker/` — Dockerfile; the image installs the `npm-pack.tgz` built from `app/`.
- `docs/` — mkdocs site (https://icps.steiler.dev). `docs/src/dev/` holds developer docs, including the reverse-engineered iCloud auth flow (`api.md`) and the on-disk library layout (`local-file-structure.md`).
- `secrets/` — `*.env` files with real Apple ID credentials for API/E2E tests (loaded by the devcontainer and VSCode tasks). Never read, print, or commit them.
- `.github/actions/` — composite actions used by the workflows in `.github/workflows/`.

## Commands (run in `app/`)

```sh
npm ci                     # .npmrc sets ignore-scripts and save-exact
npm run build:schema       # REQUIRED before tests/tsc: generates gitignored src/lib/resources/schemas/*.json
npm run build:dev          # schema + tsc -> build/out/
npm run build              # eslint --fix + knip, then build:dev
npm run test:unit          # jest unit tests (coverage on by default)
npm test -- --coverage false test/unit/sync-engine.test.ts -t "<test name>"   # single file / single test
npm run execute -- sync    # run the compiled CLI (subcommands: daemon (default), sync, token, archive <path>)
npm run doc:cli -- ../docs/src   # generate docs/src/user-guides/cli.md from the commander options (build artifact, not committed)
```

Tests always go through `npm test`, which sets `TZ=UTC` and `NODE_OPTIONS=--experimental-vm-modules` (ts-jest ESM preset). Running `npx jest` directly will fail.

- `test:api` hits the real iCloud backend and needs the test account credentials from `secrets/test.env`.
- `test:docker` uses testcontainers against `$IMAGE_NAME` (default `steilerdev/icloud-photos-sync:nightly`).
- Lint style: 4-space indent, backtick strings for all string literals (`@stylistic/quotes: backtick`), `.js` extensions on relative imports.

## Architecture

**Entry and app selection.** `src/main.ts` calls `appFactory()` (`src/app/factory.ts`). The factory parses CLI options and env vars with commander (every option has an env-var twin, e.g. `APPLE_ID_USER`, `DATA_DIR`). It calls `Resources.setup(options)` and returns one of the app classes in `src/app/icloud-app.ts`:
- `DaemonApp` — a cron schedule that runs `SyncApp`.
- `TokenApp`, `SyncApp`, `ArchiveApp` — an inheritance chain: `ArchiveApp` extends `SyncApp`, which extends the abstract `iCloudApp`. Each `run()` calls `super.run()` first, and only the concrete class that was instantiated calls `clean()` (checked via `this.constructor.name`).

**Resources singleton (`src/lib/resources/main.ts`).** A namespace that holds the process-wide singletons. Code reaches them through static accessors, not by passing them around:
- `Resources.event()` — EventManager: the event bus.
- `Resources.state()` — StateManager: app state machine (READY/RUNNING/…) and the library lock file.
- `Resources.manager()` — ResourceManager: CLI options plus the persisted `.icloud-photos-sync` resource file (trust token, session secrets).
- `Resources.network()` — NetworkManager: axios session, cookies, rate limiting, HAR capture.
- `Resources.validator()` — Validator: ajv validation of iCloud responses against the generated schemas.

Tests reset and mock these with `prepareResources()` from `test/_helpers/_general.ts`.

**Event-driven side effects.** Core classes emit typed events (`events-types.ts`) via `Resources.emit(...)` and never log or print directly. `main.ts` instantiates independent listeners that subscribe with `Resources.events(this).on(...)`:
- `LogInterface` and `CLIInterface` (progress bars)
- `MetricsExporter` (Influx line protocol)
- `HealthCheckPingExecutor`
- `WebServer`

Listeners must be removed via `Resources.events(obj).removeListeners()` when an app cleans up. Logging goes through `Resources.logger(this)`, which also emits events.

**Sync pipeline.** `iCloud` (`src/lib/icloud/`) handles auth: SRP login, MFA, trust token, and the iOS 26.4+ escrow step documented in `docs/src/dev/api.md`. `iCloudPhotos` builds and parses CloudKit queries. `SyncEngine.sync()` runs these steps, with retries up to `maxRetries`:
1. `fetchAndLoadState` — fetches the remote state from `iCloudPhotos` and loads the local state from disk (`PhotosLibrary`).
2. `diffState` — produces processing queues.
3. `writeState` — downloads and deletes assets, and adds and removes albums.

`ArchiveEngine` then optionally archives a folder.

**No database: the file system is the state.** Assets are stored in `_All-Photos`/`_Shared-Photos`, named by iCloud checksum, with mtime set to the remote modified date. Albums are hidden `.{UUID}` folders full of symlinks to assets, plus a display-name symlink. Folders that contain non-"safe" files are treated as archived and left alone. See `docs/src/dev/local-file-structure.md` before changing anything in `photos-library/` or `sync-engine/`.

**Errors.** Throw `iCPSError` built from an `ErrorStruct`. Define new codes per domain in `src/app/error/codes/<domain>.ts` with `buildErrorStruct(name, prefix, code, message)`, re-exported through `error-codes.ts`. Wrap lower-level failures with `.addCause(err)` and `.addContext(key, value)`.

**Web UI** (`src/app/web-ui/`). A dependency-free `node:http` server for MFA entry, state view and web-push notifications. Its HTML, CSS and client JS live as TypeScript template strings under `view/`, `css/` and `scripts/`; there are no static asset files.

**Validated external data.** When adding a response type that should be validated, define it in `resource-types.ts` / `network-types.ts`, register it in `app/build/schema.ts`, and import the generated JSON in `validator.ts`.

## Git workflow

- Branch from `dev` and open PRs against `dev`. `beta` and `main` only receive release PRs (`dev` → `beta` → `main`), and every push to `dev` publishes a nightly release.
- Commits follow conventional commits; semantic-release derives versions from them. Types: `majorfeat|feat|fix|docs|refactor|perf|test|build|ci|chore|style`.
- Summaries are imperative, lower-case, with no trailing period. Use a `[app]` / `[docs]` scope tag where applicable, e.g. `fix: [app] restore MFA flow for iOS 26.4+`.
