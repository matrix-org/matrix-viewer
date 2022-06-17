'use strict';

const opentelemetry = require('@opentelemetry/sdk-node');
const { getNodeAutoInstrumentations } = require('@opentelemetry/auto-instrumentations-node');
const { diag, DiagConsoleLogger, DiagLogLevel } = require('@opentelemetry/api');
const {
  BasicTracerProvider,
  ConsoleSpanExporter,
  SimpleSpanProcessor,
} = require('@opentelemetry/tracing');
const { JaegerExporter } = require('@opentelemetry/exporter-jaeger');
const { BatchSpanProcessor } = require('@opentelemetry/sdk-trace-base');
const { OTTracePropagator } = require('@opentelemetry/propagator-ot-trace');
const { Resource } = require('@opentelemetry/resources');
const { SemanticResourceAttributes } = require('@opentelemetry/semantic-conventions');

// This is from the official guide but when uncommenting, this throws `Error:
// @opentelemetry/api: Attempted duplicate registration of API: trace`.
//
// (Diagnostics) For troubleshooting, set the log level to DiagLogLevel.DEBUG.
//
diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.INFO);

const exporter = new JaegerExporter({
  tags: [],
  endpoint: `http://localhost:4317`,
});

const provider = new BasicTracerProvider({
  resource: new Resource({
    [SemanticResourceAttributes.SERVICE_NAME]: 'matrix-public-archive',
  }),
});
// export spans to console (useful for debugging)
// provider.addSpanProcessor(new SimpleSpanProcessor(new ConsoleSpanExporter()));
// export spans to opentelemetry collector
provider.addSpanProcessor(new SimpleSpanProcessor(exporter));

//provider.register({ propagator: new OTTracePropagator() });
provider.register();

const sdk = new opentelemetry.NodeSDK({
  traceExporter: exporter,
  instrumentations: [getNodeAutoInstrumentations()],
});

sdk
  .start()
  .then(() => {
    console.log('Tracing initialized');
  })
  .catch((error) => console.log('Error initializing tracing', error));

process.on('SIGTERM', () => {
  sdk
    .shutdown()
    .then(() => console.log('Tracing terminated'))
    .catch((error) => console.log('Error terminating tracing', error))
    .finally(() => process.exit(0));
});
