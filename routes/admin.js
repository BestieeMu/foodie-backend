const express = require('express');
const { authMiddleware, requireRole } = require('../utils/auth');
const adminController = require('../controllers/adminController');

const router = express.Router();

// Restaurant Admin Routes
router.get('/admin/dashboard/stats', authMiddleware, requireRole('admin'), adminController.getRestaurantStats);
router.get('/admin/orders/my', authMiddleware, requireRole('admin'), adminController.getRestaurantOrders);
router.get('/admin/restaurant/my', authMiddleware, requireRole('admin'), adminController.getMyRestaurant);
router.patch('/admin/restaurant/my', authMiddleware, requireRole('admin'), adminController.updateMyRestaurant);

router.get('/admin/staff/my', authMiddleware, requireRole('admin'), adminController.getMyStaff);
router.post('/admin/staff', authMiddleware, requireRole('admin'), adminController.createStaff);
router.patch('/admin/staff/:id', authMiddleware, requireRole('admin'), adminController.updateStaff);
router.delete('/admin/staff/:id', authMiddleware, requireRole('admin'), adminController.deleteStaff);

router.get('/admin/customers/my', authMiddleware, requireRole('admin'), adminController.getMyCustomers);
router.get('/admin/reviews/my', authMiddleware, requireRole('admin'), adminController.getMyReviews);

const menuController = require('../controllers/menuController');
router.get('/admin/menu/my', authMiddleware, requireRole('admin'), menuController.getMyMenu);
router.post('/admin/menu/item', authMiddleware, requireRole('admin'), menuController.createMenuItem);
router.patch('/admin/menu/item/:id', authMiddleware, requireRole('admin'), menuController.updateMenuItem);
router.delete('/admin/menu/item/:id', authMiddleware, requireRole('admin'), menuController.deleteMenuItem);

// Super Admin Routes
// We can use 'super_admin' role check. 
// Note: 'admin' role in requireRole checks strict equality in current utils/auth.js.
// We should update requireRole to allow hierarchy or be specific.
// For now, let's assume we update requireRole or use specific checks.

router.get('/super/stats', authMiddleware, requireRole('super_admin'), adminController.getSystemStats);
router.get('/super/restaurants', authMiddleware, requireRole('super_admin'), adminController.getAllRestaurants);
router.post('/super/restaurants', authMiddleware, requireRole('super_admin'), adminController.createRestaurant);
router.patch('/super/restaurants/:id', authMiddleware, requireRole('super_admin'), adminController.updateRestaurant);
router.delete('/super/restaurants/:id', authMiddleware, requireRole('super_admin'), adminController.deleteRestaurant);
router.get('/super/users', authMiddleware, requireRole('super_admin'), adminController.getAllUsers);
router.get('/super/orders/all', authMiddleware, requireRole('super_admin'), adminController.getAllOrders);

module.exports = router;
