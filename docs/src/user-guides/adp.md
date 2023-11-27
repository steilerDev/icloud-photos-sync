# Advanced Data Protection

The following requirements need to be met in order to enable Advanced Data Protection for your iCloud account, while being able to use this tool:

 - [Fulfill ADP requirements](https://support.apple.com/en-gb/HT212520#:~:text=known%20to%20Apple.-,Requirements,-To%20turn%20on)
   - Enable MFA
   - Create Backup Method (security key or recovery contact)
 - [Enable ADP](https://support.apple.com/en-gb/HT212520#:~:text=Advanced%20Data%20Protection.-,How%20to%20turn%20on%20Advanced%20Data%20Protection%20for%20iCloud,-You%20can%20turn)
 - [Turn on Web Access for iCloud Data](https://support.apple.com/en-gb/HT212520#:~:text=Web%20access%20to%20your%20data%20at%20iCloud.com)

The tool will send an authorization request to the trusted devices of the user before being able to access the iCloud data. If this does not happen within five minutes, the setup will timeout and the execution will fail. Currently metadata needs to be updated every 60 minutes, which will lead to a re-authentication and therefore the requirement to manually re-authorize of the data access.