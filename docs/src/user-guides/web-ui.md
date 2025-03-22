# WebUI

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