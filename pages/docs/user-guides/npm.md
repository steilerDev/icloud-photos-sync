# NPM User Guide

## Installation
### From npm

The application can be installed (globally) from [npm](https://www.npmjs.com/package/icloud-photos-sync) using:
```
npm install -g icloud-photos-sync
```

How to run the application and a full list of configuration options can be found in the [CLI Reference](https://steilerdev.github.io/icloud-photos-sync/user-guides/cli/)

### From source
To build the application from source, clone this repository, go to `app/` and run
```
npm install
npm run build
```

Execute the program with
```
npm run execute
```

Configuration options and commands can be supplied after `--`
```
npm run execute -- help
```
How to run the application and a full list of configuration options can be found in the [CLI Reference](https://steilerdev.github.io/icloud-photos-sync/user-guides/cli/)

## MFA
Once the MFA code is required, the tool will open up a webserver and listen on the specified port (Default: `80`).

### Enter MFA
Provide the MFA code by `POST`ing it to `/mfa` with parameter `code`. E.g. using `curl`:
```
curl -X POST localhost:80/mfa?code=<6-digit-code>
```

### Re-requesting MFA
Re-request the MFA code by `POST`ing to `/resend_mfa` with parameter `method` (either `sms`, `voice` or `device`). If you have registered multiple phone numbers, specify their id through the optional parameter `phoneNumberId` (integer > 0 expected). E.g. using `curl`:
```
curl -X POST localhost:80/resend_mfa?method=sms&phoneNumberId=1
```