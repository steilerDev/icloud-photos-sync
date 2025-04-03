FROM node:22.14.0-alpine

RUN apk update && \
    apk add curl bash jq && \
    rm -rf /var/cache/apk/*

# Applying fs patch for assets
ADD rootfs.tar.gz /

# Installing helper scripts
RUN chmod 755 /root/enter_mfa.sh && \
    ln -s /root/enter_mfa.sh /usr/local/bin/enter_mfa && \
    chmod 755 /root/resend_mfa.sh && \
    ln -s /root/resend_mfa.sh /usr/local/bin/resend_mfa && \
    chmod 777 /opt

# Installing application binary
RUN npm install -g /opt/npm-pack.tgz && \
    rm /opt/npm-pack.tgz

RUN addgroup -S icps && adduser -S icps -G icps
USER icps

# Setting volume for default library path
VOLUME /opt/icloud-photos-library

ENTRYPOINT ["icloud-photos-sync"]
CMD ["daemon"]