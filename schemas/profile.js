const { z } = require('zod');

const updateProfileSchema = z.object({
  body: z.object({
    name: z.string().min(2).max(80).optional(),
    phone: z.string().min(7).max(20).optional(),
  }),
  params: z.object({
    userId: z.string(),
  }),
});

module.exports = { updateProfileSchema };