#!/bin/bash

# This helper script initiates the trust token acquisition by triggering the necessary workflow and opening a tunnel through wireguard
WORKFLOW_NAME='action_trust-token.yml --ref dev' 

# Settings for mapping the ICPS directory into the container
SCRIPT_DIR=$( cd -- "$( dirname -- "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )
SRC_DIR=$(dirname $SCRIPT_DIR)
ICPS_DOCKER_DIR="/icloud-photos-sync"
ICPS_DOCKER_SCRIPT_DIR="$ICPS_DOCKER_DIR/docker/rootfs/root/"
ICPS_RESEND_MFA_SCRIPT="$ICPS_DOCKER_SCRIPT_DIR/resend_mfa.sh"
ICPS_ENTER_MFA_SCRIPT="$ICPS_DOCKER_SCRIPT_DIR/enter_mfa.sh"

# Settings for requesting the MFA Code
ICPS_PORT=8080
MFA_METHOD="sms"
MFA_ID="2"

if ! which gh > /dev/null; then
    echo "Please make sure the GH cli is installed"
fi

function stop_container() {
    if [ ! -z $DOCKER_NAME ]; then
        echo
        echo -n "Stopping container $DOCKER_NAME..."
        docker stop $DOCKER_NAME > /dev/null
        docker rm -v $DOCKER_NAME > /dev/null
        echo "done"
    else
        echo "Not stopping container, because name is not available"
    fi
}
trap stop_container exit

# Start Wireguard Tunnel
echo -n "Starting wireguard tunnel"
WG_SERVER_PORT=56789
WG_SUBNET="192.168.1.0"
DOCKER_NAME=$(docker run -d \
  --cap-add=NET_ADMIN \
  --cap-add=SYS_MODULE \
  --sysctl="net.ipv4.conf.all.src_valid_mark=1" \
  -e SERVERPORT=$WG_SERVER_PORT \
  -e PEERS=1 \
  -e INTERNAL_SUBNET=$WG_SUBNET \
  -p $WG_SERVER_PORT:51820/udp \
  -v $SRC_DIR:$ICPS_DOCKER_DIR \
  -e PORT=$ICPS_PORT \
  linuxserver/wireguard
)

SERVER_CONF="docker exec $DOCKER_NAME cat /config/wg0.conf"
CLIENT_CONF="docker exec $DOCKER_NAME cat /config/peer1/peer1.conf"
until $CLIENT_CONF > /dev/null 2>&1 && $SERVER_CONF > /dev/null 2>&1; do
    echo -n '.'
    sleep 5
done
echo

echo "Started wireguard tunnel (container name: $DOCKER_NAME) - listening on port $WG_SERVER_PORT"

# Start workflow
echo "Starting GH workflow $WORKFLOW_NAME"
gh workflow run $WORKFLOW_NAME \
    -f "wg-endpoint=$($CLIENT_CONF | grep -oP '^Endpoint = \K.*$')" \
    -f "wg-peer-public-key=$($CLIENT_CONF | grep -oP '^PublicKey = \K.*$')" \
    -f "wg-local-address=$($CLIENT_CONF | grep -oP '^Address = \K.*$')" \
    -f "wg-remote-address=$($SERVER_CONF | grep -oP '^Address = \K.*$')" \
    -f "wg-allowed-ips=$($SERVER_CONF | grep -oP '^Address = \K.*$')" \
    -f "wg-private-key=$($CLIENT_CONF | grep -oP '^PrivateKey = \K.*$')" \
    -f "wg-preshared-key=$($CLIENT_CONF | grep -oP '^PresharedKey = \K.*$')"

WG_IP="$($CLIENT_CONF | grep -oP '^Address = \K.*$')"
echo -n "Waiting for MFA server to become available on host $WG_IP:$ICPS_PORT"

until docker exec $DOCKER_NAME nc -z ${WG_IP} ${ICPS_PORT}; do
    echo -n '.'
    sleep 5
done
echo "server available"

# Resend MFA code via SMS
docker exec $DOCKER_NAME $ICPS_RESEND_MFA_SCRIPT $MFA_METHOD $MFA_ID $WG_IP

echo "Please enter MFA code"
read MFA_CODE

# Send MFA code
docker exec $DOCKER_NAME $ICPS_ENTER_MFA_SCRIPT $MFA_CODE $WG_IP

sleep 5
echo "GH Secret should be updated:"
gh secret list | grep --color=never TEST_TRUST_TOKEN
