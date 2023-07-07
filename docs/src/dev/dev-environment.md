# Development Environment

## IDE

This tool is developed using [coder's code server](https://github.com/coder/code-server) and a local installation of VSCode.

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
- **Jest**
  - *Id*: `Orta.vscode-jest`
  - *Description*: Use Facebook's Jest With Pleasure.
  - *Publisher*: Orta
  - [VS Marketplace](https://marketplace.visualstudio.com/items?itemName=Orta.vscode-jest)
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

## Running in a development environment

This repository defines VSCode tasks and debug configurations. The latter references the `test.env` file from the `.vscode` directory in order to access secrets while executing. Alternatively the basic authentication credentials (username, password and trust token) could be exported.

```
APPLE_ID_USER=<test-user>
APPLE_ID_PWD=<test-password>
TRUST_TOKEN=<test-trust-token>
ENABLE_CRASH_REPORTING=true
FORCE=true
DATA_DIR=<projectFolder>/app-data-dir/
```