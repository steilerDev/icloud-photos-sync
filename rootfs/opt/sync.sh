#!/bin/bash

icloudpd -d $ALL_PHOTOS_DIR
    -u $USERNAME \
    -p $PASSWORD \
    --cookie-directory $COOKIE_DIR \
    --auto-delete \
    --set-exif-datetime \
    --log-level $LOG_LEVEL \

python /opt/folder-sync.py