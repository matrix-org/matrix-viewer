'use strict';

// This is just a callable from the commandline version of
// `build-client-scripts.js`. So that we can run the build from an npm script.
// This used to just be `vite build` but changed since we wanted to support
// mulitple entrypoints.

// We can remove this once Vite supports multiple entrypoints and
// https://github.com/vitejs/vite/pull/7047 lands. We can migrate back to a
// normal `vite.config.js` and what we had before. Also see
// `build/build-client-scripts.js`.
//
// Related issues:
//  - https://github.com/vitejs/vite/issues/4530
//  - https://github.com/vitejs/vite/discussions/1736

const buildClientScripts = require('../build/build-client-scripts');

buildClientScripts();
