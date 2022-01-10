#!/bin/bash

# Setup stuff

export LOG_LEVEL="info"
export COOKIE_DIR="/icloud-cookie"
export DATA_DIR="/icloud-photos"
export ALL_PHOTOS_DIR="$DATA_DIR/All Photos"

#echo "Setting up cron-job..."
#> /etc/crontabs/root
#echo "# min   hour    day     month   weekday command" >> /etc/crontabs/root
#echo "$CRON_SCHEDULE /opt/sync.sh > /proc/1/fd/1 2>/proc/1/fd/2" >> /etc/crontabs/root
#echo "...done"

#echo "Starting scheduled backup process with cron schedule:"
#cat /etc/crontabs/root
#crond -fS

/opt/sync.sh