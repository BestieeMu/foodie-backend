const express = require('express');
const menuController = require('../controllers/menuController');

const router = express.Router();

router.get('/menu/restaurants', menuController.getRestaurants);
router.get('/menu/restaurants/:id/items', menuController.getRestaurantItems);

module.exports = router;
