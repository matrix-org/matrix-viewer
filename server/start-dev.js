'use strict';

console.log('start-dev process.env.NODE_ENV', process.env.NODE_ENV);

const path = require('path');
// eslint-disable-next-line n/no-unpublished-require
const nodemon = require('nodemon');

const buildClient = require('../build-scripts/build-client');

// Build the client-side JavaScript bundle when we see any changes
buildClient({
  build: {
    // Rebuild when we see changes
    // https://rollupjs.org/guide/en/#watch-options
    watch: {
      exclude: ['server/**/*'],
    },
  },
});

const nodeArgs = [];
if (process.argv.inspectNode) {
  nodeArgs.push('--inspect');
}
if (process.argv.traceWarningsNode) {
  nodeArgs.push('--trace-warnings');
}

// Pass through some args
const args = [];
if (process.argv.tracing) {
  args.push('--tracing');
}

if (process.argv.logOutputFromChildProcesses) {
  args.push('--logOutputFromChildProcesses');
}

// Listen for any changes to files and restart the Node.js server process
//
// For API docs, see
// https://github.com/remy/nodemon/blob/main/doc/requireable.md
nodemon({
  script: path.join(__dirname, './server.js'),
  ext: 'js json',
  ignoreRoot: ['.git'],
  ignore: [
    // Ignore everything in `dist/` except changes to the `manifest.json` because we read it on the
    // server and we should always have an up to date copy.
    //
    // TODO: I don't think this actually works. When `manifest.json` updates, the server
    // should restart.
    path.join(__dirname, '../dist/**/!(manifest.json)'),
  ],
  args,
  nodeArgs,
});

nodemon
  .on('start', function () {
    console.log('App has started');
  })
  .on('quit', function () {
    console.log('App has quit');
    process.exit();
  })
  .on('restart', function (files) {
    console.log('App restarted due to: ', files);
  })
  .on('crash', function () {
    console.log('Nodemon: script crashed for some reason');
  })
  // .on('watching', (file) => {
  //   console.log('watching');
  // })
  .on('log', function (data) {
    console.log(`Nodemon logs: ${data.type}: ${data.message}`);
  });
