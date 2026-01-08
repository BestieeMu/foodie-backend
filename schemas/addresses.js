const { z } = require('zod');

const addressBase = z.object({
  label: z.string().min(2).max(50),
  street: z.string().min(3).max(120),
  city: z.string().min(2).max(60),
  lat: z.number().optional(),
  lng: z.number().optional(),
});

const createAddressSchema = z.object({
  body: addressBase.extend({ userId: z.string() }),
});

const getUserAddressesSchema = z.object({
  params: z.object({ userId: z.string() }),
});

module.exports = { createAddressSchema, getUserAddressesSchema };