This is a PoC/WIP to demonstrate how [icloud-photos-downloader](https://github.com/icloud-photos-downloader/icloud_photos_downloader) could be expanded as a full sync engine also mirroring all folders and album structures.

This is my first Python project and the code is heavily borrowed from the original project.

=== Build ===

Run the following to build the Docker Container. The container will run once before quitting. This is intended due to the iCloud Auth timeout. I've included -but uncommented- the cron logic.

```
if [ -d "./rootfs" ]; then
    echo "Found rootfs assests, compressing..."
    if [ -f "./rootfs.tar.gz" ] ; then
        rm rootfs.tar.gz
    fi
    cd rootfs
    tar -czvf ../rootfs.tar.gz ./*
    cd ..
    echo "...done"
fi
docker build . -t icloud-photo-sync:latest
if [ -f "./rootfs.tar.gz" ]; then
    rm rootfs.tar.gz
fi
```

=== Run ===

This is my `docker-compose.yml` started through `docker-compose up`

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
       USERNAME: "<iCloud Username>"
       PASSWORD: "<iCloud Password>"
       CLIENT_ID: "<some ID for the cookie, optional>"
       IGNORE_ALBUMS: "Videos,Time-lapse,Slo-mo,Screenshots,Panoramas,Markiert,Live,Hidden,Bursts,Abgelehnt,★,★★,★★★,★★★★,★★★★★,Instagram,WhatsApp" # CSV List of albums to ignore, when building the tree
       # If enabled (see above):
#      The cron schedule for backups: min   hour    day     month   weekday
#       CRON_SCHEDULE: "0 4 * * 0,3"
    volumes:
      - <cookie-dir>:/icloud-cookie
      - <data-dir>:/icloud-photos
```