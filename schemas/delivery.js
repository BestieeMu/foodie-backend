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

// Intelligent dispatch: find nearby drivers
const dispatchSchema = z.object({
  params: z.object({
    orderId: z.string().min(1),
  }),
});

// Driver responds to dispatch request
const dispatchResponseSchema = z.object({
  body: z.object({
    driverId: z.string().min(1),
    orderId: z.string().min(1),
    accepted: z.boolean(),
  }),
});

// Driver heartbeat for liveness + busy status
const driverHeartbeatSchema = z.object({
  body: z.object({
    driverId: z.string().min(1),
    lat: z.number(),
    lng: z.number(),
    isBusy: z.boolean().optional(),
  }),
});

module.exports = {
  acceptSchema,
  driverLocationUpdateSchema,
  dispatchSchema,
  dispatchResponseSchema,
  driverHeartbeatSchema,
};