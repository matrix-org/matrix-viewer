'use strict';

// Called by `child_process` `fork` in `render-hydrogen-to-string.js` so we can
// get the data and exit the process cleanly. We don't want Hydrogen to keep
// running after we get our initial rendered HTML.

const assert = require('assert');

const _renderHydrogenToStringUnsafe = require('./3-render-hydrogen-to-string-unsafe');

// Only kick everything off once we receive the options. We pass in the options
// this way instead of argv because we will run into `Error: spawn E2BIG` and
// `Error: spawn ENAMETOOLONG` with argv.
process.on('message', async (options) => {
  try {
    const resultantHtml = await _renderHydrogenToStringUnsafe(options);

    assert(resultantHtml, `No HTML returned from _renderHydrogenToStringUnsafe.`);

    // Send back the data we need to the parent.
    await new Promise((resolve, reject) => {
      process.send(
        {
          data: resultantHtml,
        },
        (err) => {
          if (err) {
            return reject(err);
          }

          // Exit once we know the data was sent out. We can't gurantee the
          // message was received but this should work pretty well.
          //
          // Related:
          //  - https://stackoverflow.com/questions/34627546/process-send-is-sync-async-on-nix-windows
          //  - https://github.com/nodejs/node/commit/56d9584a0ead78874ca9d4de2e55b41c4056e502
          //  - https://github.com/nodejs/node/issues/6767
          process.exit(0);
          resolve();
        }
      );
    });
  } catch (err) {
    // Serialize the error and send it back up to the parent process so we can
    // interact with it and know what happened when the process exits.
    process.send({
      error: true,
      name: err.name,
      message: err.message,
      stack: err.stack,
    });
    // Throw the error so the process fails and exits
    throw err;
  }
});
