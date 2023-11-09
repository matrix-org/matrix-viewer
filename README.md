# Matrix Viewer

<a href="https://matrix.to/#/#matrix-viewer:matrix.org"><img src="https://img.shields.io/matrix/matrix-viewer:matrix.org.svg?label=%23matrix-viewer%3Amatrix.org&logo=matrix&server_fqdn=matrix.org" alt="Join the community and get support at #matrix-viewer:matrix.org" /></a>

> **Note**
> The Matrix Public Archive has been renamed to Matrix Viewer to better reflect what it
> actually does and doesn't do. It's a viewer for world-readable Matrix rooms and
> doesn't actually archive anything.

In the vein of [feature parity with
Gitter](https://github.com/vector-im/roadmap/issues/26), the goal is to make an
accessible public site for `world_readable` Matrix rooms like Gitter's archives
which search engines can index and keep all of the content accessible/available.

<!-- prettier-ignore -->
Room directory homepage | Room view
--- | ---
<img alt="A reference for how the Matrix Viewer homepage looks. Search bar where you can find thousands of rooms using Matrix and homeserver selector. Grid of room cards showing the results." src="https://user-images.githubusercontent.com/558581/236579462-fee0f9c0-29d2-4c3d-a695-c9eaf0f744ef.png" width="440"> | ![A reference for how the Matrix Viewer looks. Showing off a day of messages in `#gitter:matrix.org` on 2021-08-06. There is a date picker calendar in the right sidebar and a traditional chat app layout on the left.](https://user-images.githubusercontent.com/558581/234765275-28c70c49-c27f-473a-88ba-f4392ddae871.png)

## Demo videos

The demo's refer to this project as the "Matrix Public Archive" which has now been renamed to "Matrix Viewer".

- [![](https://user-images.githubusercontent.com/558581/206083768-d18456de-caa3-463f-a891-96eed8054686.png) May 2023](https://www.youtube.com/watch?v=4KlNILNItGQ&t=1046s): Introducing [archive.matrix.org](https://archive.matrix.org/), the shiny new public instance of the Matrix Public Archive that everyone can share and link to.
- [![](https://user-images.githubusercontent.com/558581/206083768-d18456de-caa3-463f-a891-96eed8054686.png) Aug 2022](https://www.youtube.com/watch?v=6KHQSeJTXm0&t=583s) ([blog post](https://matrix.org/blog/2022/08/05/this-week-in-matrix-2022-08-05#matrix-public-archive-website)): A quick intro of what the project looks like, the goals, what it accomplishes, and how it's a new portal into the Matrix ecosystem.
- [![](https://user-images.githubusercontent.com/558581/206083768-d18456de-caa3-463f-a891-96eed8054686.png) Oct 2022](https://www.youtube.com/watch?v=UT6KSEqDUf8&t=548s): Showing off the room directory landing page used to browse everything available in the archive.

## Technical overview

We server-side render (SSR) the [Hydrogen](https://github.com/vector-im/hydrogen-web)
Matrix client on a Node.js server (since both use JavaScript) and serve pages on the fly
(with some Cloudflare caching on top) when someone requests
`/r/matrixhq:matrix.org/${year}/${month}/${day}`. To fetch the events for a
given day/time, we use [MSC3030](https://github.com/matrix-org/matrix-doc/pull/3030)'s
`/timestamp_to_event` endpoint to jump to a given day in the timeline and fetch the
messages from a Matrix homeserver.

Re-using Hydrogen gets us pretty and native(to Element) looking styles and keeps
the maintenance burden of supporting more event types in Hydrogen.

## FAQ

See the [FAQ page](docs/faq.md).

## Setup

### Prerequisites

- [Node.js](https://nodejs.org/) v18
  - We need v18 because it includes `fetch` by default. And [`node-fetch` doesn't
    support `abortSignal.reason`](https://github.com/node-fetch/node-fetch/issues/1462)
    yet.
  - We need v16 because it includes
    [`require('crypto').webcrypto.subtle`](https://nodejs.org/docs/latest-v16.x/api/webcrypto.html#cryptosubtle)
    for [Matrix encryption (olm) which can't be disabled in
    Hydrogen](https://github.com/vector-im/hydrogen-web/issues/579) yet. And
    [`abortSignal.reason` was introduced in
    v16.14.0](https://nodejs.org/dist/latest-v18.x/docs/api/globals.html#abortsignalreason) (although we use `node-fetch` for now).
- A Matrix homeserver that supports [MSC3030's](https://github.com/matrix-org/matrix-spec-proposals/pull/3030) `/timestamp_to_event` endpoint
  - [Synapse](https://matrix.org/docs/projects/server/synapse) 1.73.0+

### Get the app running

```sh
$ npm install
$ npm run build

# Edit `config/config.user-overrides.json` so that `matrixServerUrl` points to
# your homeserver and has `matrixAccessToken` defined
$ cp config/config.default.json config/config.user-overrides.json

$ npm run start
```

## Development

```sh
# Clone and install the `matrix-viewer` project
$ git clone git@github.com:matrix-org/matrix-viewer.git
$ cd matrix-viewer
$ npm install

# Edit `config/config.user-overrides.json` so that `matrixServerUrl` points to
# your homeserver and has `matrixAccessToken` defined
$ cp config/config.default.json config/config.user-overrides.json

# This will watch for changes, rebuild bundles and restart the server
$ npm run start-dev
```

If you want to make changes to the underlying Hydrogen SDK as well, you can locally link
it into this project with the following instructions:

```sh
# We need to use a draft branch of Hydrogen to get the custom changes needed for
# `matrix-viewer` to run. Hopefully soon, we can get all of the custom
# changes mainlined so this isn't necessary.
$ git clone git@github.com:vector-im/hydrogen-web.git
$ cd hydrogen-web
$ git checkout madlittlemods/matrix-public-archive-scratch-changes
$ yarn install
$ yarn build:sdk
$ cd target/ && npm link && cd ..
$ cd ..

$ cd matrix-viewer
$ npm link hydrogen-view-sdk
```

### Running tests

See the [testing documentation](./docs/testing.md).

### Tracing

See the [tracing documentation](./docs/tracing.md).
