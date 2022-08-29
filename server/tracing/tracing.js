'use strict';

const assert = require('assert');
const { registerInstrumentations } = require('@opentelemetry/instrumentation');
const { getNodeAutoInstrumentations } = require('@opentelemetry/auto-instrumentations-node');
const { diag, DiagConsoleLogger, DiagLogLevel } = require('@opentelemetry/api');
const { JaegerExporter } = require('@opentelemetry/exporter-jaeger');
const {
  BasicTracerProvider,
  // ConsoleSpanExporter,
  // SimpleSpanProcessor,
  BatchSpanProcessor,
} = require('@opentelemetry/sdk-trace-base');
const { AsyncLocalStorageContextManager } = require('@opentelemetry/context-async-hooks');
const { OTTracePropagator } = require('@opentelemetry/propagator-ot-trace');
const { Resource } = require('@opentelemetry/resources');
const { SemanticResourceAttributes } = require('@opentelemetry/semantic-conventions');

const CaptureSpanProcessor = require('./capture-span-processor');

const config = require('../lib/config');
const jaegerTracesEndpoint = config.get('jaegerTracesEndpoint');

const packageInfo = require('../../package.json');
assert(packageInfo.name);

// (Diagnostics) For troubleshooting, set the log level to DiagLogLevel.DEBUG.
//
diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.INFO);

const provider = new BasicTracerProvider({
  resource: new Resource({
    [SemanticResourceAttributes.SERVICE_NAME]: packageInfo.name,
  }),
});
// Export spans to console (useful for debugging).
// provider.addSpanProcessor(new SimpleSpanProcessor(new ConsoleSpanExporter()));

// Export spans to Jaeger
let isExportingToJaeger = false;
if (jaegerTracesEndpoint) {
  const exporter = new JaegerExporter({
    tags: [],
    endpoint: jaegerTracesEndpoint,
  });
  // Use this for immediate span submission
  //provider.addSpanProcessor(new SimpleSpanProcessor(exporter));
  // Otherwise, we should just use the more performant batched processor
  provider.addSpanProcessor(new BatchSpanProcessor(exporter));

  isExportingToJaeger = true;
}

const captureSpanProcessor = new CaptureSpanProcessor();
provider.addSpanProcessor(captureSpanProcessor);

function startTracing() {
  if (!isExportingToJaeger) {
    console.warn(
      `⚠ Tracing was started but \`jaegerTracesEndpoint\` was not configured so we are not exporting anything.`
    );
  }

  provider.register({
    contextManager: new AsyncLocalStorageContextManager(),
    propagator: new OTTracePropagator(),
  });

  registerInstrumentations({
    instrumentations: [
      getNodeAutoInstrumentations({
        '@opentelemetry/instrumentation-http': {
          // Docs:
          // https://github.com/open-telemetry/opentelemetry-js/tree/51afd54bd63e46d5d530266761144c7be2f6b3a7/experimental/packages/opentelemetry-instrumentation-http#http-instrumentation-options
          //
          // This is the place to ignore root level spans for Express routes. My
          // first guess would be in `ignoreLayers` in
          // `@opentelemetry/instrumentation-express` but that's not the case, see
          // https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1034#issuecomment-1158435392
          ignoreIncomingRequestHook: (req) => {
            // Ignore spans from static assets.
            //
            // FIXME: Ideally, all of the assets would all be served under
            // `/static/` so we could ignore that way instead. In Hydrogen, this
            // is tracked by https://github.com/vector-im/hydrogen-web/issues/757
            const isStaticAsset = !!req.url.match(/\.(css|js|svg|woff2)(\?.*?)?$/);
            return isStaticAsset;
          },
        },
      }),
    ],
  });

  process.on('SIGTERM', () => {
    provider
      .shutdown()
      .then(() => console.log('Tracing terminated'))
      .catch((error) => console.log('Error terminating tracing', error))
      .finally(() => process.exit(0));
  });
}

module.exports = {
  startTracing,
  provider,
  captureSpanProcessor,
};
