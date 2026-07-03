import { Router } from 'express';
import {
  getDashboardStats,
  getProfile,
  updateProfile,
  changePassword,
  getPayments,
  getNotifications,
  markNotificationsRead,
  getSupportTickets,
  createSupportTicket,
  subscribePlan,
} from '../controllers/member.controller';
import { authenticateJWT, requireRole } from '../middleware/auth.middleware';

const router = Router();

// Apply JWT authentication and MEMBER role restriction to all paths
router.use(authenticateJWT);
router.use(requireRole(['MEMBER']));

router.get('/dashboard', getDashboardStats);
router.get('/profile', getProfile);
router.put('/profile', updateProfile);
router.post('/change-password', changePassword);
router.get('/payments', getPayments);
router.get('/notifications', getNotifications);
router.patch('/notifications/read', markNotificationsRead);
router.get('/tickets', getSupportTickets);
router.post('/tickets', createSupportTicket);
router.post('/subscribe-plan', subscribePlan);

export default router;
