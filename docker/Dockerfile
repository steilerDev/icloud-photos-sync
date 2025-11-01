FROM node:22.21.1-alpine3.22 AS builder

COPY npm-pack.tgz /opt/npm-pack.tgz

# Installing application binary and dependencies
RUN npm install -g /opt/npm-pack.tgz && \
    rm /opt/npm-pack.tgz

# Removing npm, corepack, yarn and other unnecessary node related files
# These would be transferred with the build artifacts, which is why we are removing them at this stage
RUN npm uninstall npm corepack -g \
  && rm -f /usr/local/bin/yarn /usr/local/bin/yarnpkg /usr/local/bin/docker-entrypoint.sh

FROM alpine:3.22.2 AS hardened-intermediate

# Setting volume for default library path
VOLUME /opt/icloud-photos-library

# Creating app user
RUN addgroup -S icps && adduser -s /sbin/nologin -S icps -G icps

# Making sure required volume inherits correct read/write
RUN mkdir -p /opt/icloud-photos-library && \
    chmod -R 777 /opt

# Remove unnecessary accounts, excluding current app user and root
# Remove interactive login shell for everybody
RUN sed -i -r "/^(icps|root|nobody)/!d" /etc/group \
  && sed -i -r "/^(icps|root|nobody)/!d" /etc/passwd \
  && sed -i -r 's#^(.*):[^:]*$#\1:/sbin/nologin#' /etc/passwd

# Remove unnecessary system packages (apk, caches, default shell)
RUN apk --purge del apk-tools \
  && rm -rf /sbin/apk /etc/apk /lib/apk /var/cache/apk
  # Keeping /bin/sh around while waiting for BT library mitigation - https://github.com/backtrace-labs/backtrace-javascript/pull/357
  # && rm /bin/sh

# We only need binaries from here
ENV PATH=/usr/local/bin

FROM hardened-intermediate AS runtime

# Change to new user
USER icps

# Copying node & application artifacts
COPY --from=builder /usr/lib /usr/lib
COPY --from=builder /usr/local /usr/local

# Exposing default port for WebUI
EXPOSE 80

ENTRYPOINT ["icloud-photos-sync"]
CMD ["daemon"]