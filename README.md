# Foodie Backend

Production-ready Express backend with JWT auth, role-based access, validation, and real-time delivery updates.

## Environment
- `PORT`: server port (default: `4000`)
- `JWT_SECRET`: secret for signing access tokens
- `JWT_REFRESH_SECRET`: secret for signing refresh tokens
- `CORS_ORIGIN`: allowed origin for CORS (default: `http://localhost:8082`)
- `NODE_ENV`: `development` or `production`

## Security
- Helmet, compression, morgan logging
- CORS restricted by `CORS_ORIGIN`
- Rate limit: 120 requests/min
- JWT access + refresh tokens
- Role-based access control (`customer`, `driver`, `admin`)
- Zod validation middleware for request bodies/params

## Real-time
Socket.IO emits:
- `orders:update` — `{ type: 'created' | 'status', order?: Order, orderId?: string, status?: string }`
- `delivery:update` — `{ type: 'accepted', orderId: string, driverId: string }`
- `driver:location` — `{ driverId: string, lat: number, lng: number, updatedAt: string }`

## Routes
Base path: `/api`

### Auth
- `POST /auth/signup` — create account (name, email, password, role)
- `POST /auth/login` — login (returns access/refresh)
- `POST /auth/refresh` — refresh access token

### Menu
- `GET /restaurants` — list restaurants
- `GET /menu/:restaurantId` — list menu items for restaurant

### Orders
- `POST /orders` — create order (customer only)
- `GET /orders/:orderId` — get order by id
- `GET /orders/user/:userId` — list orders for user
- `PATCH /orders/:orderId/status` — update status

### Delivery
- `GET /delivery/queue` — list available delivery orders (driver)
- `POST /delivery/accept` — driver accepts order (driver)
- `GET /delivery/driver/:driverId` — driver assigned orders (driver)
- `GET /delivery/location/:driverId` — get driver location (driver)
- `POST /delivery/location` — update driver location (driver)

### Profile
- `GET /profile/:userId` — get profile (self or admin)
- `PATCH /profile/:userId` — update profile (self or admin)

### Addresses
- `GET /addresses/:userId` — list user addresses (self or admin)
- `POST /addresses` — create address (self or admin)

### System
- `GET /settings` — get system settings (tax, commission, etc.)

### Payment
- `POST /payment/initialize` — initialize Paystack payment
- `GET /payment/verify/:reference` — verify Paystack payment

## Scripts
- `npm run dev` — start in dev with nodemon
- `npm start` — start production server
- `npm test` — run Jest tests

## Notes
- Database: Supabase (PostgreSQL)
- Ensure all environment variables in `.env.example` are set in production.