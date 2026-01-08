-- Users Table (stores customers, drivers, admins)
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('customer', 'driver', 'admin', 'super_admin')),
  restaurant_id TEXT, -- For admins and drivers
  push_token TEXT, -- For notifications
  phone TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Restaurants Table
CREATE TABLE IF NOT EXISTS restaurants (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  rating NUMERIC DEFAULT 0,
  categories TEXT[], -- Array of strings
  image_url TEXT,
  address TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Menu Items Table
CREATE TABLE IF NOT EXISTS menu_items (
  id TEXT PRIMARY KEY,
  restaurant_id TEXT REFERENCES restaurants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  price NUMERIC NOT NULL,
  category TEXT,
  image_url TEXT,
  is_available BOOLEAN DEFAULT TRUE,
  options JSONB, -- Stores { sizes, addOns, extras }
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Orders Table
CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id),
  restaurant_id TEXT REFERENCES restaurants(id),
  items JSONB NOT NULL, -- Stores array of items with options
  total NUMERIC NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'accepted', 'preparing', 'ready_for_pickup', 'on_the_way', 'delivered', 'cancelled', 'rejected')),
  delivery_address JSONB,
  payment_status TEXT DEFAULT 'pending',
  driver_id TEXT REFERENCES users(id),
  type TEXT DEFAULT 'delivery', -- 'delivery' or 'pickup'
  group_id TEXT, -- Link to group order
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Reviews Table
CREATE TABLE IF NOT EXISTS reviews (
  id TEXT PRIMARY KEY,
  restaurant_id TEXT REFERENCES restaurants(id),
  user_id TEXT REFERENCES users(id),
  order_id TEXT REFERENCES orders(id),
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Payouts Table
CREATE TABLE IF NOT EXISTS payouts (
  id TEXT PRIMARY KEY,
  restaurant_id TEXT REFERENCES restaurants(id),
  amount NUMERIC NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'rejected')),
  requested_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  processed_at TIMESTAMP WITH TIME ZONE
);

-- System Settings Table (Single Row)
CREATE TABLE IF NOT EXISTS system_settings (
  id INTEGER PRIMARY KEY DEFAULT 1,
  commission_rate NUMERIC DEFAULT 10,
  tax_rate NUMERIC DEFAULT 5,
  currency TEXT DEFAULT 'USD',
  support_email TEXT DEFAULT 'support@foodie.com',
  maintenance_mode BOOLEAN DEFAULT FALSE
);

-- Insert Default System Settings
INSERT INTO system_settings (id, commission_rate, tax_rate, currency, support_email, maintenance_mode)
VALUES (1, 10, 5, 'USD', 'support@foodie.com', FALSE)
ON CONFLICT (id) DO NOTHING;

-- Addresses Table
CREATE TABLE IF NOT EXISTS addresses (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  label TEXT,
  street TEXT,
  city TEXT,
  lat NUMERIC,
  lng NUMERIC,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Driver Locations Table
CREATE TABLE IF NOT EXISTS driver_locations (
  driver_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  lat NUMERIC,
  lng NUMERIC,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Group Orders Table
CREATE TABLE IF NOT EXISTS group_orders (
  id TEXT PRIMARY KEY,
  restaurant_id TEXT REFERENCES restaurants(id),
  creator_id TEXT REFERENCES users(id),
  status TEXT DEFAULT 'open', -- open, finalized
  invite_code TEXT,
  members JSONB, -- Array of userIds
  items JSONB, -- Array of items
  type TEXT DEFAULT 'delivery',
  schedule JSONB,
  pickup_address JSONB,
  delivery_address JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
