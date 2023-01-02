# Security of your Apple ID credentials

Since this application needs to communicate with the Apple iCloud backend, full access to your AppleID needs to be provided. By providing full access to the source code of this application, I hope to gain your trust, that I am not able to read or access your credentials or tokens!

This application will never log any credentials (except when log level is set to `trace`, so be careful when doing this!). Credentials are only sent directly to Apple's authentication servers - third party services are NOT involved.

In order to improve this application's development, this tool can report crash and error data to the developer. This capability requires opt-in and is the only non-Apple service this application will communicate with. Scrubbing of credentials and sensitive data is performed before any errors are persisted. More information about this topic can be found [here](../error-reporting/).
