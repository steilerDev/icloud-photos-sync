# Get the right path for a given photos object
import time
import datetime
import os
from tzlocal import get_localzone

from lib import constants

def get_album_path(album):
    if not album.lineage:
        return os.path.normpath(constants.data_dir + "/" + album.title)
    else:
        return os.path.normpath(constants.data_dir + "/" + "/".join(album.lineage) + "/" + album.title)

def get_photo_path(photo):
    try:
        created_date = photo.created.astimezone(get_localzone())
    except (ValueError, OSError):
        logger.set_tqdm_description(
            "Could not convert photo created date to local timezone (%s)" %
            photo.created, logging.ERROR)
        created_date = photo.created
    
    try:
        date_path = "{:%Y/%m/%d}".format(created_date)
    except ValueError:  # pragma: no cover
        # This error only seems to happen in Python 2
        logger.set_tqdm_description(
            "Photo created date was not valid (%s)" %
            photo.created, logging.ERROR)
        # e.g. ValueError: year=5 is before 1900
        # (https://github.com/icloud-photos-downloader/icloud_photos_downloader/issues/122)
        # Just use the Unix epoch
        created_date = datetime.datetime.fromtimestamp(0)
        date_path = folder_structure.format(created_date)

    return os.path.normpath(os.path.join(constants.all_photos_dir, date_path, photo.filename))