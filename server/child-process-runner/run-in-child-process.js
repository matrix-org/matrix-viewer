// Generic `child_process` runner that handles running the given module with the
// given `runArguments` and returning the async result. Handles the complexity
// error handling, passing large argument objects, and timeouts.
//
// Error handling includes main-line errors seen while waiting the async result,
// as well as keeping track of out of band `uncaughtException` and
// `unhandledRejection` to give more context if the process exits with code 1
// (error) or timesout.

const assert = require('assert');
const { fork } = require('child_process');

const RethrownError = require('../lib/rethrown-error');
const { traceFunction } = require('../tracing/trace-utilities');

const config = require('../lib/config');
const logOutputFromChildProcesses = config.get('logOutputFromChildProcesses');

if (!logOutputFromChildProcesses) {
  console.warn(
    `Silencing logs from child processes (config.logOutputFromChildProcesses = ${logOutputFromChildProcesses})`
  );
}

function assembleErrorAfterChildExitsWithErrors(exitCode, childErrors) {
  assert(childErrors);

  let extraErrorsMessage = '';
  if (childErrors.length > 1) {
    extraErrorsMessage = ` (somehow we saw ${
      childErrors.length
    } errors but we really always expect 1 error)\n${childErrors
      .map((childError, index) => `${index}. ${childError.stack}`)
      .join('\n')}`;
  }

  let childErrorToDisplay;
  if (childErrors.length === 0) {
    childErrorToDisplay = new Error('No child errors');
    // Clear the stack trace part of the stack string out because this is just a
    // note about the lack of errors, not an actual error and is just noisy with
    // that extra fluff.
    childErrorToDisplay.stack = childErrorToDisplay.message;
  } else if (childErrors.length === 1) {
    childErrorToDisplay = childErrors[0];
  } else {
    childErrorToDisplay = new Error('Multiple child errors listed above ^');
    // Clear the stack trace part of the stack string out because this is just a
    // note about the other errors, not an actual error and is just noisy with
    // that extra fluff.
    childErrorToDisplay.stack = childErrorToDisplay.message;
  }

  const childErrorSummary = new RethrownError(
    `Child process exited with code ${exitCode}${extraErrorsMessage}`,
    childErrorToDisplay
  );

  return childErrorSummary;
}

async function runInChildProcess(modulePath, runArguments, { timeout }) {
  let abortTimeoutId;
  try {
    let childErrors = [];
    let childExitCode = '(not set yet)';

    const controller = new AbortController();
    const { signal } = controller;
    // We use a child_process because we want to be able to exit the process
    // after we receive the results. We use `fork` instead of `exec`/`spawn` so
    // that we can pass a module instead of running a command.
    const child = fork(require.resolve('./child-fork-script'), [modulePath], {
      signal,
      // Default to silencing logs from the child process. We already have
      // proper instrumentation of any errors that might occur.
      //
      // This also makes `child.stderr` and `child.stdout` available
      silent: true,
      //cwd: process.cwd(),
    });

    // Since we have to use the `silent` option for the `stderr` stuff below, we
    // should also print out the `stdout` to our main console.
    if (logOutputFromChildProcesses) {
      child.stdout.on('data', function (data) {
        console.log('Child printed something to stdout:', String(data));
      });

      child.stderr.on('data', function (data) {
        console.log('Child printed something to stderr:', String(data));
      });
    }

    // Pass the runArguments to the child by sending instead of via argv because
    // we will run into `Error: spawn E2BIG` and `Error: spawn ENAMETOOLONG`
    // with argv.
    child.send(runArguments);

    // Stops the child process if it takes too long
    if (timeout) {
      abortTimeoutId = setTimeout(() => {
        controller.abort();
      }, timeout);
    }

    const returnedData = await new Promise((resolve, reject) => {
      let data = '';
      // Collect the data passed back by the child
      child.on('message', function (result) {
        if (result.error) {
          // De-serialize the error
          const childError = new Error();
          childError.name = result.name;
          childError.message = result.message;
          childError.stack = result.stack;
          // When an error happens while running the module, we only expect one
          // error to come through here from the main-line to run the module.
          // But it's possible to get multiple errors from async out of context
          // places since we also listen to `uncaughtException` and
          // `unhandledRejection`.
          childErrors.push(childError);
        } else {
          data += result.data;
        }
      });

      child.on('close', (exitCode) => {
        childExitCode = exitCode;
        // Exited successfully
        if (exitCode === 0) {
          resolve(data);
        } else {
          const childErrorSummary = assembleErrorAfterChildExitsWithErrors(
            childExitCode,
            childErrors
          );
          reject(childErrorSummary);
        }
      });

      // When a problem occurs when spawning the process or gets aborted
      child.on('error', (err) => {
        if (err.name === 'AbortError') {
          const childErrorSummary = assembleErrorAfterChildExitsWithErrors(
            childExitCode,
            childErrors
          );
          reject(
            new RethrownError(
              `Timed out while running ${modulePath} so we aborted the child process after ${timeout}ms. Any child errors? (${childErrors.length})`,
              childErrorSummary
            )
          );
        } else {
          reject(err);
        }
      });
    });

    if (!returnedData) {
      const childErrorSummary = assembleErrorAfterChildExitsWithErrors(childExitCode, childErrors);
      throw new RethrownError(
        `No \`returnedData\` sent from child process while running the module (${modulePath}). Any child errors? (${childErrors.length})`,
        childErrorSummary
      );
    }

    return returnedData;
  } finally {
    // We don't have to add a undefined/null check here because `clearTimeout`
    // works with any value you give it and doesn't throw an error.
    clearTimeout(abortTimeoutId);
  }
}

module.exports = traceFunction(runInChildProcess);
