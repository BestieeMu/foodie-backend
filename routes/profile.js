const express = require('express');
const { authMiddleware } = require('../utils/auth');
const { validate } = require('../middlewares/validate');
const { updateProfileSchema } = require('../schemas/profile');
const profileController = require('../controllers/profileController');

const router = express.Router();

router.get('/profile/:userId', authMiddleware, profileController.getProfile);
router.patch('/profile/:userId', authMiddleware, validate(updateProfileSchema), profileController.updateProfile);

module.exports = router;
