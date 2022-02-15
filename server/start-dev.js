'use strict';
const path = require('path');
const nodemon = require('nodemon');
const { build } = require('vite');
const mergeOptions = require('merge-options');

const viteConfig = require('../vite.config');

// See https://github.com/remy/nodemon/blob/main/doc/requireable.md
nodemon({
  script: path.join(__dirname, './server.js'),
  ext: 'js json',
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
  });

// Build the client-side bundle
build(
  mergeOptions(viteConfig, {
    build: {
      watch: true,
    },
  })
);
