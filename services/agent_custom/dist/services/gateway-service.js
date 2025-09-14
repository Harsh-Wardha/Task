"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.GatewayService = void 0;
const axios_1 = __importDefault(require("axios"));
const api_1 = require("@opentelemetry/api");
class GatewayService {
    httpClient;
    circuitBreakerService;
    logger;
    constructor(circuitBreakerService, logger) {
        this.logger = logger;
        this.circuitBreakerService = circuitBreakerService;
        this.httpClient = axios_1.default.create({
            timeout: 3000,
            headers: {
                'Content-Type': 'application/json',
                'User-Agent': 'agent-custom/1.0.0'
            }
        });
    }
    async makeOutboundCall(requestId) {
        const gatewayUrl = process.env['GATEWAY_URL'];
        const apiKey = process.env['GATEWAY_API_KEY'];
        if (!gatewayUrl || !apiKey) {
            throw new Error('GATEWAY_URL and GATEWAY_API_KEY environment variables are required');
        }
        const tracer = api_1.trace.getTracer('gateway-service');
        const span = tracer.startSpan('outbound-http-call', {
            attributes: {
                'http.method': 'POST',
                'http.url': gatewayUrl,
                'request_id': requestId,
                'gateway.api_key_present': !!apiKey
            }
        });
        try {
            const result = await api_1.context.with(api_1.trace.setSpan(api_1.context.active(), span), async () => {
                return await this.executeWithPolicies(gatewayUrl, apiKey, requestId, span);
            });
            span.setAttributes({
                'http.status_code': result.status,
                'response.latency_ms': result.latency_ms,
                'response.attempt': result.attempt
            });
            span.setStatus({ code: 1 });
            return result;
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            span.recordException(error instanceof Error ? error : new Error(errorMessage));
            span.setAttributes({
                'error.message': errorMessage,
                'error.type': error instanceof Error ? error.constructor.name : 'UnknownError'
            });
            span.setStatus({
                code: 2,
                message: errorMessage
            });
            throw error;
        }
        finally {
            span.end();
        }
    }
    async executeWithPolicies(gatewayUrl, apiKey, requestId, span) {
        let attempt = 0;
        let lastError = null;
        const executeRequest = async () => {
            attempt++;
            const startTime = Date.now();
            this.logger.info({
                request_id: requestId,
                attempt,
                gateway_url: gatewayUrl,
                method: 'POST',
                path: '/run'
            }, `Making outbound HTTP call (attempt ${attempt})`);
            span.setAttributes({
                'http.attempt': attempt,
                'http.retry_count': attempt - 1
            });
            try {
                const config = {
                    method: 'POST',
                    url: gatewayUrl,
                    headers: {
                        'X-API-Key': apiKey,
                        'X-Request-ID': requestId
                    },
                    data: {
                        request_id: requestId,
                        timestamp: new Date().toISOString(),
                        service: 'agent_custom'
                    },
                    timeout: 3000,
                };
                const response = await this.httpClient.request(config);
                const latency = Date.now() - startTime;
                this.logger.info({
                    request_id: requestId,
                    attempt,
                    method: 'POST',
                    path: '/run',
                    status: response.status,
                    latency_ms: latency
                }, `Outbound HTTP call successful (attempt ${attempt})`);
                return {
                    status: response.status,
                    data: response.data,
                    headers: response.headers,
                    latency_ms: latency,
                    attempt
                };
            }
            catch (error) {
                const latency = Date.now() - startTime;
                lastError = error instanceof Error ? error : new Error('Unknown error');
                this.logger.warn({
                    request_id: requestId,
                    attempt,
                    method: 'POST',
                    path: '/run',
                    status: 'error',
                    latency_ms: latency,
                    error: lastError.message,
                    error_type: lastError.constructor.name
                }, `Outbound HTTP call failed (attempt ${attempt})`);
                if (axios_1.default.isAxiosError(error) && error.response?.status && error.response.status >= 400 && error.response.status < 500) {
                    throw lastError;
                }
                throw lastError;
            }
        };
        try {
            return await this.circuitBreakerService.execute(executeRequest);
        }
        catch (error) {
            this.logger.error({
                request_id: requestId,
                final_attempt: attempt,
                method: 'POST',
                path: '/run',
                error: error instanceof Error ? error.message : 'Unknown error',
                error_type: error instanceof Error ? error.constructor.name : 'UnknownError'
            }, `All outbound HTTP call attempts failed after ${attempt} attempts`);
            throw error;
        }
    }
}
exports.GatewayService = GatewayService;
//# sourceMappingURL=gateway-service.js.map