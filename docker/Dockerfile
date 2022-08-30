FROM node:18.8.0-bullseye-slim

# Applying fs patch for assets
ADD rootfs.tar.gz /

RUN apt-get update \
 && apt-get install \
        --no-install-recommends \
        --fix-missing \
        --assume-yes \
            apt-utils vim curl \
        && rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*

# Installing icloud-photos-sync 
RUN cd /opt/icloud-photos-sync/ && \
    npm install && \
    npm link

# Installing helper scripts
RUN chmod 755 /root/enter_mfa.sh && \
    ln -s /root/enter_mfa.sh /usr/local/bin/enter_mfa && \
    chmod 755 /root/resend_mfa.sh && \
    ln -s /root/resend_mfa.sh /usr/local/bin/resend_mfa

ENTRYPOINT ["icloud-photos-sync"]
CMD ["sync"]