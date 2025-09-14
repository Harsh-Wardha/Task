# Node.js Microservices Demo

A demonstration of two isolated Node.js/TypeScript services (`agent_demo` and `agent_custom`) orchestrated with Docker Compose, featuring retry logic, circuit breakers, structured logging, and OpenTelemetry tracing.

## Architecture

### Services

- **agent_demo**: Simple health check service
  - `GET /health` → Returns 200 within 10s
  - Basic health monitoring and metrics

- **agent_custom**: Advanced service with outbound HTTP calls
  - `GET /health` → Returns 200 within 10s with circuit breaker status
  - `POST /run` → Performs outbound HTTP calls with retry logic and circuit breaker

### Features

- **Retry Logic**: Exponential backoff with jitter (3-5 attempts, max backoff ≤ 3s)
- **Circuit Breaker**: Opens after 5 consecutive failures, resets after 30s
- **Structured Logging**: JSON logs with request_id, method, path, status, latency_ms, attempt
- **OpenTelemetry Tracing**: Distributed tracing with Jaeger
- **Security**: Server-side environment variables only, no client-side API key leakage
- **Observability**: Health checks, metrics, and comprehensive logging

## Quick Start

### Prerequisites

- Docker and Docker Compose
- Node.js 18+ (for local development)
- Git

### Running with Docker Compose

1. **Clone the repository**:
   ```bash
   git clone <repository-url>
   cd nodejs-microservices-demo
   ```

2. **Start all services**:
   ```bash
   docker-compose up -d
   ```

3. **Verify services are running**:
   ```bash
   # Check agent_demo health
   curl http://localhost:3001/health
   
   # Check agent_custom health
   curl http://localhost:3002/health
   
   # Test the run endpoint
   curl -X POST http://localhost:3002/run \
     -H "Content-Type: application/json" \
     -d '{"test": "data"}'
   ```

4. **View logs**:
   ```bash
   docker-compose logs -f
   ```

5. **Access Jaeger UI**:
   Open http://localhost:16686 in your browser

### Development Mode

For development with hot reloading:

```bash
docker-compose -f docker-compose.dev.yml up -d
```

## API Endpoints

### Agent Demo Service (Port 3001)

- `GET /health` - Health check endpoint

### Agent Custom Service (Port 3002)

- `GET /health` - Health check with circuit breaker status
- `POST /run` - Execute outbound HTTP call with retry logic

## Environment Variables

Copy `env.example` to `.env` and configure:

```bash
cp env.example .env
```

Key variables:
- `GATEWAY_URL`: Target URL for outbound HTTP calls
- `GATEWAY_API_KEY`: API key for authentication
- `LOG_LEVEL`: Logging level (debug, info, warn, error)
- `JAEGER_ENDPOINT`: Jaeger tracing endpoint

## Testing Circuit Breaker and Retries

The demo includes a mock gateway service that can simulate failures:

1. **Normal operation**: Services respond successfully
2. **Simulate failures**: Modify mock gateway expectations
3. **Observe circuit breaker**: Watch logs for circuit breaker state changes
4. **Monitor retries**: Check logs for retry attempts with exponential backoff

## Observability

### Structured Logging

All services use structured JSON logging with fields:
- `ts`: Timestamp
- `level`: Log level
- `request_id`: Unique request identifier
- `method`: HTTP method
- `path`: Request path
- `status`: HTTP status code
- `latency_ms`: Request latency
- `attempt`: Retry attempt number

### OpenTelemetry Tracing

- Distributed tracing across services
- Jaeger UI at http://localhost:16686
- Request correlation with request_id
- Performance monitoring and debugging

### Health Checks

- Docker health checks for all services
- Circuit breaker status in agent_custom health endpoint
- Service uptime and memory usage metrics

## CI/CD Pipeline

The project includes a GitHub Actions workflow (`.github/workflows/ci.yml`) that:

1. **Install dependencies** and run type checking
2. **Lint code** with ESLint
3. **Build services** and run tests
4. **Build Docker images**
5. **Run Trivy security scan** (fails on high/critical vulnerabilities)
6. **Upload deployment artifact** as ZIP file

## Tech Stack

- **Runtime**: Node.js 18, TypeScript
- **HTTP Client**: Axios
- **Retry/Circuit Breaker**: Cockatiel
- **Logging**: Pino
- **Tracing**: OpenTelemetry + Jaeger
- **Containerization**: Docker, Docker Compose
- **Security**: Trivy vulnerability scanning

## Project Structure

```
├── services/
│   ├── agent_demo/          # Simple health check service
│   │   ├── src/
│   │   ├── Dockerfile
│   │   └── package.json
│   └── agent_custom/        # Advanced service with outbound calls
│       ├── src/
│       │   └── services/    # Circuit breaker and gateway services
│       ├── Dockerfile
│       └── package.json
├── mock-gateway/            # Mock server for testing
├── .github/workflows/       # CI/CD pipeline
├── docker-compose.yml       # Production configuration
├── docker-compose.dev.yml   # Development configuration
└── README.md
```

## Security Considerations

- No client-side API key exposure
- Server-side environment variable configuration
- Non-root Docker containers
- Vulnerability scanning in CI/CD
- Structured logging without sensitive data exposure

## Monitoring and Debugging

1. **Service Logs**: `docker-compose logs -f [service-name]`
2. **Jaeger Traces**: http://localhost:16686
3. **Health Endpoints**: Monitor service health and circuit breaker status
4. **Docker Health Checks**: Automatic container health monitoring

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make changes with proper tests
4. Ensure CI/CD pipeline passes
5. Submit a pull request

## License

MIT License - see LICENSE file for details.
