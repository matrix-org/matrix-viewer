# Matrix public archive

**NB: This project is very much a work-in-progress (WIP)!** Undocumented
config/secrets, using a draft branch of Hydrogen, etc.

In the vein of [feature parity with
Gitter](https://github.com/vector-im/roadmap/issues/26), the goal is to make a
public archive site for `world_readable` Matrix rooms like Gitter's archives
which search engines can index and keep all of the content accessible/available.
There is already https://view.matrix.org/
(https://github.com/matrix-org/matrix-static) but there is some desire to make
something with more Element-feeling polish and loading faster (avoid the slow
502's errors that are frequent on `view.matrix.org`).

![](https://user-images.githubusercontent.com/558581/179578263-e224ed59-dbba-464e-8b34-89a72ee0ae71.png)

## Plan summary

The plan is to server-side render (SSR) the
[Hydrogen](https://github.com/vector-im/hydrogen-web) Matrix client on a Node.js
server (since both use JavaScript) and serve pages on the fly (probably with
some Cloudflare caching on top) when someone requests
`/archives/${year}/${month}/${day}`. To fetch the events for a given day/time,
we will use [MSC3030](https://github.com/matrix-org/matrix-doc/pull/3030)'s
`/timestamp_to_event` endpoint to jump to a given day in the timeline and fetch
the messages from a Matrix homeserver.

Re-using Hydrogen gets us pretty and native(to Element) looking styles and keeps
the maintenance burden of supporting more event types in Hydrogen.

## Setup

### Prerequisites

- Node.js v16
  - We only need v16 because it includes [`require('crypto').webcrypto.subtle`](https://nodejs.org/docs/latest-v16.x/api/webcrypto.html#cryptosubtle) for [Matrix encryption (olm) which can't be disabled in Hydrogen](https://github.com/vector-im/hydrogen-web/issues/579) yet.

### Get the app running

```sh
$ npm install

# Edit config/config.user-overrides.json so that `matrixServerUrl` points to your homeserver
# and has `matrixAccessToken` defined
$ cp config/config.default.json config/config.user-overrides.json

$ npm run start-dev
```

## Development

```sh
# We need to use a draft branch of Hydrogen to get the custom changes needed for
# `matrix-public-archive` to run. Hopefully soon, we can get all of the custom
# changes mainlined so this isn't necessary.
$ git clone git@github.com:vector-im/hydrogen-web.git
$ cd hydrogen-web
$ git checkout madlittlemods/matrix-public-archive-scratch-changes
$ yarn install
$ yarn build:sdk
$ cd target/ && npm link && cd ..
$ cd ..

# Now clone and install the `matrix-public-archive` project
$ git clone git@github.com:matrix-org/matrix-public-archive.git
$ cd matrix-public-archive
$ npm install
$ npm link hydrogen-view-sdk
# If you just want to run the tests, you can skip to the "Running tests" section at this point
#
# Edit config/config.user-overrides.json so that `matrixServerUrl` points to your homeserver
# and has `matrixAccessToken` defined
$ cp config/config.default.json config/config.user-overrides.json

# Now we can finally start the app
$ npm run start-dev
```

### Running tests

See the [testing readme](./test/README.md).
