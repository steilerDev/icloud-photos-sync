FROM node:22.14.0-alpine

# Setting node environment to not show experimental warnings
ENV NODE_NO_WARNINGS=1

# Setting volume for default library path
VOLUME /opt/icloud-photos-library

RUN apk update && \
    apk add curl bash jq && \
    rm -rf /var/cache/apk/*

# Applying fs patch for assets
ADD rootfs.tar.gz /

# Installing helper scripts
RUN chmod 755 /root/enter_mfa.sh && \
    ln -s /root/enter_mfa.sh /usr/local/bin/enter_mfa && \
    chmod 755 /root/resend_mfa.sh && \
    ln -s /root/resend_mfa.sh /usr/local/bin/resend_mfa

# Installing application binary
RUN npm install -g /opt/npm-pack.tgz

ENTRYPOINT ["icloud-photos-sync"]
CMD ["daemon"]