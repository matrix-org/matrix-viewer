## Tracing

- Dashboard where users can see visualisations -> http://localhost:16686

via https://www.jaegertracing.io/docs/1.35/getting-started/

```
docker run -d --name jaeger \
  -e COLLECTOR_ZIPKIN_HOST_PORT=:9411 \
  -e COLLECTOR_OTLP_ENABLED=true \
  -p 6831:6831/udp \
  -p 6832:6832/udp \
  -p 5778:5778 \
  -p 16686:16686 \
  -p 4317:4317 \
  -p 4318:4318 \
  -p 14250:14250 \
  -p 14268:14268 \
  -p 14269:14269 \
  -p 9411:9411 \
  jaegertracing/all-in-one:1.35
```

| Port  | Protocol | Component | Function                                                                                     |
| ----- | -------- | --------- | -------------------------------------------------------------------------------------------- |
| 6831  | UDP      | agent     | accept jaeger.thrift over Thrift-compact protocol (used by most SDKs)                        |
| 6832  | UDP      | agent     | accept jaeger.thrift over Thrift-binary protocol (used by Node.js SDK)                       |
| 5775  | UDP      | agent     | (deprecated) accept zipkin.thrift over compact Thrift protocol (used by legacy clients only) |
| 5778  | HTTP     | agent     | serve configs (sampling, etc.)                                                               |
| 16686 | HTTP     | query     | serve frontend                                                                               |
| 4317  | HTTP     | collector | accept OpenTelemetry Protocol (OTLP) over gRPC, if enabled                                   |
| 4318  | HTTP     | collector | accept OpenTelemetry Protocol (OTLP) over HTTP, if enabled                                   |
| 14268 | HTTP     | collector | accept jaeger.thrift directly from clients                                                   |
| 14250 | HTTP     | collector | accept model.proto                                                                           |
| 9411  | HTTP     | collector | Zipkin compatible endpoint (optional)                                                        |

With Service Performance Monitoring (SPM)
