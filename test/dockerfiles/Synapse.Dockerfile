# A dockerfile which builds an image suitable for creating test Synapse
# instances which federate with each other.
#
# Currently this is based on Complement Synapse images which are based on the
# published 'synapse:latest' image -- ie, the most recent Synapse release.
ARG SYNAPSE_VERSION=latest

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
