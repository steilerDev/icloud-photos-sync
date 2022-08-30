# Docker User Guide
I recommend using the provided docker image to run the script. Running the container will perform a sync and then exit.


## Installation
Using `docker-compose.yml`:
```
version: '2'
services:
  photo-sync:
    image: icloud-photos-sync:latest
    container_name: photo-sync
    environment:
       APPLE_ID_USER: "<iCloud Username>"
       APPLE_ID_PWD: "<iCloud Password>"
    volumes:
      - <photos-dir>:/opt/icloud-photos-library
```

A full list of configuration options (applied through environment variables) can be found by executing `docker run icloud-photos-sync:latest icloud-photos-sync --help`.

The latest snapshot build is available through the `nightly` tag on DockerHub. This release channel might not be stable.

## Helper Scripts

### Enter MFA
You can use the following helper script to send an MFA code to the application (if requested):
```
docker exec photo-sync enter_mfa <6-digit-code>
```

### Re-requesting MFA
You can use the following helper script to request a resend of your MFA code using the preferred method (`sms`, `voice` or `device`). If you have registered multiple phone numbers, specify their id through the optional second parameter (number > 0 expected).

The application will provide the available alternatives, in case the phone number ID is not valid.

```
docker exec photo-sync resend_mfa <method> <phoneNumberId>
```
