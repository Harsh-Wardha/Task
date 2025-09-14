"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const pino_1 = __importDefault(require("pino"));
const pino_http_1 = __importDefault(require("pino-http"));
const api_1 = require("@opentelemetry/api");
const gateway_service_1 = require("./services/gateway-service");
const circuit_breaker_service_1 = require("./services/circuit-breaker-service");
require("./tracing");
const logger = (0, pino_1.default)({
    level: process.env['LOG_LEVEL'] || 'info',
    formatters: {
        level: (label) => ({ level: label }),
    },
});
const app = (0, express_1.default)();
const PORT = process.env['PORT'] || 3002;
const circuitBreakerService = new circuit_breaker_service_1.CircuitBreakerService();
const gatewayService = new gateway_service_1.GatewayService(circuitBreakerService, logger);
app.use((0, helmet_1.default)());
app.use((0, cors_1.default)());
app.use(express_1.default.json());
app.use((0, pino_http_1.default)({
    logger,
    genReqId: () => crypto.randomUUID(),
    customLogLevel: (_req, res, err) => {
        if (res.statusCode >= 400 && res.statusCode < 500) {
            return 'warn';
        }
        else if (res.statusCode >= 500 || err) {
            return 'error';
        }
        return 'info';
    },
    customSuccessMessage: (req, res) => {
        return `${req.method} ${req.url} ${res.statusCode}`;
    },
    customErrorMessage: (req, res, err) => {
        return `${req.method} ${req.url} ${res.statusCode} - ${err?.message}`;
    },
}));
app.get('/health', (req, res) => {
    const startTime = Date.now();
    const tracer = api_1.trace.getTracer('agent-custom');
    const span = tracer.startSpan('health-check');
    try {
        span.setAttributes({
            'service.name': 'agent_custom',
            'endpoint': '/health',
            'method': 'GET'
        });
        const healthData = {
            status: 'healthy',
            timestamp: new Date().toISOString(),
            service: 'agent_custom',
            uptime: process.uptime(),
            memory: process.memoryUsage(),
            version: process.env['npm_package_version'] || '1.0.0',
            circuitBreaker: {
                state: circuitBreakerService.getState(),
                failures: circuitBreakerService.getFailureCount(),
                lastFailureTime: circuitBreakerService.getLastFailureTime()
            }
        };
        const latency = Date.now() - startTime;
        logger.info({
            request_id: req.id,
            method: 'GET',
            path: '/health',
            status: 200,
            latency_ms: latency
        }, 'Health check completed');
        span.setAttributes({
            'http.status_code': 200,
            'response.latency_ms': latency
        });
        res.status(200).json(healthData);
    }
    catch (error) {
        const latency = Date.now() - startTime;
        logger.error({
            request_id: req.id,
            method: 'GET',
            path: '/health',
            status: 500,
            latency_ms: latency,
            error: error instanceof Error ? error.message : 'Unknown error'
        }, 'Health check failed');
        span.recordException(error instanceof Error ? error : new Error('Unknown error'));
        span.setAttributes({
            'http.status_code': 500,
            'response.latency_ms': latency
        });
        res.status(500).json({
            status: 'unhealthy',
            error: 'Internal server error',
            timestamp: new Date().toISOString()
        });
    }
    finally {
        span.end();
    }
});
app.post('/run', async (req, res) => {
    const startTime = Date.now();
    const requestId = req.id;
    const tracer = api_1.trace.getTracer('agent-custom');
    const span = tracer.startSpan('run-endpoint', {
        attributes: {
            'service.name': 'agent_custom',
            'endpoint': '/run',
            'method': 'POST',
            'request_id': String(requestId)
        }
    });
    try {
        logger.info({
            request_id: requestId,
            method: 'POST',
            path: '/run',
            body: req.body
        }, 'Processing run request');
        const result = await api_1.context.with(api_1.trace.setSpan(api_1.context.active(), span), async () => {
            return await gatewayService.makeOutboundCall(String(requestId));
        });
        const latency = Date.now() - startTime;
        logger.info({
            request_id: requestId,
            method: 'POST',
            path: '/run',
            status: 200,
            latency_ms: latency,
            gateway_response: result
        }, 'Run request completed successfully');
        span.setAttributes({
            'http.status_code': 200,
            'response.latency_ms': latency,
            'gateway.response_status': result.status
        });
        res.status(200).json({
            success: true,
            request_id: requestId,
            timestamp: new Date().toISOString(),
            latency_ms: latency,
            gateway_response: result
        });
    }
    catch (error) {
        const latency = Date.now() - startTime;
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logger.error({
            request_id: requestId,
            method: 'POST',
            path: '/run',
            status: 500,
            latency_ms: latency,
            error: errorMessage,
            circuit_breaker_state: circuitBreakerService.getState()
        }, 'Run request failed');
        span.recordException(error instanceof Error ? error : new Error(errorMessage));
        span.setAttributes({
            'http.status_code': 500,
            'response.latency_ms': latency,
            'error.message': errorMessage
        });
        res.status(500).json({
            success: false,
            request_id: requestId,
            timestamp: new Date().toISOString(),
            latency_ms: latency,
            error: errorMessage,
            circuit_breaker_state: circuitBreakerService.getState()
        });
    }
    finally {
        span.end();
    }
});
app.use('*', (req, res) => {
    logger.warn({
        request_id: req.id,
        method: req.method,
        path: req.originalUrl,
        status: 404
    }, 'Route not found');
    res.status(404).json({
        error: 'Route not found',
        path: req.originalUrl,
        timestamp: new Date().toISOString()
    });
});
app.use((err, req, res, _next) => {
    logger.error({
        request_id: req.id,
        method: req.method,
        path: req.path,
        status: 500,
        error: err.message,
        stack: err.stack
    }, 'Unhandled error');
    res.status(500).json({
        error: 'Internal server error',
        timestamp: new Date().toISOString()
    });
});
app.listen(PORT, () => {
    logger.info({
        port: PORT,
        service: 'agent_custom',
        environment: process.env['NODE_ENV'] || 'development',
        gateway_url: process.env['GATEWAY_URL'] || 'not configured'
    }, 'Agent Custom service started');
});
exports.default = app;
//# sourceMappingURL=index.js.map