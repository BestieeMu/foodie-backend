const express = require('express');
const { authMiddleware, requireRole } = require('../utils/auth');
const { validate } = require('../middlewares/validate');
const { createOrderSchema, updateOrderStatusSchema } = require('../schemas/orders');
const orderController = require('../controllers/orderController');

const router = express.Router();

router.post('/orders', authMiddleware, requireRole('customer'), validate(createOrderSchema), orderController.createOrder);
router.get('/orders/:orderId', authMiddleware, orderController.getOrderById); // Role check inside controller
router.get('/orders/user/:userId', authMiddleware, orderController.getUserOrders); // Role check inside controller
router.patch('/orders/:orderId/status', authMiddleware, validate(updateOrderStatusSchema), orderController.updateOrderStatus); // Role check inside controller

module.exports = router;
