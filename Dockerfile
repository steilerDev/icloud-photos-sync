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
    ln -s /root/enter_mfa.sh /usr/local/bin/enter_mfa && \
    chmod +x /root/resend_mfa.sh && \
    ln -s /root/resend_mfa.sh /usr/local/bin/resend_mfa && \
    chmod +x /opt/icloud-photos-sync/bin/main.js && \
    ln -s /opt/icloud-photos-sync/bin/main.js /usr/local/bin/icloud-photos-sync

ENTRYPOINT ["node", "/opt/icloud-photos-sync/bin/main.js"]