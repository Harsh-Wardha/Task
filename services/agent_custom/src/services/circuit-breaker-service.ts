export enum CircuitBreakerState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
  HALF_OPEN = 'HALF_OPEN'
}

export interface CircuitBreakerConfig {
  failureThreshold: number;
  resetTimeout: number;
  monitoringPeriod: number;
}

export class CircuitBreakerService {
  private state: CircuitBreakerState = CircuitBreakerState.CLOSED;
  private failureCount: number = 0;
  private lastFailureTime: number | null = null;
  private config: CircuitBreakerConfig;

  constructor(config?: Partial<CircuitBreakerConfig>) {
    this.config = {
      failureThreshold: config?.failureThreshold || 5, // Open after 5 consecutive failures
      resetTimeout: config?.resetTimeout || 30000, // 30 seconds
      monitoringPeriod: config?.monitoringPeriod || 60000 // 1 minute
    };
  }

  public getState(): CircuitBreakerState {
    this.checkStateTransition();
    return this.state;
  }

  public getFailureCount(): number {
    return this.failureCount;
  }

  public getLastFailureTime(): number | null {
    return this.lastFailureTime;
  }

  public async execute<T>(operation: () => Promise<T>): Promise<T> {
    this.checkStateTransition();

    if (this.state === CircuitBreakerState.OPEN) {
      throw new Error('Circuit breaker is OPEN - operation blocked');
    }

    // Implement retry logic with exponential backoff
    const maxAttempts = 5;
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const result = await operation();
        this.onSuccess();
        return result;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Unknown error');
        
        // Don't retry on 4xx errors (client errors)
        if (error && typeof error === 'object' && 'response' in error) {
          const axiosError = error as any;
          if (axiosError.response?.status >= 400 && axiosError.response?.status < 500) {
            this.onFailure();
            throw lastError;
          }
        }

        if (attempt === maxAttempts) {
          this.onFailure();
          throw lastError;
        }

        // Exponential backoff with jitter
        const baseDelay = Math.min(100 * Math.pow(2, attempt - 1), 3000);
        const jitter = Math.random() * 0.1 * baseDelay;
        const delay = baseDelay + jitter;
        
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    this.onFailure();
    throw lastError || new Error('All retry attempts failed');
  }

  private checkStateTransition(): void {
    const now = Date.now();

    if (this.state === CircuitBreakerState.OPEN) {
      if (this.lastFailureTime && (now - this.lastFailureTime) >= this.config.resetTimeout) {
        this.state = CircuitBreakerState.HALF_OPEN;
        this.failureCount = 0;
      }
    }
  }

  private onSuccess(): void {
    if (this.state === CircuitBreakerState.HALF_OPEN) {
      this.state = CircuitBreakerState.CLOSED;
    }
    this.failureCount = 0;
  }

  private onFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.failureCount >= this.config.failureThreshold) {
      this.state = CircuitBreakerState.OPEN;
    }
  }

  public reset(): void {
    this.state = CircuitBreakerState.CLOSED;
    this.failureCount = 0;
    this.lastFailureTime = null;
  }
}
