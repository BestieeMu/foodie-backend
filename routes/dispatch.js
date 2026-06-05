const express = require('express');
const { authMiddleware, requireRole } = require('../utils/auth');
const { validate } = require('../middlewares/validate');
const { dispatchSchema, dispatchResponseSchema } = require('../schemas/delivery');
const dispatchController = require('../controllers/dispatchController');

const router = express.Router();

// Trigger dispatch for an order (restaurant admin or super admin)
router.post(
  '/dispatch/trigger/:orderId',
  authMiddleware,
  requireRole(['admin', 'super_admin']),
  dispatchController.dispatchOrder
);

// Driver responds to dispatch request
router.post(
  '/dispatch/respond',
  authMiddleware,
  requireRole('driver'),
  validate(dispatchResponseSchema),
  dispatchController.respondToDispatch
);

// Get dispatch status for an order
router.get(
  '/dispatch/status/:orderId',
  authMiddleware,
  requireRole(['admin', 'super_admin', 'driver']),
  dispatchController.getDispatchStatus
);

module.exports = router;
