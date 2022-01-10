import os
from lib.logger import setup_logger

def clean_dir_tree(root_dir):
    logger = setup_logger()
    logger.info("Cleaning directory tree..")
    logger.debug("Purging old symlinks...")
    for (root,dirs,files) in os.walk(root_dir, topdown=True):
        for file in files:
            full = os.path.join(root, file)
            if os.path.islink(full):
                logger.debug("Removing old symlink " + full)
                os.remove(full)

    logger.debug("Removing empty directories...")
    for (root,dirs,files) in os.walk(root_dir, topdown=False):
        if len(os.listdir(root)) == 0:
            logger.debug("Removing empty folder " + root)
            os.rmdir(root)