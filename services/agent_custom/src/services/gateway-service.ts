import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';
import { trace, context, Span } from '@opentelemetry/api';
import { CircuitBreakerService } from './circuit-breaker-service';
import { Logger } from 'pino';

export interface GatewayResponse {
  status: number;
  data: any;
  headers: any;
  latency_ms: number;
  attempt: number;
}

export class GatewayService {
  private httpClient: AxiosInstance;
  private circuitBreakerService: CircuitBreakerService;
  private logger: Logger;

  constructor(circuitBreakerService: CircuitBreakerService, logger: Logger) {
    this.logger = logger;
    this.circuitBreakerService = circuitBreakerService;
    
    // Initialize HTTP client with base configuration
    this.httpClient = axios.create({
      timeout: 3000, // 3s read timeout
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'agent-custom/1.0.0'
      }
    });
  }

  public async makeOutboundCall(requestId: string): Promise<GatewayResponse> {
    const gatewayUrl = process.env['GATEWAY_URL'];
    const apiKey = process.env['GATEWAY_API_KEY'];

    if (!gatewayUrl || !apiKey) {
      throw new Error('GATEWAY_URL and GATEWAY_API_KEY environment variables are required');
    }

    const tracer = trace.getTracer('gateway-service');
    const span = tracer.startSpan('outbound-http-call', {
      attributes: {
        'http.method': 'POST',
        'http.url': gatewayUrl,
        'request_id': requestId,
        'gateway.api_key_present': !!apiKey
      }
    });

    try {
      const result = await context.with(trace.setSpan(context.active(), span), async () => {
        return await this.executeWithPolicies(gatewayUrl, apiKey, requestId, span);
      });

      span.setAttributes({
        'http.status_code': result.status,
        'response.latency_ms': result.latency_ms,
        'response.attempt': result.attempt
      });

      span.setStatus({ code: 1 }); // OK
      return result;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      span.recordException(error instanceof Error ? error : new Error(errorMessage));
      span.setAttributes({
        'error.message': errorMessage,
        'error.type': error instanceof Error ? error.constructor.name : 'UnknownError'
      });
      
      span.setStatus({ 
        code: 2, // ERROR
        message: errorMessage 
      });

      throw error;
    } finally {
      span.end();
    }
  }

  private async executeWithPolicies(
    gatewayUrl: string, 
    apiKey: string, 
    requestId: string, 
    span: Span
  ): Promise<GatewayResponse> {
    let attempt = 0;
    let lastError: Error | null = null;

    const executeRequest = async (): Promise<GatewayResponse> => {
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
        const config: AxiosRequestConfig = {
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
          timeout: 3000, // 3s read timeout
          // Note: Axios doesn't have separate connect timeout, 
          // but we can simulate with a custom adapter or use undici
        };

        const response: AxiosResponse = await this.httpClient.request(config);
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

      } catch (error) {
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

        // Don't retry on 4xx errors (client errors)
        if (axios.isAxiosError(error) && error.response?.status && error.response.status >= 400 && error.response.status < 500) {
          throw lastError;
        }

        throw lastError;
      }
    };

    // Execute with circuit breaker and retry logic
    try {
      return await this.circuitBreakerService.execute(executeRequest);
    } catch (error) {
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
