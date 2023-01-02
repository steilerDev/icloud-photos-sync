#!/bin/bash
if [ -z "$1" ]; then
    echo "No resend method provided!"
    echo "Run this utility through:"
    echo "    $0 <method (sms|voice|device)> <phoneNumberId (optional, '1' as default> <host (optional, 'localhost' as default)>"
    exit
fi

MFA_PORT="${PORT:-80}"
PHONE_NUMBER_ID="${2:-1}"
HOST="${3:-localhost}"

echo "Resending MFA code with method $1 and phoneNumberId $PHONE_NUMBER_ID to ${HOST}:${MFA_PORT}"
echo "..."
curl -s -X POST "${HOST}:${MFA_PORT}/resend_mfa?method=${1}&phoneNumberId=${PHONE_NUMBER_ID}" | jq -crM .message