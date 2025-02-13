#!/bin/bash

# # Settings for mapping the ICPS directory into the container
# SCRIPT_DIR=$( cd -- "$( dirname -- "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )
# SRC_DIR=$(dirname $SCRIPT_DIR)
# ICPS_DOCKER_DIR="/icloud-photos-sync"
# ICPS_RESEND_MFA_SCRIPT="resend_mfa"
# ICPS_ENTER_MFA_SCRIPT="enter_mfa"

PROJECT_DIR="$(pwd)"
TMP_DIR="$(mktemp -d)"

ACTION_RUNNER_DIR="/opt/action-runner/"
ACTION_RUNNER_SERVICE=""
ACTION_RUNNER_ENVIRONMENT="$ACTION_RUNNER_DIR/.env"

source $ACTION_RUNNER_ENVIRONMENT

# Settings for requesting the MFA Code
ICPS_PORT=8080
MFA_METHOD="sms"
MFA_ID="2"

case $(git rev-parse --abbrev-ref HEAD) in
  dev)
    IMAGE_TAG="nightly"
    ;;

  beta)
    IMAGE_TAG="beta"
    ;;

  *)
    IMAGE_TAG="latest"
    ;;
esac

DOCKER_NAME=$(docker run -d \
  -e APPLE_ID_USER="$TEST_APPLE_ID_USER" \
  -e APPLE_ID_PWD="$TEST_APPLE_ID_PWD" \
  -v $TMP_DIR:/icloud-photos-library \
  steilerdev/icloud-photos-sync:$IMAGE_TAG
  token
)

echo -n "Waiting for MFA server to become available on localhost, port $ICPS_PORT"

until nc -z localhost ${ICPS_PORT}; do
    echo -n '.'
    sleep 5
done
echo "server available"

# Resend MFA code via SMS
docker exec $DOCKER_NAME $ICPS_RESEND_MFA_SCRIPT $MFA_METHOD $MFA_ID

echo "Please enter MFA code"
read MFA_CODE

# Send MFA code
docker exec $DOCKER_NAME $ICPS_ENTER_MFA_SCRIPT $MFA_CODE

NEW_TRUST_TOKEN="$(cat $TMP_DIR/.icloud_photos_sync | jq -r '.trust_token')"

> $ACTION_RUNNER_ENVIRONMENT
echo "TEST_APPLE_ID_USER=$TEST_APPLE_ID_USER" >> $ACTION_RUNNER_ENVIRONMENT
echo "TEST_APPLE_ID_PWD=$TEST_APPLE_ID_PWD" >> $ACTION_RUNNER_ENVIRONMENT
echo "TEST_TRUST_TOKEN=$NEW_TRUST_TOKEN" >> $ACTION_RUNNER_ENVIRONMENT

sudo systemctl restart $ACTION_RUNNER_SERVICE

rm -r $TMP_DIR