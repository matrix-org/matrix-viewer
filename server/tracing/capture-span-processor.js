//import { SpanProcessor } from '@opentelemetry/sdk-trace-base';
import { suppressTracing } from '@opentelemetry/core';
import { context } from '@opentelemetry/api';

// 1. Keeps track of all spans for a given trace after calling
//    `trackSpansInTrace(traceId)` (call this in a middleware before any other
//    routes).
// 2. Then during the request, you can see all spans for a given trace with
//    `getSpansInTrace(traceId)`.
// 3. Don't forget to clean up with `dropSpansInTrace(traceId)` after you're
//    done with the spans (should be done in the `res.on('finish', ...)`
//    callback).
//
// NoopSpanProcessor.ts reference:
// https://github.com/open-telemetry/opentelemetry-js/blob/747c404fb1295d54eb628a434ebf782d2f180bfb/packages/opentelemetry-sdk-trace-base/src/export/NoopSpanProcessor.ts
class CaptureSpanProcessor {
  // Map from traceId to spans in the trace
  traceMap = {};

  // We capture when the span starts so that we get any ongoing spans if the
  // request times out and we want to show what it was stuck on.
  onStart(span /*, ctx*/) {
    // prevent downstream exporter calls from generating spans
    context.with(suppressTracing(context.active()), () => {
      const traceIdsToTrack = Object.keys(this.traceMap);

      const traceId = span.spanContext().traceId;

      if (traceIdsToTrack.includes(traceId)) {
        this.traceMap[traceId].push(span);
      }
    });
  }

  onEnd(/*span*/) {
    /* noop */
  }

  shutdown() {
    /* noop */
    return Promise.resolve();
  }
  forceFlush() {
    /* noop */
    return Promise.resolve();
  }

  // Get all spans for a given trace.
  getSpansInTrace(traceId) {
    return this.traceMap[traceId];
  }

  // Keeps track of all spans for a given trace after calling
  // `trackSpansInTrace(traceId)` (call this in a middleware before any other
  // routes).
  trackSpansInTrace(traceId) {
    this.traceMap[traceId] = [];
  }

  // Don't forget to clean up with `dropSpansInTrace(traceId)` after you're done
  // with the spans (should be done in the `res.on('finish', ...)` callback).
  //
  // alias: Dispose
  dropSpansInTrace(traceId) {
    delete this.traceMap[traceId];
  }
}

module.exports = CaptureSpanProcessor;
