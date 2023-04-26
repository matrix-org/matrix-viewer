// vite.config.js
'use strict';

const path = require('path');
const {
  defineConfig, //splitVendorChunkPlugin
} = require('vite');

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

  optimizeDeps: {
    include: [
      // This doesn't seem to be necessary for the this package to work (ref
      // https://vitejs.dev/guide/dep-pre-bundling.html#monorepos-and-linked-dependencies)
      //
      //'matrix-public-archive-shared'
    ],
  },
  resolve: {
    alias: {
      // The `file:` packages don't seem resolve correctly so let's add an alias as well
      // See https://css-tricks.com/adding-vite-to-your-existing-web-app/#aa-aliases
      'matrix-public-archive-shared': path.resolve(__dirname, '../shared'),
    },
    // This will make sure Vite/Rollup matches the original file path (i.e. the path
    // without following symlinks) instead of the real file path (i.e. the path after
    // following symlinks). This is useful when symlinking `hydrogen-view-sdk`, so it
    // still matches our `/node_modules/` pattern in the `build.commonjsOptions.include`
    // config below and gets converted from CommonJS to ESM as expected.
    preserveSymlinks: true,
  },
  build: {
    outDir: './dist',
    rollupOptions: {
      // Overwrite default `index.html` entry
      // (https://vitejs.dev/guide/backend-integration.html#backend-integration)
      input: [
        path.resolve(__dirname, '../client/js/entry-client-hydrogen.js'),
        path.resolve(__dirname, '../client/js/entry-client-room-directory.js'),
        path.resolve(__dirname, '../client/js/entry-client-room-alias-hash-redirect.js'),
      ],
      output: {
        assetFileNames: (chunkInfo) => {
          const { name } = path.parse(chunkInfo.name);
          // Some of the Hydrogen assets already have hashes in the name so let's remove
          // that in favor of our new hash.
          const nameWithoutHash = name.replace(/-[a-z0-9]+$/, '');

          return `assets/${nameWithoutHash}-[hash][extname]`;
        },
      },
    },

    // We want to know how the transformed source relates back to the original source
    // for easier debugging
    sourcemap: true,

    // Generate `dist/manifest.json` that we can use to map a given file to it's built
    // hashed file name and any dependencies it has.
    manifest: true,
    // We don't want to use the `ssrManifest` option. It's supposedly "for determining
    // style links and asset preload directives in production"
    // (https://vitejs.dev/config/build-options.html#build-ssrmanifest) (also see
    // https://vitejs.dev/guide/ssr.html#generating-preload-directives) but doesn't seem
    // very useful or what we want.
    //
    // ssrManifest: true,

    // Copy things like the version files from `public/` to `dist/`. Things in `public/`
    // are copied as-is with no transformations.
    copyPublicDir: true,

    commonjsOptions: {
      include: [
        // Fix `Error: 'default' is not exported by ...` when importing CommonJS files, see
        // https://github.com/vitejs/vite/issues/2679 and docs:
        // https://vitejs.dev/guide/dep-pre-bundling.html#monorepos-and-linked-dependencies
        /shared\//,

        // Make all of our `require()` CommonJS calls compatible in the ESM client build.
        // See https://vitejs.dev/guide/dep-pre-bundling.html#monorepos-and-linked-dependencies
        /node_modules/,
      ],
    },
  },
});
