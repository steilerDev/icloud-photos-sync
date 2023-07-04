# Motivation
In this article, I want to provide some background on the intention for developing this tool and the use case it is addressing, as well as the workflow it is used in.

## Problem Statement
Currently there is no way, to backup the iCloud Photos Library and easily access it's organized content. The only solution is Apple's *Photos.app*, which will create a `.photoslibrary` file, which is not easily accessible. Additionally, a Mac needs to run sufficiently often and have 'Keep originals' turned on, in order to make sure the data is actually synced.

I am a hobby photographer, who has been using Lightroom for quite a while. However I want to move to a full mobile workflow, leveraging iCloud Photos Library for cross device sync and the interoperability of cross platform editing tools.

However I am not comfortable storing the only copy of my pictures on a third party cloud provider. Therefore I need a mechanism to sync those files to a local machine that can be backed up using any mechanism.

Additionally, I am going to import pictures from my SLT camera, shot in raw format. Those will take up large amounts of cloud storage, however I do not want to fully remove them, in case they will be necessary in the future. Therefore I need a mechanism to move pictures from the iCloud Photos Library to my local system for 'long term storage', while keeping the most important ones in the iCloud Photos Library for easy access.

## Workflow
1. Pictures are taken on an iOS device or imported through an iOS device into the iCloud Photos Library
2. Pictures are sorted into a dedicated album for this event
3. Unwanted pictures are deleted, best pictures are edited (I'm currently using [Darkroom](https://darkroom.co/) for this)
4. Pictures are exported/released
5. Favorite pictures are marked as 'Favorites'
6. `icloud-photos-sync` tool is run to have all pictures downloaded (or is running constantly in the background)
7. Folder is marked as archived through `icloud-photos-sync`, which will persist them locally and remove non-favorite photos from the iCloud Photos Library