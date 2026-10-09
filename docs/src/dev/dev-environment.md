# Development Environment

A reproducible development environment is available through [DevContainers](https://containers.dev/) (`.devcontainer.json`). It provides Node.js, Python 3.13, the GitHub CLI and Docker-in-Docker, and installs the app and docs dependencies after creation.

The container is started with `--env-file secrets/test.env`, so it won't start unless that file exists. Create it (and optionally the other environment files) from the `*.sample` files in the `secrets/` folder, which list the required variable names. See [Test Environment](test-environment.md) for their use.

## Toolchain

- **Node.js**: The version is pinned in `app/node-version` (used by all CI workflows), `.devcontainer.json` and both stages of `docker/Dockerfile` (`dhi.io/node:<version>-alpine<version>[-dev]`). Update all of them together. `app/package.json` requires `node >= 26`.
- **Python**: The docs are built with [MkDocs](https://www.mkdocs.org/) on Python 3.13, using the pinned dependencies from `docs/requirements.txt`.

## Build & Test

All npm commands are run from the `app/` folder.

| Command | Description |
|---|---|
| `npm ci` | Installs the dependencies (`.npmrc` sets `ignore-scripts` and `save-exact`) |
| `npm run build:schema` | Generates the JSON schemas used for validation (`src/lib/resources/schemas/*.json`, gitignored). **Required before running `tsc` or any tests** |
| `npm run build:dev` | Generates the schemas and compiles the TypeScript sources to `build/out/` |
| `npm run build` | Runs `eslint --fix` and `knip` before `build:dev` (this is what CI runs, followed by `npm run dist`) |
| `npm run test:unit` | Runs the unit tests (coverage is collected by default) |
| `npm run test:api` | Runs the API tests against the real iCloud backend (requires `secrets/test.env`) |
| `npm run test:docker` | Runs the Docker tests against `$IMAGE_NAME` |
| `npm run test:docker:unit` | Runs the subset of Docker tests that requires no credentials |
| `npm run execute -- <command>` | Runs the compiled CLI (e.g. `npm run execute -- sync`) |
| `npm run doc:cli -- ../docs/src` | Generates the CLI reference (`docs/src/user-guides/cli.md`) from the CLI options (build artifact, not committed) |

A single test file or test can be executed through:

```
npm test -- --coverage false test/unit/sync-engine.test.ts -t "<test name>"
```

Tests always need to be executed through `npm test`, which sets `TZ=UTC` and `NODE_OPTIONS=--experimental-vm-modules` (required by the ESM Jest setup). Running `npx jest` directly fails.

The docs can be previewed with `python3 -m mkdocs serve` from the `docs/` folder, after generating the CLI reference.

## IDE

This tool is developed using [coder's code server](https://github.com/coder/code-server) and a local installation of VSCode.

`.vscode/launch.json` provides the following launch configurations, reading their environment from `secrets/test.env`:

- **Launch App**: Builds the app and runs the `token` command
- **Run API Tests**: Runs the API tests
- **Run All Tests**: Runs all test suites
- **Debug Test**: Runs a single test file, reading its environment from `.vscode/test.env` (gitignored)

`.vscode/tasks.json` provides tasks to build the app, build the docs and run the tests.

The following extensions are used during development and are configured as part of this repository:

- **Code Spell Checker**
    - *Id*: `streetsidesoftware.code-spell-checker`
    - *Description*: Spelling checker for source code
    - *Publisher*: Street Side Software
    - [VS Marketplace](https://marketplace.visualstudio.com/items?itemName=streetsidesoftware.code-spell-checker)
- **Conventional Commits**
    - *Id*: `vivaxy.vscode-conventional-commits`
    - *Description* : Conventional Commits for VSCode.
    - *Publisher*: vivaxy
    - [VS Marketplace](https://marketplace.visualstudio.com/items?itemName=vivaxy.vscode-conventional-commits)
- **GitHub Actions**
    - *Id*: `github.vscode-github-actions`
    - *Description*: GitHub Actions workflows and runs for github.com hosted repositories in VS Code
    - *Publisher*: GitHub
    - [VS Marketplace Link](https://marketplace.visualstudio.com/items?itemName=GitHub.vscode-github-actions)
- **GitHub Pull Requests and Issues**
    - *Id*: `GitHub.vscode-pull-request-github`
    - *Description*: Pull Request and Issue Provider for GitHub
    - *Publisher*: GitHub
    - [VS Marketplace](https://open-vsx.org/vscode/item?itemName=GitHub.vscode-pull-request-github)
- **Live Server**
    - *Id*: `ritwickdey.LiveServer`
    - *Description*: Launch a development local Server with live reload feature for static & dynamic pages
    - *Publisher*: ritwickdey
    - [VS Marketplace](https://open-vsx.org/vscode/item?itemName=ritwickdey.LiveServer)
- **GitHub Copilot**
    - *Id*: `GitHub.copilot`
    - *Description*: Your AI pair programmer
    - *Publisher*: GitHub
    - [VS Marketplace](https://marketplace.visualstudio.com/items?itemName=GitHub.copilot)
- **Vim**
    - *Id*: `vscodevim.vim`
    - *Description*: Vim emulation for Visual Studio Code
    - *Publisher*: vscodevim
    - [VS Marketplace](https://marketplace.visualstudio.com/items?itemName=vscodevim.vim)
- **Docker**
    - *Id*: `docker.docker`
    - *Description*: Docker language support and tooling
    - *Publisher*: Docker
    - [VS Marketplace](https://marketplace.visualstudio.com/items?itemName=docker.docker)
- **GPG Indicator**
    - *Id*: `wdhongtw.gpg-indicator`
    - *Description*: Show the status of the GPG signing key for your project!
    - *Publisher*: Weida Hong
    - [VS Marketplace](https://marketplace.visualstudio.com/items?itemName=wdhongtw.gpg-indicator)

## Docker Image

The Docker image is based on [Docker Hardened Images](https://dhi.io/catalog/node). Pulling the base images requires authentication with a Docker Hub account (a [personal access token](https://docs.docker.com/security/access-tokens/) is recommended):

```
docker login dhi.io
```

The build context needs to contain the packaged application as `npm-pack.tgz`:

```
(cd app/ && npm run build && npm run dist && npm pack)
mv app/icloud-photos-sync-*.tgz docker/npm-pack.tgz
docker build -t steilerdev/icloud-photos-sync:local docker/
```

Since the runtime image does not include a shell, the Docker test helpers execute their commands within the container through `node -e`.
