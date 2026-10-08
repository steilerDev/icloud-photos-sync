# Proxy

By default, ICPS connects directly to the iCloud backend and ignores the proxy environment variables `HTTP_PROXY`, `HTTPS_PROXY` and `NO_PROXY`.

To route all outgoing requests (iCloud authentication and metadata, asset downloads, [health checks](health-checks.md), [crash reports](error-reporting.md) and [Web UI push notifications](web-ui.md)) through a proxy, enable it with the `--use-system-proxy` flag or the `USE_SYSTEM_PROXY` environment variable and provide the proxy configuration through the common environment variables:

| Variable | Description |
|---|---|
| `HTTPS_PROXY` | Proxy used for `https://` requests, e.g. `http://proxy.local:3128` |
| `HTTP_PROXY` | Proxy used for `http://` requests |
| `NO_PROXY` | Comma separated list of hosts that should be reached directly |

Lower case variants (`https_proxy`, `http_proxy`, `no_proxy`) are supported as well. ICPS fails on startup, if the configured proxy URL is invalid. Credentials embedded in the proxy URL (e.g. `http://user:password@proxy.local:3128`) are masked in crash reports.

=== "docker compose"

    ```
    services:
      photos-sync:
        image: steilerdev/icloud-photos-sync:latest
        environment:
          USE_SYSTEM_PROXY: true
          HTTPS_PROXY: "http://proxy.local:3128"
          ...
    ```

=== "docker run"

    ```
    docker run -e USE_SYSTEM_PROXY=true -e HTTPS_PROXY="http://proxy.local:3128" ... steilerdev/icloud-photos-sync:latest
    ```

=== "node"

    ```
    HTTPS_PROXY="http://proxy.local:3128" icloud-photos-sync daemon --use-system-proxy
    ```

!!! note "Migrating from earlier versions"
    Earlier versions applied `HTTP_PROXY`, `HTTPS_PROXY` and `NO_PROXY` implicitly. If you rely on a proxy, set `USE_SYSTEM_PROXY=true` when upgrading. Alternatively, Node.js' own `NODE_USE_ENV_PROXY=1` environment variable enables the same behaviour.
