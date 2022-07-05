'use strict';

// Called by `child_process` `fork` in `render-hydrogen-to-string.js` so we can
// get the data and exit the process cleanly. We don't want Hydrogen to keep
// running after we get our initial rendered HTML.

const assert = require('assert');

const _renderHydrogenToStringUnsafe = require('./3-render-hydrogen-to-string-unsafe');

(async () => {
  try {
    assert(
      process.argv[2],
      'No command-line arguments passed to `render-hydrogen-to-string-fork-script.js`. Make sure these are being passed in when we spawn the new process.'
    );
    const options = JSON.parse(process.argv[2]);
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
})();
