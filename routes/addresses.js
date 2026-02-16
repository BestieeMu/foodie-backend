const express = require('express');
const { authMiddleware } = require('../utils/auth');
const { validate } = require('../middlewares/validate');
const { createAddressSchema, getUserAddressesSchema } = require('../schemas/addresses');
const addressController = require('../controllers/addressController');

const router = express.Router();

router.get('/addresses/:userId', authMiddleware, validate(getUserAddressesSchema), addressController.getUserAddresses);
router.post('/addresses', authMiddleware, validate(createAddressSchema), addressController.createAddress);

module.exports = router;
