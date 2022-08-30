#!/bin/bash
MFA_PORT="${PORT:-80}"
HOST="${3:-localhost}"
PHONE_NUMBER_ID="${2:-1}"

echo "Resending MFA code with method $1 and phoneNumberId $PHONE_NUMBER_ID to ${HOST}:${MFA_PORT}"
curl -s -X POST "${HOST}:${MFA_PORT}/resend_mfa?method=${1}&phoneNumberId=${PHONE_NUMBER_ID}"