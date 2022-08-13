#!/bin/bash
MFA_PORT="${PORT:-80}"
HOST="${2:-localhost}"
echo "Posting MFA code $1 to ${HOST}:${MFA_PORT}"
curl -s -X POST ${HOST}:${MFA_PORT}/mfa?code=$1