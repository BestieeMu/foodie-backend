const express = require('express');
const systemController = require('../controllers/systemController');

const { authMiddleware, requireRole } = require('../utils/auth');

const router = express.Router();

router.get('/settings', systemController.getSettings);
router.get('/super/settings/platform', authMiddleware, requireRole('super_admin'), systemController.getPlatformSettings);
router.patch('/super/settings/platform', authMiddleware, requireRole('super_admin'), systemController.updatePlatformSettings);

module.exports = router;
