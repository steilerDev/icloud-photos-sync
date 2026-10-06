# Development Environment

A reproducible development environment is available through [DevContainers](https://containers.dev/). Please make sure to populate the environment files in the `secrets/` folder to use all features.

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
