const assert = require('assert');
const vm = require('vm');
const path = require('path');
const { readFile } = require('fs').promises;
const crypto = require('crypto');
const { parseHTML } = require('linkedom');

const config = require('../config.json');

async function renderToString(events, stateEventMap) {
  assert(events);
  assert(stateEventMap);

  const dom = parseHTML(`
    <!doctype html>
    <html lang="en">
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

  const vmContext = vm.createContext(dom);
  // Make the dom properties available in sub-`require(...)` calls
  vmContext.global.window = dom.window;
  vmContext.global.document = dom.document;
  vmContext.global.Node = dom.Node;
  vmContext.global.navigator = dom.navigator;
  vmContext.global.DOMParser = dom.DOMParser;
  vmContext.global.crypto = crypto.webcrypto;

  // So require(...) works in the vm
  vmContext.global.require = require;
  // So we can see logs from the underlying vm
  vmContext.global.console = console;

  vmContext.global.INPUT_EVENTS = events;
  vmContext.global.INPUT_STATE_EVENT_MAP = stateEventMap;
  vmContext.global.INPUT_CONFIG = config;

  const hydrogenRenderScriptCode = await readFile(
    path.resolve(__dirname, './hydrogen-vm-render-script.js'),
    'utf8'
  );
  const hydrogenRenderScript = new vm.Script(hydrogenRenderScriptCode, {
    filename: 'hydrogen-vm-render-script.js',
  });
  const vmResult = hydrogenRenderScript.runInContext(vmContext);
  // Wait for everything to render
  // (waiting on the promise returned from `hydrogen-render-script.js`)
  await vmResult;

  const documentString = dom.document.querySelector('#app').toString();
  return documentString;
}

module.exports = renderToString;
