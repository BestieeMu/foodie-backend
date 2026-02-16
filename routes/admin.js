const express = require('express');
const { authMiddleware, requireRole } = require('../utils/auth');
const adminController = require('../controllers/adminController');

const router = express.Router();

// Restaurant Admin Routes
router.get('/admin/dashboard/stats', authMiddleware, requireRole('admin'), adminController.getRestaurantStats);
router.get('/admin/orders/my', authMiddleware, requireRole('admin'), adminController.getRestaurantOrders);

// Super Admin Routes
// We can use 'super_admin' role check. 
// Note: 'admin' role in requireRole checks strict equality in current utils/auth.js.
// We should update requireRole to allow hierarchy or be specific.
// For now, let's assume we update requireRole or use specific checks.

router.get('/super/stats', authMiddleware, requireRole('super_admin'), adminController.getSystemStats);
router.get('/super/restaurants', authMiddleware, requireRole('super_admin'), adminController.getAllRestaurants);
router.post('/super/restaurants', authMiddleware, requireRole('super_admin'), adminController.createRestaurant);
router.get('/super/users', authMiddleware, requireRole('super_admin'), adminController.getAllUsers);

module.exports = router;
