import { Router } from 'express';
import {
  createPlan,
  getPlans,
  getPlanById,
  updatePlan,
  togglePlanStatus,
  deletePlan,
} from '../controllers/plan.controller';
import { authenticateJWT, requireRole } from '../middleware/auth.middleware';

const router = Router();

// Retrieve plans (open to active queries, gets filtered for non-admins)
router.get('/', (req, res, next) => {
  // Optional auth to determine if admin views archived items
  const authHeader = req.headers.authorization;
  if (authHeader) {
    return authenticateJWT(req, res, next);
  }
  next();
}, getPlans);

router.get('/:id', getPlanById);

// Admin-only modifying configurations
router.post('/', authenticateJWT, requireRole(['ADMIN']), createPlan);
router.put('/:id', authenticateJWT, requireRole(['ADMIN']), updatePlan);
router.patch('/:id/status', authenticateJWT, requireRole(['ADMIN']), togglePlanStatus);
router.delete('/:id', authenticateJWT, requireRole(['ADMIN']), deletePlan);

export default router;
