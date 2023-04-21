console.log('start-dev process.env.NODE_ENV', process.env.NODE_ENV);

const path = require('path');
const nodemon = require('nodemon');

const buildClient = require('../build-scripts/build-client');

// Build the client-side JavaScript bundle when we see any changes
buildClient({
  build: {
    // Rebuild when we see changes
    // https://rollupjs.org/guide/en/#watch-options
    watch: true,
  },
});

// Pass through some args
const args = [];
if (process.argv.includes('--tracing')) {
  args.push('--tracing');
}

// Listen for any changes to files and restart the Node.js server process
//
// For API docs, see
// https://github.com/remy/nodemon/blob/main/doc/requireable.md
nodemon({
  script: path.join(__dirname, './server.js'),
  ext: 'js json',
  ignoreRoot: ['.git'],
  ignore: [path.join(__dirname, '../dist/*')],
  args,
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
