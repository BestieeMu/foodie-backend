const { z } = require('zod');

const sendMessageSchema = z.object({
  body: z.object({
    orderId: z.string().min(1),
    receiverId: z.string().min(1),
    content: z.string().min(1).max(2000),
    messageType: z.enum(['text', 'image', 'system']).default('text'),
  }),
});

const getMessagesSchema = z.object({
  params: z.object({
    orderId: z.string().min(1),
  }),
  query: z.object({
    limit: z.coerce.number().int().min(1).max(100).default(50),
    before: z.string().datetime().optional(), // cursor-based pagination
  }).optional(),
});

const markReadSchema = z.object({
  params: z.object({
    messageId: z.string().min(1),
  }),
});

module.exports = { sendMessageSchema, getMessagesSchema, markReadSchema };
