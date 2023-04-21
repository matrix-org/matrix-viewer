// Server-side render Hydrogen to a string.
//
// We use a `child_process` because we want to be able to exit the process after
// we receive the SSR results. We don't want Hydrogen to keep running after we
// get our initial rendered HTML.

const assert = require('assert');
const RethrownError = require('../lib/rethrown-error');
const runInChildProcess = require('../child-process-runner/run-in-child-process');

// The render should be fast. If it's taking more than 5 seconds, something has
// gone really wrong.
const RENDER_TIMEOUT = 5000;

async function renderHydrogenToString(renderOptions) {
  assert(renderOptions);

  // We expect `config` but we should sanity check that we aren't leaking the access token
  // to the client if someone naievely copied the whole `config` object to here.
  assert(renderOptions.vmRenderContext.config);
  assert(
    !renderOptions.vmRenderContext.config.matrixAccessToken,
    'We should not be leaking the `config.matrixAccessToken` to the Hydrogen render function because this will reach the client!'
  );

  try {
    // In development, if you're running into a hard to track down error with
    // the render hydrogen stack and fighting against the multiple layers of
    // complexity with `child_process `and `vm`; you can get away with removing
    // the `child_process` part of it by using
    // `render-hydrogen-to-string-unsafe` directly.
    // ```js
    // const _renderHydrogenToStringUnsafe = require('../hydrogen-render/render-hydrogen-to-string-unsafe');
    // const hydrogenHtmlOutput = await _renderHydrogenToStringUnsafe(renderOptions);
    // ```
    //
    // We use a child_process because we want to be able to exit the process after
    // we receive the SSR results. We don't want Hydrogen to keep running after we
    // get our initial rendered HTML.
    const hydrogenHtmlOutput = await runInChildProcess(
      require.resolve('./render-hydrogen-to-string-unsafe'),
      renderOptions,
      {
        timeout: RENDER_TIMEOUT,
      }
    );

    return hydrogenHtmlOutput;
  } catch (err) {
    throw new RethrownError(
      `Failed to render Hydrogen to string. In order to reproduce, feed in these arguments into \`renderHydrogenToString(...)\`:\n    renderHydrogenToString arguments: ${JSON.stringify(
        renderOptions
      )}`,
      err
    );
  }
}

module.exports = renderHydrogenToString;
