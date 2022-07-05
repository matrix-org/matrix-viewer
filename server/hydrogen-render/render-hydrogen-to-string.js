'use strict';

// We use a child_process because we want to be able to exit the process after
// we receive the SSR results. We don't want Hydrogen to keep running after we
// get our initial rendered HTML.

const fork = require('child_process').fork;

const RethrownError = require('../lib/rethrown-error');

const RENDER_TIMEOUT = 10000;

async function renderHydrogenToString(options) {
  try {
    let data = '';
    let childErrors = [];

    const controller = new AbortController();
    const { signal } = controller;
    // We use a child_process because we want to be able to exit the process after
    // we receive the SSR results.
    const child = fork(
      require.resolve('./render-hydrogen-to-string-fork-script'),
      [JSON.stringify(options)],
      {
        signal,
        //cwd: process.cwd(),
      }
    );

    // Stops the child process if it takes too long
    setTimeout(() => {
      controller.abort();
    }, RENDER_TIMEOUT);

    // Collect the data passed back by the child
    child.on('message', function (result) {
      if (result.error) {
        // De-serialize the error
        const childError = new Error();
        childError.name = result.name;
        childError.message = result.message;
        childError.stack = result.stack;
        // We shouldn't really run into a situation where there are multiple
        // errors but since this is just a message bus, it's possible.
        childErrors.push(childError);
      } else {
        data += result.data;
      }
    });

    await new Promise((resolve, reject) => {
      child.on('close', (exitCode) => {
        // Exited successfully
        if (exitCode === 0) {
          resolve(data);
        } else {
          let extraErrorsMessage = '';
          if (childErrors.length > 1) {
            extraErrorsMessage = ` (somehow we saw ${childErrors.length} errors but we really always expect 1 error)`;
          }

          const error = new RethrownError(
            `Child process failed with exit code ${exitCode}${extraErrorsMessage}`,
            childErrors[0]
          );
          reject(error);
        }
      });

      // When a problem occurs when spawning the process or gets aborted
      child.on('error', (err) => {
        if (err.name === 'AbortError') {
          throw new RethrownError(
            `Timed out while rendering Hydrogen to string so we aborted the child process after ${RENDER_TIMEOUT}ms`,
            err
          );
        }

        reject(err);
      });
    });

    return data;
  } catch (err) {
    throw new RethrownError(
      `Failed to render Hydrogen to string. In order to reproduce, feed in these arguments into \`renderHydrogenToString(...)\`:\n    renderToString arguments: ${JSON.stringify(
        arguments[0]
      )}`,
      err
    );
  }
}

module.exports = renderHydrogenToString;
