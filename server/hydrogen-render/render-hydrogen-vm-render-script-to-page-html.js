'use strict';

const assert = require('assert');

const renderHydrogenToString = require('../hydrogen-render/render-hydrogen-to-string');
const renderPageHtml = require('../hydrogen-render/render-page-html');

async function renderHydrogenVmRenderScriptToPageHtml({
  pageOptions,
  vmRenderScriptFilePath,
  vmRenderContext,
  abortSignal,
}) {
  assert(vmRenderScriptFilePath);
  assert(vmRenderContext);
  assert(pageOptions);

  const hydrogenHtmlOutput = await renderHydrogenToString({
    vmRenderScriptFilePath,
    vmRenderContext,
    pageOptions,
    abortSignal,
  });

  const pageHtml = renderPageHtml({
    pageOptions,
    bodyHtml: hydrogenHtmlOutput,
    vmRenderContext,
  });

  return pageHtml;
}

module.exports = renderHydrogenVmRenderScriptToPageHtml;
