#!/usr/bin/env python

import os
import sys
import logging
from lib import constants

from lib.authentication import authenticate, TwoStepAuthRequiredError
from lib.logger import setup_logger
from lib.path import get_photo_path, get_album_path

logger = setup_logger()
logger.disabled = False
if constants.log_level == "debug":
    logger.setLevel(logging.DEBUG)
elif constants.log_level == "info":
    logger.setLevel(logging.INFO)
elif constants.log_level == "error":
    logger.setLevel(logging.ERROR)

try:
    icloud = authenticate(
            constants.username,
            constants.password,
            client_id=constants.client_id,
            cookie_directory=constants.cookie_dir
        )
except TwoStepAuthRequiredError:
    print("TwoFactor Expire") # only after 'raise_2sa_error' in authenticate

logger.info("Purging old directory tree...")

logger.info("Getting all albums...")
albums = icloud.photos.albums
del albums["All Photos"]
del albums["Recently Deleted"]

logger.info("Creating directory tree and linking files...")

for albumName, album in albums.items():
    album_path = get_album_path(album)
    logger.debug("Creating album path " + album_path)

    os.makedirs(album_path, exist_ok=True)
    for photo in album:
        src_path = get_photo_path(photo)
        dest_path = os.path.join(album_path, photo.filename)
        logger.debug("Linking " + src_path + " to " + dest_path)
        try:
            relative_src_path = os.path.relpath(src_path, album_path)
            logger.debut("Using relative path " + relative_src_path)
            os.symlink(relative_src_path, dest_path)
        except FileExistsError:
            logger.warn("File " + dest_path + " already exists, ignoring...")