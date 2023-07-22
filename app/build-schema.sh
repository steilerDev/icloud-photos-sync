#!/bin/sh

# This script is used to build the various json schema from ts files

CMD="npx ts-json-schema-generator -f tsconfig.json"
TARGET_FOLDER="src/lib/resource-manager/schemas"

$CMD --type ResourceFile --path src/lib/resource-manager/resources.ts > ${TARGET_FOLDER}/resource-file.json
$CMD --additional-properties true --type SigninResponse --path src/lib/resource-manager/network.ts > ${TARGET_FOLDER}/signin-response.json
$CMD --additional-properties true --type ResendMFADeviceResponse --path src/lib/resource-manager/network.ts > ${TARGET_FOLDER}/resend-mfa-device-response.json
$CMD --additional-properties true --type ResendMFAPhoneResponse --path src/lib/resource-manager/network.ts > ${TARGET_FOLDER}/resend-mfa-phone-response.json
$CMD --additional-properties true --type TrustResponse --path src/lib/resource-manager/network.ts > ${TARGET_FOLDER}/trust-response.json
$CMD --additional-properties true --type PhotosSetupResponse --path src/lib/resource-manager/network.ts > ${TARGET_FOLDER}/photos-setup-response.json