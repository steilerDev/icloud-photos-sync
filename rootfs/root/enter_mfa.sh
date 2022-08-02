#!/bin/bash
MFA_PORT="${PORT:-80}"
curl -X POST localhost:${MFA_PORT}/mfa?code=$1