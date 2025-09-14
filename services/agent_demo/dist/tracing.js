"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const sdk_node_1 = require("@opentelemetry/sdk-node");
const auto_instrumentations_node_1 = require("@opentelemetry/auto-instrumentations-node");
const exporter_jaeger_1 = require("@opentelemetry/exporter-jaeger");
const resources_1 = require("@opentelemetry/resources");
const semantic_conventions_1 = require("@opentelemetry/semantic-conventions");
const sdk = new sdk_node_1.NodeSDK({
    resource: new resources_1.Resource({
        [semantic_conventions_1.SemanticResourceAttributes.SERVICE_NAME]: 'agent_demo',
        [semantic_conventions_1.SemanticResourceAttributes.SERVICE_VERSION]: '1.0.0',
    }),
    traceExporter: new exporter_jaeger_1.JaegerExporter({
        endpoint: process.env['JAEGER_ENDPOINT'] || 'http://localhost:14268/api/traces',
    }),
    instrumentations: [(0, auto_instrumentations_node_1.getNodeAutoInstrumentations)()],
});
sdk.start();
process.on('SIGTERM', () => {
    sdk.shutdown()
        .then(() => console.log('Tracing terminated'))
        .catch((error) => console.log('Error terminating tracing', error))
        .finally(() => process.exit(0));
});
//# sourceMappingURL=tracing.js.map