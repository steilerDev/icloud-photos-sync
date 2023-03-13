FROM node:18.15.0-alpine

# Applying fs patch for assets
ADD rootfs.tar.gz /

RUN apk update && \
    apk add curl vim bash jq && \
    rm -rf /var/cache/apk/*

# Installing icloud-photos-sync 
RUN cd /opt/icloud-photos-sync/ && \
    npm install --omit dev && \
    npm link

# Installing helper scripts
RUN chmod 755 /root/enter_mfa.sh && \
    ln -s /root/enter_mfa.sh /usr/local/bin/enter_mfa && \
    chmod 755 /root/resend_mfa.sh && \
    ln -s /root/resend_mfa.sh /usr/local/bin/resend_mfa

ENTRYPOINT ["icloud-photos-sync"]
CMD ["daemon"]