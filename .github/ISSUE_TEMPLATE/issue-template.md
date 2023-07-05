---
name: Issue Template
about: General issue template for icloud-photos-sync
title: ''
labels: new
assignees: ''

---

## Checklist before opening an issue
- [ ] Tried the sync a couple of times and the issue is persisting
- [ ] Checked out [known issues](https://github.com/steilerDev/icloud-photos-sync/labels/class(known%20issue))
- [ ] Enabled [crash and error reporting](https://steilerdev.github.io/icloud-photos-sync/user-guides/error-reporting/)

## Describe the issue

A clear and concise description of what the issue is.

## Error code

Share the unique error code generated upon the crash. The log message should look like this:

```
Experienced fatal error at <time of day>: <error description> (Error Code: f5f121c7-a3b5-4ab3-99cd-b9cde3cca821)
```

## Logs

Please paste the content of the log file (with `LOG_LEVEL=debug`), located in `.icloud-photos-sync.log`, stored in the user specified `DATA_DIR`:

```
.icloud-photos-sync.log
```

## Operating environment

 - OS: [e.g. Debian 10]
 - Version: [e.g. 1.0.0]
 - Execution environment: [e.g. docker]
