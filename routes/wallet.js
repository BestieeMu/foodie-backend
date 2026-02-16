const express = require('express');
const { authMiddleware } = require('../utils/auth');
const walletController = require('../controllers/walletController');

const router = express.Router();

router.get('/wallet', authMiddleware, walletController.getWallet);
router.get('/wallet/transactions', authMiddleware, walletController.getTransactions);
router.post('/wallet/setup', authMiddleware, walletController.setupVirtualAccount);
router.post('/wallet/withdraw', authMiddleware, walletController.withdraw);

module.exports = router;
