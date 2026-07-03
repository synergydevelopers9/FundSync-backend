"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const path_1 = __importDefault(require("path"));
const dotenv_1 = __importDefault(require("dotenv"));
// Configure dotenv
dotenv_1.default.config();
// Import routers
const auth_routes_1 = __importDefault(require("./routes/auth.routes"));
const plan_routes_1 = __importDefault(require("./routes/plan.routes"));
const member_routes_1 = __importDefault(require("./routes/member.routes"));
const admin_routes_1 = __importDefault(require("./routes/admin.routes"));
const payment_routes_1 = __importDefault(require("./routes/payment.routes"));
const app = (0, express_1.default)();
const PORT = process.env.PORT || 5000;
// Security Middlewares
app.use((0, helmet_1.default)({
    crossOriginResourcePolicy: { policy: 'cross-origin' }, // Allows viewing receipts in browser
}));
app.use((0, cors_1.default)({
    origin: ['http://localhost:3000', 'http://127.0.0.1:3000'],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(express_1.default.json());
app.use(express_1.default.urlencoded({ extended: true }));
const expressCookieParser = require('cookie-parser');
app.use(expressCookieParser());
// Serve static resources securely
const publicDir = path_1.default.join(__dirname, '../public');
app.use('/receipts', express_1.default.static(path_1.default.join(publicDir, 'receipts')));
app.use('/reports', express_1.default.static(path_1.default.join(publicDir, 'reports')));
app.use('/backups', express_1.default.static(path_1.default.join(publicDir, 'backups')));
// Rate Limiter to protect endpoints from brute force / spamming
const apiLimiter = (0, express_rate_limit_1.default)({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 200, // limit each IP to 200 requests per window
    message: { error: 'Too many requests from this IP. Please try again after 15 minutes.' },
    standardHeaders: true,
    legacyHeaders: false,
});
const authLimiter = (0, express_rate_limit_1.default)({
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
app.use('/api/auth', auth_routes_1.default);
app.use('/api/plans', plan_routes_1.default);
app.use('/api/member', member_routes_1.default);
app.use('/api/admin', admin_routes_1.default);
app.use('/api/payments', payment_routes_1.default);
// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({
        status: 'healthy',
        timestamp: new Date(),
        uptime: process.uptime(),
        dbBackupEnabled: true,
    });
});
// 404 Handler
app.use((req, res) => {
    res.status(404).json({ error: `Path ${req.originalUrl} not found` });
});
// Global Error Handler
app.use((err, req, res, next) => {
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
    console.log(`[RECEIPTS DIR] path: ${path_1.default.join(publicDir, 'receipts')}`);
    console.log(`======================================================\n`);
});
