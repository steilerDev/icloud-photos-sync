#!/bin/bash

# Setup stuff

export LOG_LEVEL="debug"
export COOKIE_DIR="/icloud-cookie"
export DATA_DIR="/icloud-photos"
export ALL_PHOTOS_DIR="$DATA_DIR/All Photos"

#./sync.sh
python folder-sync.py