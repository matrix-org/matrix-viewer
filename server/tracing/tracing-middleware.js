'use strict';

const opentelemetryApi = require('@opentelemetry/api');

const asyncHandler = require('../lib/express-async-handler');
const { captureSpanProcessor } = require('./tracing');
const serializeSpan = require('./serialize-span');

// From the current active context, grab the `traceId`. The `traceId` will be
// shared for the whole request because all spans live under the root span.
function getActiveTraceId() {
  //const rootCtx = opentelemetryApi.ROOT_CONTEXT;
  const activeCtx = opentelemetryApi.context.active();
  if (activeCtx) {
    const span = opentelemetryApi.trace.getSpan(activeCtx);
    if (span) {
      const traceId = span.spanContext().traceId;

      return traceId;
    }
  }
}

// Handles keeping track of tracing spans for each request.
// Also adds the traceId to the to the `X-Trace-Id` response header.
async function handleTracingMiddleware(req, res, next) {
  const traceId = getActiveTraceId();
  if (traceId) {
    // Add the OpenTelemetry trace ID to the `X-Trace-Id` response header so
    // we can cross-reference. We can use this to lookup the request in
    // Jaeger.
    res.set('X-Trace-Id', traceId);

    // Start keeping track of all of spans that happen during the request
    captureSpanProcessor.trackSpansInTrace(traceId);

    // Cleanup after the request is done
    res.on('finish', function () {
      captureSpanProcessor.dropSpansInTrace(traceId);
    });
  }

  next();
}

// Get all of spans we're willing to show to the user.
//
// We only care about showing the external API HTTP requests to the user so they
// can tell what part of the Matrix API is being so slow.
function getSerializableSpans() {
  const traceId = getActiveTraceId();
  if (traceId) {
    const spans = captureSpanProcessor.getSpansInTrace(traceId) ?? [];

    // We only care about showing the external API HTTP requests to the user
    const filteredSpans = spans.filter((span) => {
      return [
        // `http`/`https` requests
        '@opentelemetry/instrumentation-http',
        // Native `fetch`
        'opentelemetry-instrumentation-node-18-fetch',
        // This will get `tcp.connect` calls which `fetch` does but not the full request lifecycle
        //'@opentelemetry/instrumentation-net',
      ].includes(span.instrumentationLibrary.name);
    });

    const serializableSpans = filteredSpans.map((span) => serializeSpan(span));

    return serializableSpans;
  }

  return [];
}

module.exports = {
  handleTracingMiddleware: asyncHandler(handleTracingMiddleware),
  getSerializableSpans,
  getActiveTraceId,
};
