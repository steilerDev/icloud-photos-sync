# A set of helper functions for the test scripts

DIR=$(mktemp -d)

METRICS_FILE="$DIR/.icloud-photos-sync.metrics"
LOG_FILE="$DIR/.icloud-photos-sync.log"
RESOURCE_FILE="$DIR/.icloud-photos-sync"

function assertChecksum {
    # Removing variable content
    rm -f $METRICS_FILE $LOG_FILE $RESOURCE_FILE
    CHECKSUM=$(cd $DIR && find -L . -type f -exec sha1sum -b '{}' \;| awk '{ print $1 }' | sort | sha1sum | awk '{ print $1 }')
    if [ "$CHECKSUM" = "$EXPECTED_CHECKSUM" ]; then
        echo " - PASS: Checksum test"
    else
        echo " - FAIL: Checksum mismatch: Expected $EXPECTED_CHECKSUM but got $CHECKSUM"
        exit 1
    fi
}

function assertMetric {
    if grep -Fq "$1" $METRICS_FILE; then
        echo " - PASS: $1"
    else
        echo " - FAIL: Expected '$1', but got:"
        cat $METRICS_FILE
        exit 1
    fi
}

function assertContainerRunning {
    if [ "$( docker container inspect -f '{{.State.Status}}' $1 )" = "running" ]; then
        echo " - PASS: Container $1 running"
    else
        echo " - FAIL: Container $1 not running: $( docker container inspect -f '{{.State.Status}}' $1 )"
        exit 1
    fi
}

function runSync {
    docker run -v "$DIR:/opt/icloud-photos-library" -u $(id -u ${USER}):$(id -g ${USER}) $IMAGE_NAME \
        -u "$TEST_APPLE_ID_USER" \
        -p "$TEST_APPLE_ID_PWD" \
        -T "$TEST_TRUST_TOKEN" \
        --export-metrics \
        sync > /dev/null 2>&1
}

function waitTillFullMinute {
    echo "< Waiting until the next full minute >"
    sleep $((60 - $(date +%s) % 60))
}