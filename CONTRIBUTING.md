# Contributing to icloud-photos-sync

We would love for you to contribute to `icloud-photos-sync` and help make it even better than it is today!

As a contributor, here are the guidelines we would like you to follow:

 - [Code of Conduct](#coc)
 - [Question or Problem?](#question)
 - [Issues and Bugs](#issue)
 - [Feature Requests](#feature)
 - [Submission Guidelines](#submit)
 - [Commit Message Guidelines](#commit)
 - [Release Process](#release)


## <a name="coc"></a> Code of Conduct

Help us keep this project open and inclusive.
Please read and follow our [Code of Conduct](https://github.com/steilerDev/icloud-photos-sync/blob/main/CODE_OF_CONDUCT.md).


## <a name="question"></a> Got a Question or Problem?

Do not open issues for general support questions as we want to keep GitHub issues for bug reports and feature requests.
Instead, we recommend using [Github Discussions](https://github.com/steilerDev/icloud-photos-sync/discussions) to ask support-related questions.


## <a name="issue"></a> Found a Bug?

If you find a bug in the source code, you can help us by [submitting an issue](#submit-issue).
Even better, you can [submit a Pull Request](#submit-pr) with a fix.


## <a name="feature"></a> Missing a Feature?
You can *request* a new feature by [submitting an issue](#submit-issue).
If you would like to *implement* a new feature, please consider the size of the change in order to determine the right steps to proceed:

* For a **Major Feature**, first open an issue and outline your proposal so that it can be discussed.
  This process allows us to better coordinate our efforts, prevent duplication of work, and help you to craft the change so that it is successfully accepted into the project.

* **Small Features** can be crafted and directly [submitted as a Pull Request](#submit-pr).


## <a name="submit"></a> Submission Guidelines


### <a name="submit-issue"></a> Submitting an Issue

Before you submit an issue, please search the [issue tracker](https://github.com/steilerDev/icloud-photos-sync/issues). An issue for your problem might already exist and the discussion might inform you of workarounds readily available.

We want to fix all the issues as soon as possible, but before fixing a bug, we need to reproduce and confirm it.
In order to reproduce bugs, we require that you provide the error code displayed during runtime as well as the log file generated during the execution (preferably at `DEBUG` level).

You can file new issues by selecting from our [new issue templates](https://github.com/steilerDev/icloud-photos-sync/issues/new/choose) and filling out the issue template.


### <a name="submit-pr"></a> Submitting a Pull Request (PR)

Before you submit your Pull Request (PR) consider the following guidelines:

1. Search [GitHub](https://github.com/steilerDev/icloud-photos-sync/pulls) for an open or closed PR that relates to your submission. You don't want to duplicate existing efforts.

2. Be sure that an issue describes the problem you're fixing, or documents the design for the feature you'd like to add. Discussing the design upfront helps to ensure that we're ready to accept your work.

3. [Fork](https://docs.github.com/en/github/getting-started-with-github/fork-a-repo) the `steilerDev/icloud-photos-sync` repo.

4. In your forked repository, make your changes in a new git branch based on the `dev` branch

     ```shell
     git checkout -b my-fix-branch dev
     ```

5. Create your patch, **including appropriate test cases**.

6. Make sure unit tests pass and consider adding relevant test cases in order to ensure proper coverage.

7. Commit your changes using a descriptive commit message that follows our [commit message conventions](#commit).
   Adherence to these conventions is necessary because release notes are automatically generated from these messages.

     ```shell
     git commit --all
     ```
    Note: the optional commit `-a` command line option will automatically "add" and "rm" edited files.

10. Push your branch to GitHub:

    ```shell
    git push origin my-fix-branch
    ```

11. In GitHub, send a pull request targeting the `dev` branch.

### Reviewing a Pull Request

The team reserves the right not to accept pull requests from community members who haven't been good citizens of the community. Such behavior includes not following the [code of conduct](https://github.com/steilerDev/icloud-photos-sync/blob/main/CODE_OF_CONDUCT.md).

#### Addressing review feedback

If we ask for changes via code reviews then:

1. Make the required updates to the code.

2. Re-run the unit tests to ensure they are still passing.

3. Create a fixup commit and push to your GitHub repository (this will update your Pull Request):

    ```shell
    git commit --all --fixup HEAD
    git push
    ```

That's it! Thank you for your contribution!


##### Updating the commit message

A reviewer might often suggest changes to a commit message (for example, to add more context for a change or adhere to our [commit message guidelines](#commit)).
In order to update the commit message of the last commit on your branch:

1. Check out your branch:

    ```shell
    git checkout my-fix-branch
    ```

2. Amend the last commit and modify the commit message:

    ```shell
    git commit --amend
    ```

3. Push to your GitHub repository:

    ```shell
    git push --force-with-lease
    ```

> NOTE:<br />
> If you need to update the commit message of an earlier commit, you can use `git rebase` in interactive mode.
> See the [git docs](https://git-scm.com/docs/git-rebase#_interactive_mode) for more details.


#### After your pull request is merged

After your pull request is merged, you can safely delete your branch and pull the changes from the main (upstream) repository:

* Delete the remote branch on GitHub either through the GitHub web UI or your local shell as follows:

    ```shell
    git push origin --delete my-fix-branch
    ```

* Check out the main branch:

    ```shell
    git checkout main -f
    ```

* Delete the local branch:

    ```shell
    git branch -D my-fix-branch
    ```

* Update your local `dev` with the latest upstream version:

    ```shell
    git pull --ff upstream dev
    ```


## <a name="commit"></a> Commit Message Format

We have very precise rules over how our Git commit messages must be formatted.
This format leads to **easier to read commit history**.

Each commit message consists of a **header**, a **body**, and a **footer**.


```
<header>
<BLANK LINE>
<body>
<BLANK LINE>
<footer>
```

The `header` is mandatory and must conform to the [Commit Message Header](#commit-header) format.

The `body` is optional, except for major changes.
When the body is present it must be at least 20 characters long and must conform to the [Commit Message Body](#commit-body) format.

The `footer` is optional. The [Commit Message Footer](#commit-footer) format describes what the footer is used for and the structure it must have.

The VSCode Extension [Conventional Commits by vivaxy](https://marketplace.visualstudio.com/items?itemName=vivaxy.vscode-conventional-commits) is recommended to easily follow these conventions.


#### <a name="commit-header"></a>Commit Message Header

```
<type>: <short summary>
  │           │
  │           └─⫸ Summary in present tense. Not capitalized. No period at the end.
  │
  └─⫸ Commit Type: build|ci|docs|feat|fix|perf|refactor|test
```

The `<type>` and `<summary>` fields are mandatory.


##### Type

Must be one of the following:

* **majorfeat**: A new major features (*major* release)
* **feat**: A new feature (*minor* release)
* **fix**: A bug fix (*patch* release)
* **docs**: Documentation only changes (*patch* release)
* **refactor**: A code change that neither fixes a bug nor adds a feature (*no* release)
* **perf**: A code change that improves performance (*patch* release)
* **test**: Adding missing tests or correcting existing tests (*patch* release)
* **build**: Changes that affect the build system or external dependencies (*patch* release)
* **ci**: Changes to the CI configuration files and scripts (*patch* release)
* **chore**: Dependency bumps and general maintenance task that don't directly affect the features of the application (*patch* release)
* **style**: Changes that only affect the coding style (*no* release)

##### Summary

Use the summary field to provide a succinct description of the change:

* use the imperative, present tense: "change" not "changed" nor "changes"
* don't capitalize the first letter
* no dot (.) at the end


#### <a name="commit-body"></a>Commit Message Body

Just as in the summary, use the imperative, present tense: "fix" not "fixed" nor "fixes".

Explain the motivation for the change in the commit message body. This commit message should explain _why_ you are making the change.
You can include a comparison of the previous behavior with the new behavior in order to illustrate the impact of the change.


#### <a name="commit-footer"></a>Commit Message Footer

The footer can contain information about breaking changes and deprecations and is also the place to reference GitHub issues and other PRs that this commit closes or is related to.

Breaking Change section should start with the phrase "BREAKING CHANGE: " followed by a summary of the breaking change, a blank line, and a detailed description of the breaking change that also includes migration instructions.

Similarly, a Deprecation section should start with "DEPRECATED: " followed by a short description of what is deprecated, a blank line, and a detailed description of the deprecation that also mentions the recommended update path.

Github issues can be referenced through "Fixes #<number>" and Pull Requests through "Closes #<number>".

### Revert commits

If the commit reverts a previous commit, it should begin with `revert: `, followed by the header of the reverted commit.

The content of the commit message body should contain:

- information about the SHA of the commit being reverted in the following format: `This reverts commit <SHA>`,
- a clear description of the reason for reverting the commit message.


## <a name="release"></a> Release Process

This projects' development process loosely follows git-flow by (Vincent Driessen)[http://nvie.com/]. Feature development happens on the `dev` branch, however features don't get their own feature branch, due to the lack of contribution complexity at the moment.

External PRs should therefore target the dev branch. This will trigger unit tests, which need to pass, in order for merging to be considered. Every push to the `dev` branch will trigger a pre-release to the `nightly` channel on DockerHub and npm through [semantic-release](https://github.com/semantic-release/semantic-release).

Once the `dev` branch has reached a certain stage, changes can be staged for release on the `beta` channel. This happens through a Pull Request against the `beta` branch. This will trigger more thorough checks, including building all assets necessary for release, as well as E2E and API tests. Once the pull request has been merged, [semantic release](https://github.com/semantic-release/semantic-release) will perform a release to the `beta` channel on DockerHub and npm.

In order to run a production release, a PR against the main branch is required - triggering the same sanity checks as the `beta` branch. After passing and merging, a production release will deploy the artifacts to DockerHub, npm and also update documentations. After a production release was concluded, the associated nightly tags are removed (to clean up the repository) and the main branch is merged back into the dev branch, in order to update the semantic release version.

Before merging the PR into `beta` or `main` the following checks are enforced through branch protection rules:
- Full build process
- Unit tests
- API tests
- Docker E2E tests

`beta` and `main` branch can only receive PRs - direct commits are disabled through branch protection rules. Those PRs can be created directly through the following quick links:
- [Stage for Beta Release](https://github.com/steilerdev/icloud-photos-sync/compare/beta...dev?quick_pull=1&title=stage+for+beta+release&body=This+PR+stages+the+dev+branch+for+beta+release)
- [Stage for Production Release](https://github.com/steilerdev/icloud-photos-sync/compare/main...beta?quick_pull=1&title=stage+for+production+release&body=This+PR+stages+the+beta+branch+for+production+release)