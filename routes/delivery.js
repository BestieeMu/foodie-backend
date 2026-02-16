const express = require('express');
const { authMiddleware, requireRole } = require('../utils/auth');
const { validate } = require('../middlewares/validate');
const { acceptSchema, driverLocationUpdateSchema } = require('../schemas/delivery');
const deliveryController = require('../controllers/deliveryController');

const router = express.Router();

router.get('/delivery/queue', authMiddleware, requireRole('driver'), deliveryController.getAvailableOrders);
router.post('/delivery/accept', authMiddleware, requireRole('driver'), validate(acceptSchema), deliveryController.acceptOrder);
router.get('/delivery/driver/:driverId', authMiddleware, requireRole(['driver', 'admin']), deliveryController.getDriverOrders);
router.post('/delivery/location', authMiddleware, requireRole('driver'), deliveryController.updateDriverLocation); // New route for updating location
router.get('/delivery/location/:driverId', authMiddleware, requireRole(['driver', 'admin', 'customer']), deliveryController.getDriverLocation); // Customers need this for tracking

module.exports = router;
