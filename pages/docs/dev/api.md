# iCloud API

This is a high level documentation of the reverse engineered iCloud API, used in this application. 

## Postman Collection

In the debugging process, a [Postman Collection](https://github.com/steilerDev/icloud-photos-sync/tree/main/postman) has been created, in order to interact freely with the API.

In order to use it, `username` and `password` variables have to be set in the selected environment. Make sure that the Collection Variables are reset upon changing the environment. Also if you want to reset the current session, reset those variables and restart the authentication process

## Authentication process

This application is using the same authentication flow as icloud.com.

This research concluded in the following flow:

[![Flow](../assets/01_authentication-flow.jpeg)](https://miro.com/app/board/uXjVOxcisIM=/?share_link_id=646572552229)

To execute this flow in the provided [Postman Collection](https://github.com/steilerDev/icloud-photos-sync/tree/main/postman), follow these steps:

- Run `01-Enter Pwd` Request
- If the status code is `409` an MFA code is required, if code is `200` continue to 4.
  - To resend the MFA code to a trusted device, run `01-- Resend 2FA In-App` request
  - To resent the MFA code to a phone through a call or sms, run `01-- Resend 2FA Phone` (you may need to adjust the body of this request)
  - Use the `02-Enter 2FA` to provide a MFA code (by setting the `code` variable in the body), status code `204` expected
  - Run `03-Trust Device` Request, expecing 204
- Acquire iCloud Cookies through `04-Setup iCloud` request
- *optionally (and done by the application)* Check, that the Photos Library has finished indexing with `05-Check indexing State`
- Now use the `iCloud Photos Library` folder, to execute actions against the iCloud Photos library
