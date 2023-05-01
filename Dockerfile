# XXX: Before updating this, make sure the issues around `npm` silently exiting
# with error 243 issues are solved:
#  - https://github.com/npm/cli/issues/4996
#  - https://github.com/npm/cli/issues/4769
FROM node:18.16.0-buster-slim

# Pass through some GitHub CI variables which we use in the build (for version
# files/tags)
ARG GITHUB_SHA
ENV GITHUB_SHA=$GITHUB_SHA
ARG GITHUB_REF
ENV GITHUB_REF=$GITHUB_REF

RUN mkdir -p /app

WORKDIR /app

# Copy the health-check script
COPY docker-health-check.js /app/

# Copy just what we need to install the dependencies so this layer can be cached
# in the Docker build
COPY package.json package-lock.json /app/
RUN npm install

# Copy what we need for the client-side build
COPY config /app/config/
COPY build-scripts /app/build-scripts/
COPY client /app/client/
COPY shared /app/shared/
# Also copy the server stuff (we reference the config from the `build-client.js`)
COPY server /app/server/
# Build the client-side bundle
RUN npm run build

HEALTHCHECK CMD node docker-health-check.js

ENTRYPOINT ["/bin/bash", "-c", "npm start"]
