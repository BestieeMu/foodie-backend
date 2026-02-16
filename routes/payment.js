const express = require('express');
const { authMiddleware } = require('../utils/auth');
const paymentController = require('../controllers/paymentController');

const router = express.Router();

router.post('/payment/initialize', authMiddleware, paymentController.initPayment);
router.get('/payment/verify/:reference', authMiddleware, paymentController.verify);

module.exports = router;
