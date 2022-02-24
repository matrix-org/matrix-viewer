// vite.config.js
'use strict';

const path = require('path');
const { defineConfig } = require('vite');

module.exports = defineConfig({
  // We have to specify this otherwise Vite will override NODE_ENV as
  // `production` when we start the server and watch build in our `start-dev.js`.
  mode: process.env.NODE_ENV || 'dev',

  //root: './',
  //base: './',
  outDir: './dist',
  // optimizeDeps: {
  //   include: ['matrix-public-archive-shared'],
  // },
  resolve: {
    alias: {
      // The `file:` packages don't seem resolve correctly so let's add an alias as well
      // See https://css-tricks.com/adding-vite-to-your-existing-web-app/#aa-aliases
      'matrix-public-archive-shared': path.resolve(__dirname, './shared'),
    },
  },
  build: {
    // Fix `Error: 'default' is not exported by ...` when importin CommonJS files,
    // see https://github.com/vitejs/vite/issues/2679
    commonjsOptions: { include: [] },

    lib: {
      entry: path.resolve(__dirname, './public/js/entry-client.js'),
      //formats: ['cjs'],
      name: 'MatrixPublicArchive',
      fileName: (format) => `matrix-public-archive.${format}.js`,
    },
    rollupOptions: {},
  },
});
