"""Constants"""
import os

username = os.environ.get("USERNAME")
password = os.environ.get("PASSWORD")
client_id = os.getenv("CLIENT_ID", "py-icloudps")
log_level = os.environ.get("LOG_LEVEL")

cookie_dir = os.environ.get("COOKIE_DIR")
data_dir = os.environ.get("DATA_DIR")
all_photos_dir = os.environ.get("ALL_PHOTOS_DIR")

ignore_albums = os.environ.get("IGNORE_ALBUMS")