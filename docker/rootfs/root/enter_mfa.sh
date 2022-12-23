#!/bin/bash
if [ -z "$1" ]; then
    echo "No code provided"
    echo "Run this utility through:"
    echo "    $0 <6-digits-code> <host (optional, localhost as default)>"
    exit
fi

MFA_PORT="${PORT:-80}"
HOST="${2:-localhost}"
echo "Posting MFA code $1 to ${HOST}:${MFA_PORT}"
echo "..."
curl -s -X POST "${HOST}:${MFA_PORT}/mfa?code=$1" | jq -crM .message