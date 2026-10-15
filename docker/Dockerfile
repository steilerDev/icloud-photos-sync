# Using Docker Hardened Images (https://dhi.io/catalog/node) - pulling requires `docker login dhi.io` with a Docker Hub account
# The application is installed using the builder's npm and executed by the runtime's node - the version of both stages MUST match
FROM dhi.io/node:26.11.1-alpine3.24-dev AS builder

COPY npm-pack.tgz /opt/npm-pack.tgz

# Installing application binary and production dependencies into /usr/local, which is otherwise empty
RUN npm install -g --prefix /usr/local --omit=dev /opt/npm-pack.tgz

# Preparing the default library path, since the runtime stage has no shell
RUN mkdir -p /opt/icloud-photos-library

FROM dhi.io/node:26.11.1-alpine3.24 AS runtime

LABEL org.opencontainers.image.title="icloud-photos-sync" \
      org.opencontainers.image.description="One-way sync engine for the iCloud Photos Library into the native file system with archiving capabilities" \
      org.opencontainers.image.source="https://github.com/steilerDev/icloud-photos-sync" \
      org.opencontainers.image.url="https://icps.steiler.dev/" \
      org.opencontainers.image.licenses="GPL-3.0-or-later"

# Copying the application package and its bin link
COPY --from=builder /usr/local /usr/local

# Keeping the UID/GID of the previously used `icps` user, so existing volumes stay writable
COPY --from=builder --chown=100:101 /opt/icloud-photos-library /opt/icloud-photos-library

# Setting volume for default library path - after the directory was prepared, since changes to a volume path after its declaration might be discarded
VOLUME /opt/icloud-photos-library

USER 100:101

# Exposing default port for WebUI
EXPOSE 80

ENTRYPOINT ["icloud-photos-sync"]
CMD ["daemon"]
