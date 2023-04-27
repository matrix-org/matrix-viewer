# Tracing

Tracing allows you to see the flow of a request through the system and where time is
taken up in functions. This is useful for debugging and performance analysis.

<img src="https://user-images.githubusercontent.com/558581/180586026-ff6c653e-a54d-4cf4-abc8-a8c51971aad5.png" width="612">

## Setup

1. Get the all-in-one Jaeger Docker container running (via https://www.jaegertracing.io/docs/1.35/getting-started/)
   ```
   docker run -d --name jaeger \
     -e COLLECTOR_ZIPKIN_HOST_PORT=:9411 \
     -e COLLECTOR_OTLP_ENABLED=true \
     -p 6831:6831/udp \
     -p 6832:6832/udp \
     -p 5778:5778 \
     -p 5775:5775/udp \
     -p 16686:16686 \
     -p 4317:4317 \
     -p 4318:4318 \
     -p 14250:14250 \
     -p 14268:14268 \
     -p 14269:14269 \
     -p 9411:9411 \
     jaegertracing/all-in-one:1.35
   ```
1. Add `jaegerTracesEndpoint` to your `config.json`:
   ```json5
   {
     // ...
     jaegerTracesEndpoint: 'http://localhost:14268/api/traces',
   }
   ```

## Run the app with the OpenTelemetry tracing enabled

```
npm run start -- --tracing
# or
npm run start-dev -- --tracing
```

Manually:

```
node --require './server/tracing.js' server/server.js
```

## Viewing traces in Jaeger

Once you have the all-in-one Jaeger Docker container running, just visit
http://localhost:16686 to see a dashboard of the collected traces and dive in.

Traces are made up of many spans. Each span defines a `traceId` which it is associated with.
