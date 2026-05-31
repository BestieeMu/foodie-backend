const express = require('express');
const { authMiddleware, requireRole } = require('../utils/auth');
const financeController = require('../controllers/financeController');

const router = express.Router();

router.get('/admin/finance/wallet', authMiddleware, requireRole('admin'), financeController.getWallet);
router.post('/admin/finance/payout', authMiddleware, requireRole('admin'), financeController.requestPayout);

router.get('/super/finance/platform', authMiddleware, requireRole('super_admin'), financeController.getPlatformFinance);
router.get('/super/finance/payouts', authMiddleware, requireRole('super_admin'), financeController.getPayouts);
router.patch('/super/finance/payouts/:id', authMiddleware, requireRole('super_admin'), financeController.updatePayoutStatus);

module.exports = router;
