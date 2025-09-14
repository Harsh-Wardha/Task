import { CircuitBreakerService } from './circuit-breaker-service';
import { Logger } from 'pino';
export interface GatewayResponse {
    status: number;
    data: any;
    headers: any;
    latency_ms: number;
    attempt: number;
}
export declare class GatewayService {
    private httpClient;
    private circuitBreakerService;
    private logger;
    constructor(circuitBreakerService: CircuitBreakerService, logger: Logger);
    makeOutboundCall(requestId: string): Promise<GatewayResponse>;
    private executeWithPolicies;
}
//# sourceMappingURL=gateway-service.d.ts.map