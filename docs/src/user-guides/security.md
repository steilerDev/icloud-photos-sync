# Security of your Apple ID credentials

Since this application needs to communicate with the Apple iCloud backend, full access to your AppleID needs to be provided. By open-sourcing this application, I hope to gain your trust, that I am not able to read or access your credentials or tokens!

Credentials are only sent directly to Apple's authentication servers - third party services are NOT involved in this process. Instead of providing the credentials as plain text environment variables or CLI arguments, they can be read from files (e.g. [Docker secrets](https://docs.docker.com/compose/how-tos/use-secrets/)) using the [username file](cli.md#username-file) and [password file](cli.md#password-file) options.

## Logs and network capture

The application does not write credentials into its logs. On `debug` level, the log contains details of the authentication flow (e.g. the submitted MFA code), which is why it should be treated as confidential.

!!! danger "Network capture"
    Enabling [network capture](cli.md#enable-network-capture) requires explicit consent and is meant for debugging only. The resulting HAR file (`.icloud-photos-sync.har` in the data dir) records all requests and responses **unmasked** - including session tokens, cookies, the trust token and request bodies (when using the [legacy login](cli.md#legacy-login), this includes your plain text password). Never share this file publicly and remove it once debugging is done. When it is attached to a [crash report](error-reporting.md), confidential data is masked before submission.

## Services this application communicates with

Besides Apple's servers, the only service hard coded into this application is [Backtrace](error-reporting.md), which requires opt-in and is used for crash and error reporting. Scrubbing of credentials and sensitive data is performed before any errors are reported.

All other services are only contacted, if you configure them:

- The [health check URL](health-checks.md) you provide
- The [proxy](proxy.md) configured in your environment, if enabled
- The push service of the browser/device that subscribed to [notifications](web-ui.md#notifications) (e.g. Apple's or Google's push service). The push subscription is signed using your AppleID username as contact address (as required by the Web Push protocol) and the notification contains the current state of the application.

## Web UI

The [Web UI](web-ui.md) and its API do not offer authentication: Anyone able to reach the port can trigger a sync or re-authentication, submit MFA codes and read the application's logs. Don't expose the port to untrusted networks - if you need remote access, place it behind a reverse proxy with authentication and TLS (which is also required for notifications).

## Runtime

The Docker image is built on a minimal, hardened base image and can optionally be restricted further using the Node.js permission model, see [Runtime Hardening](hardening.md).
