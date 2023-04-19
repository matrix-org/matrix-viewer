// vite.config.js
'use strict';

const path = require('path');
const { defineConfig, splitVendorChunkPlugin } = require('vite');

const getVersionTags = require('../server/lib/get-version-tags');

const { assetTag } = getVersionTags();

module.exports = defineConfig({
  // We have to specify this otherwise Vite will override NODE_ENV as
  // `production` when we start the server and watch build in our `start-dev.js`.
  mode: process.env.NODE_ENV || 'dev',

  plugins: [
    // Alternatively, we can manually configure chunks via
    // `build.rollupOptions.output.manualChunks`.
    // Docs: https://vitejs.dev/guide/build.html#chunking-strategy
    //
    // This didn't seem to work for me though, so I've done the manual config way.
    // splitVendorChunkPlugin(),
  ],

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
      'matrix-public-archive-shared': path.resolve(__dirname, '../shared'),
    },
  },
  build: {
    lib: {
      entry: [
        path.resolve(__dirname, '../client/js/entry-client-hydrogen.js'),
        path.resolve(__dirname, '../client/js/entry-client-room-directory.js'),
        path.resolve(__dirname, '../client/js/entry-client-room-alias-hash-redirect.js'),
      ],
      fileName: (format) => `[name].${assetTag}.${format}.js`,
      //fileName: '[name]',
      formats: [
        'es',
        //'cjs',
      ],
    },
    rollupOptions: {
      output: {
        manualChunks: {
          'hydrogen-view-sdk': ['hydrogen-view-sdk'],
        },
      },
    },

    // TODO: xxx
    sourcemap: true,

    // Creates `dist/ssr-manifest.json` which is a map from module IDs to client files
    // (which can have hashes and are normally hard to reference)
    //ssrManifest: true,

    // Generate `manifest.json` in outDir
    manifest: true,

    // Since we're build other things to `dist/`, we don't want it to get wiped out
    emptyOutDir: false,

    // Fix `Error: 'default' is not exported by ...` when importing CommonJS files, see
    // https://github.com/vitejs/vite/issues/2679 and docs:
    // https://vitejs.dev/guide/dep-pre-bundling.html#monorepos-and-linked-dependencies
    commonjsOptions: { include: [/shared/] },
  },
});
