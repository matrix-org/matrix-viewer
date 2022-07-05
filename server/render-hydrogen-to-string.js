'use strict';

const assert = require('assert');
const vm = require('vm');
const path = require('path');
const { readFile } = require('fs').promises;
const crypto = require('crypto');
const { parseHTML } = require('linkedom');

const RethrownError = require('./lib/rethrown-error');
const config = require('./lib/config');

async function renderHydrogenToString({ fromTimestamp, roomData, events, stateEventMap }) {
  try {
    assert(fromTimestamp);
    assert(roomData);
    assert(events);
    assert(stateEventMap);

    const dom = parseHTML(`
      <!doctype html>
      <html>
        <head></head>
        <body>
          <div id="app" class="hydrogen"></div>
        </body>
      </html>
    `);

    if (!dom.requestAnimationFrame) {
      dom.requestAnimationFrame = function (cb) {
        setTimeout(cb, 0);
      };
    }

    // Define this for the SSR context
    dom.window.matrixPublicArchiveContext = {
      fromTimestamp,
      roomData,
      events,
      stateEventMap,
      config: {
        basePort: config.get('basePort'),
        basePath: config.get('basePath'),
        matrixServerUrl: config.get('matrixServerUrl'),
      },
    };
    // Serialize it for when we run this again client-side
    dom.document.body.insertAdjacentHTML(
      'beforeend',
      `
      <script type="text/javascript">
        window.matrixPublicArchiveContext = ${JSON.stringify(dom.window.matrixPublicArchiveContext)}
      </script>
      `
    );

    const vmContext = vm.createContext(dom);
    // Make the dom properties available in sub-`require(...)` calls
    vmContext.global.window = dom.window;
    vmContext.global.document = dom.document;
    vmContext.global.Node = dom.Node;
    vmContext.global.navigator = dom.navigator;
    vmContext.global.DOMParser = dom.DOMParser;
    // Make sure `webcrypto` exists since it was only introduced in Node.js v17
    assert(crypto.webcrypto);
    vmContext.global.crypto = crypto.webcrypto;

    // So require(...) works in the vm
    vmContext.global.require = require;
    // So we can see logs from the underlying vm
    vmContext.global.console = console;

    const hydrogenRenderScriptCode = await readFile(
      path.resolve(__dirname, '../shared/hydrogen-vm-render-script.js'),
      'utf8'
    );
    const hydrogenRenderScript = new vm.Script(hydrogenRenderScriptCode, {
      filename: 'hydrogen-vm-render-script.js',
    });
    console.log('before runInContext');
    const vmResult = hydrogenRenderScript.runInContext(vmContext);
    console.log('after runInContext');
    // Wait for everything to render
    // (waiting on the promise returned from `hydrogen-render-script.js`)
    await vmResult;

    const documentString = dom.document.body.toString();
    return documentString;
  } catch (err) {
    console.log('throwing err');
    console.log('throwing err arguments', arguments);
    throw new RethrownError(
      `Failed to render Hydrogen to string. In order to reproduce, feed in these arguments into \`renderHydrogenToString(...)\`:\n    renderToString arguments: ${JSON.stringify(
        arguments[0]
      )}`,
      err
    );
  }
  console.log('after catch');
}

module.exports = renderHydrogenToString;
