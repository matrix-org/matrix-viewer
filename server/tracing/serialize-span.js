'use strict';

const {
  hrTimeToMilliseconds,
  //hrTimeToMicroseconds
} = require('@opentelemetry/core');
const { SemanticAttributes } = require('@opentelemetry/semantic-conventions');

const SAFE_ATTRIBUTES = [
  SemanticAttributes.HTTP_METHOD,
  SemanticAttributes.HTTP_URL,
  SemanticAttributes.HTTP_TARGET,
  SemanticAttributes.HTTP_STATUS_CODE,
];

// Convert a `Span` object to a plain old JavaScript object with only the info
// we care about and that is safe to share. We want something we can JSON
// serialize.
function serializeSpan(span) {
  const spanContext = span.spanContext();

  const safeAttributes = {};
  SAFE_ATTRIBUTES.forEach((safeAttribute) => {
    safeAttributes[safeAttribute] = span.attributes[safeAttribute];
  });

  const startTimeInMs = hrTimeToMilliseconds(span.startTime);
  const endTimeInMs = hrTimeToMilliseconds(span.endTime);

  let durationInMs = null;
  if (startTimeInMs && endTimeInMs) {
    durationInMs = endTimeInMs - startTimeInMs;
  }

  return {
    name: span.name,
    spanContext: {
      traceId: spanContext.traceId,
      spanId: spanContext.spanId,
    },
    //parentSpanId: span.parentSpanId,
    startTimeInMs,
    endTimeInMs,
    durationInMs,
    attributes: safeAttributes,
    //span.links
  };
}

module.exports = serializeSpan;
