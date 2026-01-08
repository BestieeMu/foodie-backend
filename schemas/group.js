const { z } = require('zod');

const groupCreateSchema = z.object({
  body: z.object({
    userId: z.string().min(1),
    restaurantId: z.string().min(1),
    type: z.enum(['delivery', 'pickup']).default('delivery'),
    schedule: z.string().datetime().optional(),
    pickupAddress: z.object({ address: z.string().min(3) }).optional(),
    deliveryAddress: z.object({ address: z.string().min(3) }).optional(),
  }),
});

const groupJoinSchema = z.object({
  body: z.object({
    userId: z.string().min(1),
    groupId: z.string().min(1).optional(),
    inviteCode: z.string().min(4).optional(),
  }).refine((val) => !!val.groupId || !!val.inviteCode, {
    message: 'groupId or inviteCode required',
    path: ['groupId'],
  }),
});

const groupAddItemSchema = z.object({
  body: z.object({
    groupId: z.string().min(1),
    userId: z.string().min(1),
    itemId: z.string().min(1),
    quantity: z.number().int().min(1).default(1),
    choice: z.object({
      sizeId: z.string().optional(),
      addOnIds: z.array(z.string()).optional(),
      extraIds: z.array(z.string()).optional(),
    }).optional(),
  }),
});

const groupFinalizeSchema = z.object({
  body: z.object({
    groupId: z.string().min(1),
    pickupAddress: z.object({ address: z.string().min(3) }).optional(),
    deliveryAddress: z.object({ address: z.string().min(3) }).optional(),
  }),
});

module.exports = {
  groupCreateSchema,
  groupJoinSchema,
  groupAddItemSchema,
  groupFinalizeSchema,
};