const express = require('express');
const { authMiddleware, requireRole } = require('../utils/auth');
const { validate } = require('../middlewares/validate');
const { 
  groupCreateSchema, 
  groupJoinSchema, 
  groupAddItemSchema,
  groupRemoveItemSchema,
  groupUpdateItemSchema
} = require('../schemas/group');
const groupController = require('../controllers/groupController');

const router = express.Router();

router.post('/group/create', authMiddleware, requireRole('customer'), validate(groupCreateSchema), groupController.createGroup);
router.post('/group/join', authMiddleware, requireRole('customer'), validate(groupJoinSchema), groupController.joinGroup);
router.get('/group/:groupId', authMiddleware, requireRole(['customer', 'super_admin']), groupController.getGroupDetails);
router.post('/group/item', authMiddleware, requireRole('customer'), validate(groupAddItemSchema), groupController.addItem);
router.delete('/group/item', authMiddleware, requireRole('customer'), validate(groupRemoveItemSchema), groupController.removeItem);
router.patch('/group/item', authMiddleware, requireRole('customer'), validate(groupUpdateItemSchema), groupController.updateItemQuantity);
router.post('/group/:groupId/finalize', authMiddleware, requireRole('customer'), groupController.finalizeGroupOrder);

module.exports = router;
