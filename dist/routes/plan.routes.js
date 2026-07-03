"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const plan_controller_1 = require("../controllers/plan.controller");
const auth_middleware_1 = require("../middleware/auth.middleware");
const router = (0, express_1.Router)();
// Retrieve plans (open to active queries, gets filtered for non-admins)
router.get('/', (req, res, next) => {
    // Optional auth to determine if admin views archived items
    const authHeader = req.headers.authorization;
    if (authHeader) {
        return (0, auth_middleware_1.authenticateJWT)(req, res, next);
    }
    next();
}, plan_controller_1.getPlans);
router.get('/:id', plan_controller_1.getPlanById);
// Admin-only modifying configurations
router.post('/', auth_middleware_1.authenticateJWT, (0, auth_middleware_1.requireRole)(['ADMIN']), plan_controller_1.createPlan);
router.put('/:id', auth_middleware_1.authenticateJWT, (0, auth_middleware_1.requireRole)(['ADMIN']), plan_controller_1.updatePlan);
router.patch('/:id/status', auth_middleware_1.authenticateJWT, (0, auth_middleware_1.requireRole)(['ADMIN']), plan_controller_1.togglePlanStatus);
router.delete('/:id', auth_middleware_1.authenticateJWT, (0, auth_middleware_1.requireRole)(['ADMIN']), plan_controller_1.deletePlan);
exports.default = router;
