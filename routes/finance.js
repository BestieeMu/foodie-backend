const express = require('express');
const { authMiddleware, requireRole } = require('../utils/auth');
const financeController = require('../controllers/financeController');

const router = express.Router();

router.get('/admin/finance/wallet', authMiddleware, requireRole('admin'), financeController.getWallet);
router.post('/admin/finance/payout', authMiddleware, requireRole('admin'), financeController.requestPayout);

module.exports = router;
