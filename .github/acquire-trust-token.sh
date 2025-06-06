#!/bin/bash

TMP_DIR="$(mktemp -d)"

ACTION_RUNNER_DIR="/opt/actions-runner"
ACTION_RUNNER_SERVICE="actions.runner.steilerDev-icloud-photos-sync.steilerGroup-HomeServer.service"
ACTION_RUNNER_ENVIRONMENT="$ACTION_RUNNER_DIR/.env"

# Getting current user/password
source $ACTION_RUNNER_ENVIRONMENT

# Settings for requesting the MFA Code (this is account specific)
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

DOCKER_IMAGE="steilerdev/icloud-photos-sync:$IMAGE_TAG"

echo -n "Starting $DOCKER_IMAGE..."

DOCKER_NAME=$(docker run -d \
  -e APPLE_ID_USER="$TEST_APPLE_ID_USER" \
  -e APPLE_ID_PWD="$TEST_APPLE_ID_PWD" \
  -v $TMP_DIR:/opt/icloud-photos-library \
  $DOCKER_IMAGE \
  token
)
echo "container $DOCKER_NAME is running!"

echo -n "Waiting for MFA server to become available.."

until docker logs $DOCKER_NAME | grep -q "MFA code required"; do
    echo -n '.'
    sleep 1
    if docker logs $DOCKER_NAME | grep -q "Error"; then
        echo "Error in container:"
        docker logs $DOCKER_NAME
        docker stop $DOCKER_NAME
        rm -rf $TMP_DIR
        exit 1
    fi
done
echo "server available"

echo "Requesting code..."
# Resend MFA code via SMS
docker exec $DOCKER_NAME resend_mfa $MFA_METHOD $MFA_ID > /dev/null

echo "Please enter MFA code:"
read MFA_CODE

# Send MFA code
docker exec $DOCKER_NAME enter_mfa $MFA_CODE > /dev/null

echo "Waiting for container to exit..."
docker wait $DOCKER_NAME

NEW_TRUST_TOKEN="$(cat $TMP_DIR/.icloud-photos-sync | jq -r '.trustToken')"

> $ACTION_RUNNER_ENVIRONMENT
echo "TEST_APPLE_ID_USER=$TEST_APPLE_ID_USER" >> $ACTION_RUNNER_ENVIRONMENT
echo "TEST_APPLE_ID_PWD=$TEST_APPLE_ID_PWD" >> $ACTION_RUNNER_ENVIRONMENT
echo "TEST_TRUST_TOKEN=$NEW_TRUST_TOKEN" >> $ACTION_RUNNER_ENVIRONMENT

echo -n "Update variables, restarting action runner..."
sudo systemctl restart $ACTION_RUNNER_SERVICE

echo "done, cleaning up!"
rm -rf $TMP_DIR
