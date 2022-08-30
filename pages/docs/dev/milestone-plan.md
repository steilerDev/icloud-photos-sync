# Milestone Plan
As I'm currently actively developing this tool, I'm looking for any and all feedback! Especially since the iCloud API was reverse engineered using my personal account, there might be edge cases, that I have not considered yet (especially the non-standard file types returned by Apple are limited to the file types I am using)

The tool is not yet 'production ready', however I would like to ask the community to test the functionality and open issues, so we can get it there (please attach the `.icloud-photos-sync.log`, stored in the `DATA_DIR`).

1. :white_check_mark: iCloud Authentication 
2. :white_check_mark: State fetched from iCloud
   - :white_check_mark: Asset state ('All photos')
   - :white_check_mark: Album state (List of Albums)
3. :white_check_mark: Parsing fetched state
   - :white_check_mark: Parsing assets
   - :white_check_mark: Parsing albums
4. :white_check_mark: Loading local state
   - :white_check_mark: Asset state
   - :white_check_mark: Album state
5. :white_check_mark: Diffing local / remote state
6. :white_check_mark: Applying diff
   - :white_check_mark: Asset diff
   - :white_check_mark: Album diff
7. :white_check_mark: Writing diff to disk
   - :white_check_mark: Writing asset diff
   - :white_check_mark: Writing album diff
8. :x: Enable archiving
9. :white_check_mark: Improve MFA workflow (re-request code/send code through other means)
10. :x: Provide WebUI
    - :x: Archive folders through UI
    - :x: Explore all pictures through UI
11. :x: Figure out checksum algorithm to (properly) verify downloaded files