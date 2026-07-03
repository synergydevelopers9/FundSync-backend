import { Router } from 'express';
import {
  getDashboardStats,
  getMembers,
  getMemberProfile,
  updateMember,
  deleteMember,
  resetMemberPassword,
  createAnnouncement,
  deleteAnnouncement,
  getAuditLogs,
  exportMembersReport,
  exportRevenueReport,
  triggerBackup,
  createMember,
} from '../controllers/admin.controller';
import { authenticateJWT, requireRole } from '../middleware/auth.middleware';

const router = Router();

router.use(authenticateJWT);
router.use(requireRole(['ADMIN']));

router.get('/dashboard', getDashboardStats);
router.post('/members', createMember);
router.get('/members', getMembers);
router.get('/members/:id', getMemberProfile);
router.put('/members/:id', updateMember);
router.delete('/members/:id', deleteMember);
router.post('/members/:id/reset-password', resetMemberPassword);

router.post('/announcements', createAnnouncement);
router.delete('/announcements/:id', deleteAnnouncement);

router.get('/audit-logs', getAuditLogs);

router.post('/reports/members', exportMembersReport);
router.post('/reports/revenue', exportRevenueReport);

router.post('/backup', triggerBackup);

export default router;
