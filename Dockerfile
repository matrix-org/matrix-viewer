FROM node:16.15-buster-slim

RUN mkdir -p /app

WORKDIR /app

RUN npm install npm@^8 --location=global

# Copy just what we need to install the dependencies so this layer can be cached
# in the Docker build
COPY package.json package-lock.json /app/
RUN npm install

# Copy what we need for the client-side build
COPY public /app/public/
COPY shared /app/shared/
COPY vite.config.js /app/
# Build the client-side bundle
RUN npm run build

# Copy the rest of the app
COPY server /app/server/

ENTRYPOINT ["npm" "start"]
