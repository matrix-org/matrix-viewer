'use strict';

// Called by `child_process` `fork` in `render-hydrogen-to-string.js` so we can
// get the data and exit the process cleanly. We don't want Hydrogen to keep
// running after we get our initial rendered HTML.

const _renderHydrogenToStringUnsafe = require('./3-render-hydrogen-to-string-unsafe');

// Only kick everything off once we receive the options. We pass in the options
// this way instead of argv because we will run into `Error: spawn E2BIG` and
// `Error: spawn ENAMETOOLONG` with argv.
process.on('message', async (options) => {
  try {
    const resultantHtml = await _renderHydrogenToStringUnsafe(options);

    // Send back the data we need
    process.send({
      data: resultantHtml,
    });
    // End the process gracefully. We got all the data we need.
    process.exit(0);
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
