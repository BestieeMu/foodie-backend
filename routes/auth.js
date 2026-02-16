const express = require('express');
const { validate } = require('../middlewares/validate');
const { loginSchema, signupSchema, verifyOtpSchema, refreshSchema } = require('../schemas/auth');
const authController = require('../controllers/authController');
const { authLimiter } = require('../middlewares/rateLimiter');

const router = express.Router();

router.post('/login', authLimiter, validate(loginSchema), authController.login);
router.post('/signup', authLimiter, validate(signupSchema), authController.signup);
router.post('/verify-otp', authLimiter, validate(verifyOtpSchema), authController.verifyOtp);
router.post('/refresh', validate(refreshSchema), authController.refreshToken);

module.exports = router;
