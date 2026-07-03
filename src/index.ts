import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import path from 'path';
import dotenv from 'dotenv';
import cookieParser from 'cookie-parser';

// Configure dotenv
dotenv.config();

// Import routers
import authRouter from './routes/auth.routes';
import planRouter from './routes/plan.routes';
import memberRouter from './routes/member.routes';
import adminRouter from './routes/admin.routes';
import paymentRouter from './routes/payment.routes';

const app = express();
const PORT = process.env.PORT || 5000;

// Security Middlewares
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' }, // Allows viewing receipts in browser
  })
);

const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',')
  : ['http://localhost:3000', 'http://127.0.0.1:3000', 'http://localhost:3001', 'http://127.0.0.1:3001'];

app.use(
  cors({
    origin: allowedOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
const expressCookieParser = require('cookie-parser');
app.use(expressCookieParser());

// Serve static resources securely
const publicDir = path.join(__dirname, '../public');
app.use('/receipts', express.static(path.join(publicDir, 'receipts')));
app.use('/reports', express.static(path.join(publicDir, 'reports')));
app.use('/backups', express.static(path.join(publicDir, 'backups')));

// Rate Limiter to protect endpoints from brute force / spamming
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200, // limit each IP to 200 requests per window
  message: { error: 'Too many requests from this IP. Please try again after 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30, // stricter limit of 30 logins/registrations per 15 minutes
  message: { error: 'Too many authentication attempts. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/api', apiLimiter);
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);
app.use('/api/auth/admin/login', authLimiter);

// Mount API Routers
app.use('/api/auth', authRouter);
app.use('/api/plans', planRouter);
app.use('/api/member', memberRouter);
app.use('/api/admin', adminRouter);
app.use('/api/payments', paymentRouter);

// Health check endpoint
app.get('/api/health', (req: Request, res: Response) => {
  res.json({
    status: 'healthy',
    timestamp: new Date(),
    uptime: process.uptime(),
    dbBackupEnabled: true,
  });
});

// 404 Handler
app.use((req: Request, res: Response) => {
  res.status(404).json({ error: `Path ${req.originalUrl} not found` });
});

// Global Error Handler
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  console.error('SERVER ERROR IN INTERCEPTOR:', err.stack || err);
  
  const isDev = process.env.NODE_ENV === 'development';
  return res.status(err.status || 500).json({
    error: isDev ? err.message : 'Internal Server Error',
    stack: isDev ? err.stack : undefined,
  });
});

app.listen(PORT, () => {
  console.log(`\n======================================================`);
  console.log(`[SERVER BOOT] ApexFinance API Server running on port ${PORT}`);
  console.log(`[ENVIRONMENT] Mode: ${process.env.NODE_ENV || 'development'}`);
  console.log(`[RECEIPTS DIR] path: ${path.join(publicDir, 'receipts')}`);
  console.log(`======================================================\n`);
});
