// Called by `child_process` `fork` in `run-in-child-process.js` so we can
// get the data and exit the process cleanly.

import assert from 'assert';

import RethrownError from '../lib/rethrown-error.js';

// Serialize the error and send it back up to the parent process so we can
// interact with it and know what happened when the process exits.
async function serializeError(err) {
  await new Promise((resolve) => {
    process.send(
      {
        error: true,
        name: err.name,
        message: err.message,
        stack: err.stack,
      },
      (sendErr) => {
        if (sendErr) {
          // We just log here instead of rejecting because it's more important
          // to see the original error we are trying to send up. Let's just
          // throw the original error below.
          const sendErrWithDescription = new RethrownError(
            'Failed to send error to the parent process',
            sendErr
          );
          console.error(sendErrWithDescription);
          // This will end up hitting the `unhandledRejection` handler and
          // serializing this error instead (worth a shot) 🤷‍♀️
          throw sendErrWithDescription;
        }

        resolve();
      }
    );
  });
}

// We don't exit the process after encountering one of these because maybe it
// doesn't matter to the main-line process in the module.
//
// If we don't listen for these events, the child will exit with status code 1
// (error) when they occur.
process.on('uncaughtException', async (err /*, origin*/) => {
  await serializeError(new RethrownError('uncaughtException in child process', err));
});

process.on('unhandledRejection', async (reason /*, promise*/) => {
  await serializeError(new RethrownError('unhandledRejection in child process', reason));
});

// Only kick everything off once we receive the options. We pass in the options
// this way instead of argv because we will run into `Error: spawn E2BIG` and
// `Error: spawn ENAMETOOLONG` with argv.
process.on('message', async (runArguments) => {
  try {
    assert(runArguments);

    // Require the module that we're supposed to run
    const modulePath = process.argv[2];
    assert(
      modulePath,
      'Expected `modulePath` to be passed into `child-fork-script.js` via argv[2]'
    );

    // Run the module
    const moduleToRun = await import(modulePath);
    const result = await moduleToRun(runArguments);

    assert(result, `No result returned from module we ran (${modulePath}).`);

    // Send back the data we need to the parent.
    await new Promise((resolve, reject) => {
      process.send(
        {
          data: result,
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
    // We need to wait for the error to completely send to the parent
    // process before we exit the process.
    await serializeError(err);

    // Fail the process and exit
    process.exit(1);
  }
});
