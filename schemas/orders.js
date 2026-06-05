const { z } = require('zod');

// Modifier selection for complex item customization
const modifierSelectionSchema = z.object({
  groupId: z.string(),
  groupName: z.string().optional(),
  optionId: z.string(),
  optionName: z.string().optional(),
  priceDelta: z.number().default(0),
});

const orderItemSchema = z.object({
  itemId: z.string(),
  quantity: z.number().int().min(1).default(1),
  choice: z.object({
    sizeId: z.string().optional(),
    addOnIds: z.array(z.string()).optional(),
    extraIds: z.array(z.string()).optional(),
  }).optional(),
  // Enhanced: complex modifier selections
  modifiers: z.array(modifierSelectionSchema).optional(),
  specialInstructions: z.string().max(500).optional(),
});

const addressSchema = z.object({
  address: z.string().min(3),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
});

const createOrderSchema = z.object({
  body: z.object({
    userId: z.string().min(1),
    restaurantId: z.string().min(1),
    items: z.array(orderItemSchema).min(1),
    type: z.enum(['delivery', 'pickup']).default('delivery'),
    schedule: z.string().datetime().optional(),
    pickupAddress: addressSchema.optional(),
    deliveryAddress: addressSchema.optional(),
    gift: z.boolean().default(false),
    giftMessage: z.string().max(200).optional(),
    recipientName: z.string().optional(),
  }),
});

const updateOrderStatusSchema = z.object({
  params: z.object({ orderId: z.string().min(1) }),
  body: z.object({
    status: z.enum(['pending','confirmed','accepted','preparing','ready_for_pickup','arrived_pickup','picked_up','on_the_way','delivered','cancelled','rejected','scheduled']),
    deliveryCode: z.string().regex(/^\d{6}$/).optional(),
    // Driver coordinates for routing history tracking
    driverLat: z.number().optional(),
    driverLng: z.number().optional(),
    cancellationReason: z.string().optional(),
  }),
});

module.exports = { createOrderSchema, updateOrderStatusSchema, modifierSelectionSchema };
