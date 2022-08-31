# Docker User Guide
I recommend using the provided docker image to run the script. The latest image is available on [DockerHub](https://hub.docker.com/r/steilerdev/icloud-photos-sync).

The `latest` tag should always represent the latest stable release, whereas the `nightly` tag offers the latest development build, which might not be stable.

## Installation
Using `docker-compose.yml`:
```
version: '2'
services:
  photo-sync:
    image: icloud-photos-sync:latest
    container_name: photo-sync
    command: "sync"
    environment:
       APPLE_ID_USER: "<iCloud Username>"
       APPLE_ID_PWD: "<iCloud Password>"
    volumes:
      - <photos-dir>:/opt/icloud-photos-library
```

A full list of configuration options (applied through environment variables) can be found in the [CLI Reference](https://steilerdev.github.io/icloud-photos-sync/user-guides/cli/)

## Helper Scripts

### Enter MFA
You can use the following helper script to send an MFA code to the application (if requested):
```
docker exec photo-sync enter_mfa <6-digit-code>
```

### Re-requesting MFA
You can use the following helper script to re-request your MFA code using the preferred method (`sms`, `voice` or `device`). If you have registered multiple phone numbers, specify their ID through the optional second parameter (integer > 0 expected).

The application will provide the available alternatives, in case the phone number ID is not valid.

```
docker exec photo-sync resend_mfa <method> <phoneNumberId>
```
