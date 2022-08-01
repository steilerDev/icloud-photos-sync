FROM node:18.6-bullseye

# Applying fs patch for assets
ADD rootfs.tar.gz /

RUN apt-get update \
 && apt-get install \
        --no-install-recommends \
        --fix-missing \
        --assume-yes \
            apt-utils vim curl \
        && rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*

RUN chmod +x /root/enter_mfa.sh && \
    chmod +x /opt/icloud-photos-sync/bin/main.js

ENTRYPOINT ["node", "/opt/icloud-photos-sync/bin/main.js"]