# Health Checks

If you set this project up to perform a sync in a regular interval, for example using the schedule `daemon` command, you will want to monitor this service in an automated way to avoid having to regularly check yourself. This project supports this by being able to send an HTTP request to a health check service each time a sync is started, completed or failed. This allows you to monitor the service and get notified if something goes wrong.

## How to setup

Go to [healthchecks.io](https://healthchecks.io/) and create an account. By default you will be using [healthchecks.io](https://healthchecks.io/) free tier, which (at the current point of time) allows you to limit up to 20 jobs. Alternatively you can also host your own instance of the health check service or use a different provider that uses the same protocol (see below). If you want to, you can setup a project or just use the one that has already been set up for you. In the project add a new check. Choose name and slug to your liking, set tags if desired. Set the schedule to the one you have ICPS setup at. Creating a check will give you a unique URL that you can pass to ICPS using either the `--health-check-url` flag or the `HEALTH_CHECK_URL` environment variable. That's it! To try it out, start ICPS in `daemon` mode, trigger a sync through the [Web UI](web-ui.md) and see the check appear in the health check dashboard. If an ICPS run fails you will receive an email to the address you used to sign up, but you can also configure other notification methods.

## Protocol

ICPS uses the health check ping url in compliance with [healthchecks.io](https://healthchecks.io/) as following. As long as the monitoring service uses the same protocol, it should work with any other provider as well.

Pings are only sent in `daemon` mode, for each scheduled sync, each sync requested through the [Web UI](web-ui.md) and each 'Renew Authentication' requested through the Web UI. The `sync` command never sends a ping.

1. When the sync starts, ICPS will send a POST request to the health check URL with `/start` appended. This request has no body.
2. When the sync completes successfully, ICPS will send a POST request to the plain health check URL.
3. When the sync fails, ICPS will send a POST request to the health check URL with `/fail` appended.
4. The success and failure requests contain the logs of the current run in the request body (the last 100 KiB). These logs include `DEBUG` messages, regardless of the configured [log level](cli.md#log-level).
5. ICPS expects a successful (`2xx`) plain text response (`Content-Type: text/plain`), as sent by healthchecks.io. Any other response is logged as a failed ping, the sync itself is not affected.

Aside from the explicit failure request, the monitoring service is expected to consider the service unhealthy if the success request is not received within the configured interval.

!!! tip "Grace period"
    While ICPS is waiting for an MFA code, no ping is sent. Configure the check's grace period to allow for the [MFA timeout](cli.md#mfa-timeout) (10 minutes by default) on top of the regular sync duration.
