const { z } = require('zod');

const acceptSchema = z.object({
  body: z.object({
    driverId: z.string().min(1),
    orderId: z.string().min(1),
  }),
});

const driverLocationUpdateSchema = z.object({
  body: z.object({
    driverId: z.string().min(1),
    lat: z.number(),
    lng: z.number(),
  }),
});

module.exports = { acceptSchema, driverLocationUpdateSchema };