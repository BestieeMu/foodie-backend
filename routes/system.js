const express = require('express');
const systemController = require('../controllers/systemController');

const router = express.Router();

router.get('/settings', systemController.getSettings);

module.exports = router;
