# XXX: Before updating this, make sure the issues around `npm` silently exiting
# with error 243 issues are solved:
#  - https://github.com/npm/cli/issues/4996
#  - https://github.com/npm/cli/issues/4769
FROM node:16.14.2-buster-slim

# Pass through some GitHub CI variables which we use in the build
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
COPY build /app/build/
COPY public /app/public/
COPY shared /app/shared/
# Build the client-side bundle
RUN npm run build

# Copy the rest of the app
COPY server /app/server/

HEALTHCHECK CMD node docker-health-check.js

ENTRYPOINT ["/bin/bash", "-c", "npm start"]
