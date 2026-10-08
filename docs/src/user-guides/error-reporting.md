# Error and Crash Reporting

This projects uses the error and crash reporting solution from [Backtrace](https://backtrace.io/). Upon opt-in this will collect information about experienced errors and crashes and send it to the solution. Please consult the [Privacy Notice](https://saucelabs.com/privacy-policy) for more information about the processed data.

Crash reporting is disabled by default and enabled through the [`enable-crash-reporting`](cli.md#enable-crash-reporting) option (`ENABLE_CRASH_REPORTING=true`).

!!! tip "Purpose"
    **Please consider donating your data, by always enabling crash reporting**
    
    This helps crowdsource context and crash data in order to efficiently discover and remediate bugs, improving this solution's performance, quality and reliability.

## Data collected

Once enabled, the following data is sent:

- **Error reports**, whenever an error occurs. A report contains
    - the error, its causes and the call stack,
    - the last 200 events of the application (breadcrumbs),
    - the last 200 lines of the log file and - if [network capture](cli.md#enable-network-capture) is enabled - the HAR file,
    - the configuration (environment variables and CLI arguments) and information about the runtime (application, Node.js and OS version, architecture, memory),
    - an identifier of the installation, derived from the machine id.
- **Unknown file types**, whenever an asset with a file type that is not yet supported is found - these reports are used to [add support for new file types](https://github.com/steilerDev/icloud-photos-sync/issues/143).
- **Usage statistics**, counting the execution of syncs and archive operations.

Some errors are never reported, because they are caused by the environment or user input (e.g. a wrong password, an MFA code that was not provided in time or a port that is already in use).

When an error was reported, its message ends with `(error code: <uuid>)`. Please include this code when [reporting an issue](https://github.com/steilerDev/icloud-photos-sync/blob/main/CONTRIBUTING.md), it allows finding the report.

## Masking of confidential data

Before a report is submitted, confidential data is masked within the report, the log file and the HAR file:

| Data | Masked as |
|---|---|
| AppleID username and password | `<APPLE ID USERNAME>`, `<APPLE ID PASSWORD>` |
| Trust token and session secret | `<TRUST TOKEN>`, `<SESSION SECRET>` |
| Path of the [health check URL](health-checks.md) | `https://hc-ping.com/<HEALTH CHECK PATH>` (only the origin is kept) |
| Path of push notification subscriptions | `https://web.push.apple.com/<PUSH SUBSCRIPTION PATH>` (only the origin is kept) |
| Credentials embedded in URLs (e.g. a [proxy](proxy.md) `http://user:password@proxy:3128`) | `http://<MASKED>@proxy:3128` |
| Values of session headers and cookies (e.g. `X-Apple-Session-Token`, `scnt`, `Cookie`, `Set-Cookie`) | `<MASKED>` (cookie names are kept) |

Other environment variables are submitted as they are - don't store secrets of other applications in the environment of this application.

## Background

I'm working for [Sauce Labs](https://saucelabs.com/) - who owns Backtrace - and I am using this project as a learning opportunity and practical example of our tool set. 
