const express = require('express');
const { authMiddleware, requireRole } = require('../utils/auth');
const { validate } = require('../middlewares/validate');
const { sendMessageSchema } = require('../schemas/chat');
const chatController = require('../controllers/chatController');

const router = express.Router();

router.post('/chat/send', authMiddleware, validate(sendMessageSchema), chatController.sendMessage);
router.get('/chat/:orderId', authMiddleware, chatController.getOrderMessages);
router.patch('/chat/:orderId/read', authMiddleware, chatController.markMessagesRead);

module.exports = router;
