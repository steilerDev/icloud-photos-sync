# Advanced Data Protection

The following requirements need to be met in order to enable Advanced Data Protection for your iCloud account, while being able to use this tool:

 - [Fulfill ADP requirements](https://support.apple.com/en-gb/HT212520#:~:text=known%20to%20Apple.-,Requirements,-To%20turn%20on)
   - Enable MFA
   - Create Backup Method (security key or recovery contact)
 - [Enable ADP](https://support.apple.com/en-gb/HT212520#:~:text=Advanced%20Data%20Protection.-,How%20to%20turn%20on%20Advanced%20Data%20Protection%20for%20iCloud,-You%20can%20turn)
 - [Turn on Web Access for iCloud Data](https://support.apple.com/en-gb/HT212520#:~:text=Web%20access%20to%20your%20data%20at%20iCloud.com)

The tool will send an authorization request to the trusted devices of the user before being able to access the iCloud data. Until the request is approved, the tool retries every 10 seconds and prints:

```
Advanced Data Protection request not confirmed yet, retrying...
```

The request might also be confirmed on its own after one or two retries. If the setup does not complete within the [MFA timeout](cli.md#mfa-timeout) plus five minutes (15 minutes by default), it times out and the execution fails.

The download URLs, which are part of the fetched metadata, expire after roughly 15 minutes. They are refreshed without setting up the account again, therefore no further approval is necessary. Only if the sync is [retried](common-warnings.md#detected-error-during-sync) (e.g. because the session expired after 8 hours), the account is set up again, which might require another approval.