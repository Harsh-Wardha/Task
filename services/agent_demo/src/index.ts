import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import pino from 'pino';
import pinoHttp from 'pino-http';
import { trace } from '@opentelemetry/api';

// Initialize OpenTelemetry
import './tracing';

const logger = pino({
  level: process.env['LOG_LEVEL'] || 'info',
  formatters: {
    level: (label) => ({ level: label }),
  },
});

const app = express();
const PORT = process.env['PORT'] || 3001;

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());

// Request logging middleware
app.use(pinoHttp({
  logger,
  genReqId: () => crypto.randomUUID(),
  customLogLevel: (_req, res, err) => {
    if (res.statusCode >= 400 && res.statusCode < 500) {
      return 'warn';
    } else if (res.statusCode >= 500 || err) {
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

// Health check endpoint
app.get('/health', (req, res) => {
  const startTime = Date.now();
  const tracer = trace.getTracer('agent-demo');
  const span = tracer.startSpan('health-check');
  
  try {
    span.setAttributes({
      'service.name': 'agent_demo',
      'endpoint': '/health',
      'method': 'GET'
    });

    const healthData = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      service: 'agent_demo',
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      version: process.env['npm_package_version'] || '1.0.0'
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
  } catch (error) {
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
  } finally {
    span.end();
  }
});

// 404 handler
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

// Error handler
app.use((err: Error, req: express.Request, res: express.Response, _next: express.NextFunction) => {
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
    service: 'agent_demo',
    environment: process.env['NODE_ENV'] || 'development'
  }, 'Agent Demo service started');
});

export default app;
