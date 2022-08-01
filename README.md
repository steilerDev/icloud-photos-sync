Currently resetting this project and working on NodeJS version of this.

## Build

To build and run the npm project directly, navigate to `rootfs/opt/icloud-photos-sync` and run
```
npm build
npm execute
```

Make sure the following environmental variables are present:
 - `APPLE_ID_USER`
 - `APPLE_ID_PWD`
 - `PORT` (for listening on MFA code)

## Run

This is my `docker-compose.yml` started through `docker-compose up && docker attach photo-sync`

```
version: '2'
services:
  photo-sync:
    image: icloud-photos-sync:latest
    container_name: photo-sync
    restart: unless-stopped
    stdin_open: true
    tty: true
    environment:
       APPLE_ID_USER: "<iCloud Username>"
       APPLE_ID_PWD: "<iCloud Password>"
#      The cron schedule for syncs: min   hour    day     month   weekday
#       CRON_SCHEDULE: "0 4 * * 0,3"
    volumes:
      - <conf+data-dir>:/icloud-data
      - <photos-dir>:/icloud-photos
```

### Enter MFA
Once requested by the tool, enter the MFA Code with
```
docker exec photo-sync enter_mfa <6-digit-code>
```
There is currently no way to re-request it, besides quiting the application and re-running it