This folder is meant for development purposes and contains environment files containing secrets.

The following files are expected, in order to test and develop this application:
 - `test.env` - containing credentials for executing API and E2E tests
 - `adp.env` - (*optional*) containing credentials for an Advanced Data Protection (ADP) account, used for manual debugging only (not used by the API or E2E tests).
 - `prod.env` - (*optional*) containing credentials for a production account used for development purposes.
 - `backtrace.env` / `backtrace-dev.env` - (*optional*) containing Backtrace API tokens (capabilities `query:post` and `object:get`) for the production and development error reporting projects.

The `*.sample` files list the expected variables of each file. `test.env` is read by the VSCode launch configurations and the devcontainer setup, which won't start without it.
