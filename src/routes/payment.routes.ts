import { Router } from 'express';
import {
  createOrder,
  confirmPayment,
  getPaymentsHistory,
} from '../controllers/payment.controller';
import { authenticateJWT, requireRole } from '../middleware/auth.middleware';

const router = Router();

router.use(authenticateJWT);

// Create checkout orders (Members only)
router.post('/order', requireRole(['MEMBER']), createOrder);

// Confirm checkout transactions (Members only)
router.post('/confirm', requireRole(['MEMBER']), confirmPayment);

// Retrieve listings (Admin reads all, Member reads relative history)
router.get('/history', getPaymentsHistory);

export default router;
