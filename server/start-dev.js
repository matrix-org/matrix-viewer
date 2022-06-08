'use strict';

console.log('start-dev process.env.NODE_ENV', process.env.NODE_ENV);

const path = require('path');
const nodemon = require('nodemon');
const { build } = require('vite');
const mergeOptions = require('merge-options');

const viteConfig = require('../vite.config');

// Build the client-side JavaScript bundle when we see any changes
build(
  mergeOptions(viteConfig, {
    build: {
      // Rebuild when we see changes
      watch: true,
    },
  })
);

// Listen for any changes to files and restart the Node.js server process
//
// For API docs, see
// https://github.com/remy/nodemon/blob/main/doc/requireable.md
nodemon({
  script: path.join(__dirname, './server.js'),
  ext: 'js json',
  ignoreRoot: ['.git'],
  ignore: [path.join(__dirname, '../dist/*')],
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
