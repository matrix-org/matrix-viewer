# A dockerfile which builds an image suitable for creating test Synapse
# instances which federate with each other.
#
# Currently this is based on Complement Synapse images which are based on the
# published 'synapse:latest' image -- ie, the most recent Synapse release.

# FIXME: We're pinning the version to `v1.79.0` until
# https://github.com/matrix-org/synapse/issues/15526 is fixed. Feel free to update back
# to `latest` once that issue is resolved. More context:
# https://github.com/matrix-org/matrix-public-archive/pull/208#discussion_r1183294630
ARG SYNAPSE_VERSION=v1.79.0

FROM matrixdotorg/synapse:${SYNAPSE_VERSION}

ENV SERVER_NAME=localhost

COPY synapse/* /conf/
COPY keys/* /ca/

# SSL key for the server (can't make the cert until we know the server name)
RUN openssl genrsa -out /conf/server.tls.key 2048

# generate a signing key
RUN generate_signing_key -o /conf/server.signing.key

WORKDIR /data

EXPOSE 8008 8448

# Make sure the entrypoint is executable
RUN ["chmod", "+x", "/conf/start.sh"]
ENTRYPOINT ["/conf/start.sh"]

HEALTHCHECK --start-period=5s --interval=1s --timeout=1s \
  CMD curl -fSs http://localhost:8008/health || exit 1
