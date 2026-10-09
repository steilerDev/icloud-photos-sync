# Viewing your Library with Photoview

Since this tool is syncing all assets to the native file system, pretty much any tool can be used to present the pictures. I've been testing some tools recommended by [awesome-selfhosted](https://github.com/awesome-selfhosted/awesome-selfhosted#photo-and-video-galleries) and settled on [Photoview](https://photoview.github.io/). The following `docker-compose.yml` will run `icloud-photos-sync` together with `Photoview` - the [WebUI](web-ui.md) of `icloud-photos-sync` is available on port `8080`, Photoview on port `80`:

```
services:
  photos-sync:
    image: steilerdev/icloud-photos-sync:latest
    container_name: photos-sync
    restart: unless-stopped
    user: <uid>:<gid> 
    environment:
      APPLE_ID_USER: "<iCloud Username>"
      APPLE_ID_PWD: "<iCloud Password>"
      TZ: "Europe/Berlin"                                                       
      SCHEDULE: "0 2 * * *"
      ENABLE_CRASH_REPORTING: true
    ports:
      - "8080:80"
    volumes:
      - <photos-dir>:/opt/icloud-photos-library
  photoview-db:
    image: mariadb:lts
    container_name: photos-photoview-db
    restart: unless-stopped
    environment:
      MARIADB_DATABASE: "photoview"
      MARIADB_USER: "photoview"
      MARIADB_PASSWORD: "<some-password>"
      MARIADB_RANDOM_ROOT_PASSWORD: 1
    volumes:
      - db:/var/lib/mysql
  photoview:
    image: photoview/photoview:2
    container_name: photos-photoview
    restart: unless-stopped
    depends_on:
      - photoview-db
    environment:
      PHOTOVIEW_DATABASE_DRIVER: mysql
      PHOTOVIEW_MYSQL_URL: photoview:<some-password>@tcp(photoview-db)/photoview
      PHOTOVIEW_LISTEN_IP: 0.0.0.0
    ports:
      - "80:80"
    volumes:
      - <photos-dir>:/photos:ro
      - cache:/home/photoview/media-cache
volumes:
    db:
    cache:
```

