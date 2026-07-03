"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const payment_controller_1 = require("../controllers/payment.controller");
const auth_middleware_1 = require("../middleware/auth.middleware");
const router = (0, express_1.Router)();
router.use(auth_middleware_1.authenticateJWT);
// Create checkout orders (Members only)
router.post('/order', (0, auth_middleware_1.requireRole)(['MEMBER']), payment_controller_1.createOrder);
// Confirm checkout transactions (Members only)
router.post('/confirm', (0, auth_middleware_1.requireRole)(['MEMBER']), payment_controller_1.confirmPayment);
// Retrieve listings (Admin reads all, Member reads relative history)
router.get('/history', payment_controller_1.getPaymentsHistory);
exports.default = router;
