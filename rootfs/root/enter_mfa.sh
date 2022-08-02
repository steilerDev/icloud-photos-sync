#!/bin/bash
MFA_PORT="${PORT:-80}"
echo "Posting MFA code $1 to ${MFA_PORT}"
curl -s -X POST localhost:${MFA_PORT}/mfa?code=$1