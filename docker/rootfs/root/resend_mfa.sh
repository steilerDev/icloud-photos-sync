#!/bin/bash

echo "DEPRECATION WARNING: This helper tool will be removed in the next major version, please use the WebUI or directly interact with the API" >&2

if [ -z "$1" ]; then
    echo "No resend method provided!"
    echo "Run this utility through:"
    echo "    $0 <method (sms|voice|device)> <phoneNumberId (optional, '1' as default> <host (optional, 'localhost' as default)>"
    echo "The script will read the server's port through the environmental variable \$PORT, or use 80 if the variable is not set." 
    exit
fi

MFA_PORT="${PORT:-80}"
PHONE_NUMBER_ID="${2:-1}"
HOST="${3:-localhost}"

echo "Resending MFA code with method $1 and phoneNumberId $PHONE_NUMBER_ID to ${HOST}:${MFA_PORT}"
echo "..."
curl -s -X POST "${HOST}:${MFA_PORT}/api/resend_mfa?method=${1}&phoneNumberId=${PHONE_NUMBER_ID}" | jq -crM .message