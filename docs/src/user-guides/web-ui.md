# WebUI

## Basic WebUI

A basic UI is available on the port that is passed via the `port` parameter or 80 by default. Naturally it only is available as long as the app is running. This makes it most useful for daemon mode, but it can just as well be used for MFA Input when running a regular 'sync' or 'token' job. The UI provides the following features:

- **Sync Status** Showing in which state the app currently is. Most of the times this will show wether the last sync was successful or not. If the app is running in daemon mode, the UI will also show the next scheduled sync time.
- **Manual Sync Trigger** You can trigger a manual sync by clicking the "Sync Now" button. This will start a new sync process and show the progress in the UI.
- **Manual Reauthorization** If the last sync failed because the MFA token expired, you can reauthorize the app by clicking the "Reauthorize" button, which will start a new authorization process (basically the same as what the 'token' job does). If you have `failOnMfa` set, this is ignored when the reauthorization is triggered through the UI.
- **MFA Code Input** If the app is waiting for an MFA code, you can enter it in the UI. This cannot only be done when the app
- **Resend MFA Code/Change MFA Method** By default, MFA codes will be send to a device. However, if you want to receive your code using sms or a call, you can do so by clicking the 'Resend Code/Change Method' button in the view to submit the MFA Code.

The UI is only available in Englisch, although the sync timestamps use the formatting of the system locale.

## PWA & Notification Capabilities

The Web UI is implemented as a PWA. This way, the app can cleanly be added to the home screen. The Service Worker of the PWA will only cache the static resources, which means that while you are offline or your ICPS Server is unreachable you can open the PWA, but it will only show you that it can't fetch the state. The PWA can also publish push notifications when the sync failed because of an error or when the sync is back to normal. To enable notifications, add the PWA to your home screen, tap on the notification and grant notification permissions. Note that notifications or other PWA capabilities might not work, if you do not use a TLS encrypted connection with a certificate trusted by the device. PWA capabilities have only been tested with Safari on MacOS and iOS.

## Watching the synced Photos

Since this tool is syncing all assets to the native file system, pretty much any tool can be used to present the pictures. I've been testing some tools recommended by [awesome-selfhosted](https://github.com/awesome-selfhosted/awesome-selfhosted#photo-and-video-galleries) and settled on [Photoview](https://photoview.github.io/). The following `docker-compose.yml` will run `icloud-photos-sync` together with `Photoview`:

```
version: '2'
services:
  photos-sync:
    image: steilerdev/icloud-photos-sync:latest
    container_name: photos-sync
    user: <uid>:<gid> 
    environment:
      APPLE_ID_USER: "<iCloud Username>"
      APPLE_ID_PWD: "<iCloud Password>"
      TZ: "Europe/Berlin"                                                       
      SCHEDULE: "* 2 * * *"
      ENABLE_CRASH_REPORTING: true
    volumes:
      - <photos-dir>:/opt/icloud-photos-library
  photoview-db:
    image: mariadb:10.5
    container_name: photos-photoview-db
    restart: unless-stopped
    environment:
      MYSQL_DATABASE: "photoview"
      MYSQL_USER: "photoview"
      MYSQL_PASSWORD: "<some-password>"
      MYSQL_RANDOM_ROOT_PASSWORD: 1
    volumes:
      - db:/var/lib/mysql
  photoview:
    image: viktorstrate/photoview:2
    container_name: photos-photoview
    restart: unless-stopped
    depends_on:
      - photoview-db
    environment:
      PHOTOVIEW_MYSQL_URL: photoview:<some-password>@tcp(photoview-db)/photoview
      PHOTOVIEW_LISTEN_IP: 0.0.0.0
      PHOTOVIEW_LISTEN_PORT: 80
      PHOTOVIEW_MEDIA_CACHE: /app/cache
    ports:
      - "80:80"
    volumes:
      - <photos-dir>:/photos:ro
      - cache:/app/cache
volumes:
    db:
    cache:
```