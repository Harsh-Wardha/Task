"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CircuitBreakerService = exports.CircuitBreakerState = void 0;
var CircuitBreakerState;
(function (CircuitBreakerState) {
    CircuitBreakerState["CLOSED"] = "CLOSED";
    CircuitBreakerState["OPEN"] = "OPEN";
    CircuitBreakerState["HALF_OPEN"] = "HALF_OPEN";
})(CircuitBreakerState || (exports.CircuitBreakerState = CircuitBreakerState = {}));
class CircuitBreakerService {
    state = CircuitBreakerState.CLOSED;
    failureCount = 0;
    lastFailureTime = null;
    config;
    constructor(config) {
        this.config = {
            failureThreshold: config?.failureThreshold || 5,
            resetTimeout: config?.resetTimeout || 30000,
            monitoringPeriod: config?.monitoringPeriod || 60000
        };
    }
    getState() {
        this.checkStateTransition();
        return this.state;
    }
    getFailureCount() {
        return this.failureCount;
    }
    getLastFailureTime() {
        return this.lastFailureTime;
    }
    async execute(operation) {
        this.checkStateTransition();
        if (this.state === CircuitBreakerState.OPEN) {
            throw new Error('Circuit breaker is OPEN - operation blocked');
        }
        const maxAttempts = 5;
        let lastError = null;
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            try {
                const result = await operation();
                this.onSuccess();
                return result;
            }
            catch (error) {
                lastError = error instanceof Error ? error : new Error('Unknown error');
                if (error && typeof error === 'object' && 'response' in error) {
                    const axiosError = error;
                    if (axiosError.response?.status >= 400 && axiosError.response?.status < 500) {
                        this.onFailure();
                        throw lastError;
                    }
                }
                if (attempt === maxAttempts) {
                    this.onFailure();
                    throw lastError;
                }
                const baseDelay = Math.min(100 * Math.pow(2, attempt - 1), 3000);
                const jitter = Math.random() * 0.1 * baseDelay;
                const delay = baseDelay + jitter;
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
        this.onFailure();
        throw lastError || new Error('All retry attempts failed');
    }
    checkStateTransition() {
        const now = Date.now();
        if (this.state === CircuitBreakerState.OPEN) {
            if (this.lastFailureTime && (now - this.lastFailureTime) >= this.config.resetTimeout) {
                this.state = CircuitBreakerState.HALF_OPEN;
                this.failureCount = 0;
            }
        }
    }
    onSuccess() {
        if (this.state === CircuitBreakerState.HALF_OPEN) {
            this.state = CircuitBreakerState.CLOSED;
        }
        this.failureCount = 0;
    }
    onFailure() {
        this.failureCount++;
        this.lastFailureTime = Date.now();
        if (this.failureCount >= this.config.failureThreshold) {
            this.state = CircuitBreakerState.OPEN;
        }
    }
    reset() {
        this.state = CircuitBreakerState.CLOSED;
        this.failureCount = 0;
        this.lastFailureTime = null;
    }
}
exports.CircuitBreakerService = CircuitBreakerService;
//# sourceMappingURL=circuit-breaker-service.js.map