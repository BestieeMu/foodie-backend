CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS wallet_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_type TEXT NOT NULL CHECK (owner_type IN ('customer','driver','restaurant','platform')),
  owner_id TEXT NOT NULL,
  paystack_customer_code TEXT,
  paystack_virtual_account JSONB,
  balance NUMERIC NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'NGN',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(owner_type, owner_id)
);

CREATE TABLE IF NOT EXISTS wallet_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_id UUID NOT NULL REFERENCES wallet_accounts(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('credit','debit')),
  amount NUMERIC NOT NULL,
  reference TEXT,
  description TEXT,
  meta JSONB,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','success','failed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS earnings_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id TEXT REFERENCES orders(id) ON DELETE SET NULL,
  restaurant_id TEXT REFERENCES restaurants(id) ON DELETE SET NULL,
  driver_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  subtotal NUMERIC DEFAULT 0,
  tax NUMERIC DEFAULT 0,
  delivery_fee NUMERIC DEFAULT 0,
  platform_commission NUMERIC DEFAULT 0,
  restaurant_earning NUMERIC DEFAULT 0,
  driver_earning NUMERIC DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accrued','paid_out')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS transfer_recipients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_type TEXT NOT NULL CHECK (owner_type IN ('driver','restaurant')),
  owner_id TEXT NOT NULL,
  paystack_recipient_code TEXT NOT NULL,
  details JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(owner_type, owner_id)
);

CREATE INDEX IF NOT EXISTS idx_wallet_accounts_owner ON wallet_accounts(owner_type, owner_id);
CREATE INDEX IF NOT EXISTS idx_wallet_transactions_wallet ON wallet_transactions(wallet_id);
CREATE INDEX IF NOT EXISTS idx_earnings_ledger_restaurant ON earnings_ledger(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_earnings_ledger_driver ON earnings_ledger(driver_id);

ALTER TABLE wallet_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE wallet_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE earnings_ledger ENABLE ROW LEVEL SECURITY;

CREATE POLICY wallet_read_own ON wallet_accounts
  FOR SELECT TO authenticated
  USING (
    (owner_type IN ('customer','driver') AND owner_id = auth.uid()::text) OR
    (owner_type = 'restaurant' AND EXISTS (
      SELECT 1 FROM users u WHERE u.id::text = auth.uid()::text AND u.restaurant_id::text = wallet_accounts.owner_id
    )) OR
    (EXISTS (SELECT 1 FROM users u WHERE u.id::text = auth.uid()::text AND u.role = 'super_admin'))
  );

CREATE POLICY wallet_tx_read ON wallet_transactions
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM wallet_accounts w
      WHERE w.id = wallet_transactions.wallet_id AND
      (
        (w.owner_type IN ('customer','driver') AND w.owner_id = auth.uid()::text) OR
        (w.owner_type = 'restaurant' AND EXISTS (
          SELECT 1 FROM users u WHERE u.id::text = auth.uid()::text AND u.restaurant_id::text = w.owner_id
        )) OR
        (EXISTS (SELECT 1 FROM users u WHERE u.id::text = auth.uid()::text AND u.role = 'super_admin'))
      )
    )
  );

CREATE POLICY earnings_read ON earnings_ledger
  FOR SELECT TO authenticated
  USING (
    (EXISTS (SELECT 1 FROM users u WHERE u.id::text = auth.uid()::text AND u.role = 'super_admin')) OR
    (EXISTS (SELECT 1 FROM users u WHERE u.id::text = auth.uid()::text AND u.restaurant_id::text = earnings_ledger.restaurant_id)) OR
    (earnings_ledger.driver_id = auth.uid()::text)
  );
