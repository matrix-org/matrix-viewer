'use strict';

const path = require('path');
const { readFile, rm } = require('fs').promises;

const nodemon = require('nodemon');
const gulp = require('gulp');
const rev = require('gulp-rev');
const revRewrite = require('gulp-rev-rewrite');

const writeVersionFiles = require('./build-scripts/write-version-files');
const buildClientScripts = require('./build-scripts/build-client-scripts');

const config = {
  paths: {
    styles: {
      src: 'client/css/**/*.css',
      dest: 'dist/css/',
    },
    scripts: {
      src: 'client/scripts/**/*.js',
      dest: 'dist/scripts/',
    },
    staticAssetPaths: ['client/img/**/*'],
  },
};

function clean() {
  // Essentially `rm -rf ./dist`
  return rm('./dist/', { recursive: true, force: true });
}

async function staticAssets() {
  // Copy static assets to build dir
  return (
    gulp
      .src(config.paths.staticAssetPaths, { base: 'client', since: gulp.lastRun(staticAssets) })
      // Copy original assets to build dir
      .pipe(gulp.dest('dist/'))
      .pipe(rev())
      // Write rev'd (cache busting hashes in filenames) assets to build dir
      .pipe(gulp.dest('dist/'))
      // Write manifest to build dir
      .pipe(
        rev.manifest('manifest.json', {
          // Merge with the existing manifest if one exists
          merge: true,
        })
      )
      .pipe(gulp.dest('dist/'))
  );
}

async function styles() {
  const manifest = await readFile('dist/manifest.json');

  return (
    gulp
      .src(config.paths.styles.src, { since: gulp.lastRun(styles) })
      // Replace any references to fonts/images in CSS with rev'd filenames
      .pipe(revRewrite({ manifest }))
      // Copy original assets to build dir
      .pipe(gulp.dest(config.paths.styles.dest))
      .pipe(rev())
      // Write rev'd (cache busting hashes in filenames) assets to build dir
      .pipe(gulp.dest(config.paths.styles.dest))
      // Write manifest to build dir
      .pipe(
        rev.manifest('manifest.json', {
          // Merge with the existing manifest if one exists
          merge: true,
        })
      )
      .pipe(gulp.dest(config.paths.styles.dest))
  );
}

const assets = gulp.series(
  // Static assets which don't require references to other assets
  staticAssets,
  // Then work on assets which we need to replace asset references with the rev'd
  // assets
  styles
);

async function scripts(extraConfig) {
  await buildClientScripts(extraConfig);

  // TODO: Compress the client-side JavaScript
}

const build = gulp.series(clean, gulp.parallel(writeVersionFiles, assets, scripts));

function processWatchScripts() {
  // Build the client-side JavaScript bundle when we see any changes
  return scripts({
    build: {
      // Rebuild when we see changes
      // https://rollupjs.org/guide/en/#watch-options
      watch: true,
    },
  });
}

function processWatchServer() {
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
    script: path.join(__dirname, './server/server.js'),
    ext: 'js json',
    ignoreRoot: ['.git'],
    ignore: [path.join(__dirname, './dist/*')],
    args,
  });

  nodemon
    .on('start', function () {
      console.log('App has started');
    })
    .on('quit', function () {
      console.log('App has quit');
      //process.exit();
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
}

function watch() {
  processWatchServer();
  processWatchScripts();

  gulp.watch(config.paths.staticAssetPaths, assets);
  gulp.watch(config.paths.styles.src, assets);
}

module.exports = {
  clean,
  styles,
  scripts,
  watch,
  build,
};
