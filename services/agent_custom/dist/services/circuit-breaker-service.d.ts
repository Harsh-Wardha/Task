export declare enum CircuitBreakerState {
    CLOSED = "CLOSED",
    OPEN = "OPEN",
    HALF_OPEN = "HALF_OPEN"
}
export interface CircuitBreakerConfig {
    failureThreshold: number;
    resetTimeout: number;
    monitoringPeriod: number;
}
export declare class CircuitBreakerService {
    private state;
    private failureCount;
    private lastFailureTime;
    private config;
    constructor(config?: Partial<CircuitBreakerConfig>);
    getState(): CircuitBreakerState;
    getFailureCount(): number;
    getLastFailureTime(): number | null;
    execute<T>(operation: () => Promise<T>): Promise<T>;
    private checkStateTransition;
    private onSuccess;
    private onFailure;
    reset(): void;
}
//# sourceMappingURL=circuit-breaker-service.d.ts.map