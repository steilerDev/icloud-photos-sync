This folder is meant for development purposes and contains environment files containing secrets.

The following files are expected, in order to test and develop this application:
 - `test.env` - containing credentials for executing API and E2E tests
 - `adp.env` - (*optional*) containing credentials for executing API and E2E tests against and ADP account.
 - `prod.env` - (*optional*) containing credentials for a production account used for development purposes.

These environment files are read by VSCode tasks, as well as the devcontainer setup.
