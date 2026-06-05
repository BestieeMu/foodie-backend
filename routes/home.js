const express = require('express');
const router = express.Router();
const homeController = require('../controllers/homeController');


// We use an optional auth middleware here if we want to extract user info for recommendations,
// but the home screen should also load without auth.
// If the app always passes a token, we can use requireAuth, but let's just let the controller 
// check if req.user exists or grab userId from query.
router.get('/', homeController.getHomeData);

module.exports = router;
