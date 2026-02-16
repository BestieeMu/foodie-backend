-- Policies only for wallet-related tables. No table creations.
-- Ensures idempotent creation with DO blocks and pg_policies checks.

ALTER TABLE IF EXISTS wallet_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS wallet_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS earnings_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS transfer_recipients ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'wallet_accounts' AND policyname = 'wallet_read_own'
  ) THEN
    EXECUTE $pol$
      CREATE POLICY wallet_read_own ON wallet_accounts
        FOR SELECT TO authenticated
        USING (
          (owner_type IN ('customer','driver') AND owner_id = auth.uid()::text) OR
          (owner_type = 'restaurant' AND EXISTS (
            SELECT 1 FROM users u WHERE u.id::text = auth.uid()::text AND u.restaurant_id::text = wallet_accounts.owner_id
          )) OR
          (EXISTS (SELECT 1 FROM users u WHERE u.id::text = auth.uid()::text AND u.role = 'super_admin'))
        );
    $pol$;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'wallet_accounts' AND policyname = 'wallet_accounts_insert_service'
  ) THEN
    EXECUTE $pol$
      CREATE POLICY wallet_accounts_insert_service ON wallet_accounts
        FOR INSERT TO authenticated
        WITH CHECK (auth.role() = 'service_role');
    $pol$;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'wallet_accounts' AND policyname = 'wallet_accounts_update_service'
  ) THEN
    EXECUTE $pol$
      CREATE POLICY wallet_accounts_update_service ON wallet_accounts
        FOR UPDATE TO authenticated
        USING (auth.role() = 'service_role')
        WITH CHECK (auth.role() = 'service_role');
    $pol$;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'wallet_transactions' AND policyname = 'wallet_tx_read'
  ) THEN
    EXECUTE $pol$
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
    $pol$;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'wallet_transactions' AND policyname = 'wallet_tx_insert_service'
  ) THEN
    EXECUTE $pol$
      CREATE POLICY wallet_tx_insert_service ON wallet_transactions
        FOR INSERT TO authenticated
        WITH CHECK (auth.role() = 'service_role');
    $pol$;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'wallet_transactions' AND policyname = 'wallet_tx_update_service'
  ) THEN
    EXECUTE $pol$
      CREATE POLICY wallet_tx_update_service ON wallet_transactions
        FOR UPDATE TO authenticated
        USING (auth.role() = 'service_role')
        WITH CHECK (auth.role() = 'service_role');
    $pol$;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'earnings_ledger' AND policyname = 'earnings_read'
  ) THEN
    EXECUTE $pol$
      CREATE POLICY earnings_read ON earnings_ledger
        FOR SELECT TO authenticated
        USING (
          (EXISTS (SELECT 1 FROM users u WHERE u.id::text = auth.uid()::text AND u.role = 'super_admin')) OR
          (EXISTS (SELECT 1 FROM users u WHERE u.id::text = auth.uid()::text AND u.restaurant_id::text = earnings_ledger.restaurant_id)) OR
          (earnings_ledger.driver_id = auth.uid()::text)
        );
    $pol$;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'earnings_ledger' AND policyname = 'earnings_insert_service'
  ) THEN
    EXECUTE $pol$
      CREATE POLICY earnings_insert_service ON earnings_ledger
        FOR INSERT TO authenticated
        WITH CHECK (auth.role() = 'service_role');
    $pol$;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'earnings_ledger' AND policyname = 'earnings_update_service'
  ) THEN
    EXECUTE $pol$
      CREATE POLICY earnings_update_service ON earnings_ledger
        FOR UPDATE TO authenticated
        USING (auth.role() = 'service_role')
        WITH CHECK (auth.role() = 'service_role');
    $pol$;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'transfer_recipients' AND policyname = 'transfer_recipients_read'
  ) THEN
    EXECUTE $pol$
      CREATE POLICY transfer_recipients_read ON transfer_recipients
        FOR SELECT TO authenticated
        USING (
          (owner_type IN ('driver') AND owner_id = auth.uid()::text) OR
          (owner_type = 'restaurant' AND EXISTS (
            SELECT 1 FROM users u WHERE u.id::text = auth.uid()::text AND u.restaurant_id::text = transfer_recipients.owner_id
          )) OR
          (EXISTS (SELECT 1 FROM users u WHERE u.id::text = auth.uid()::text AND u.role = 'super_admin'))
        );
    $pol$;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'transfer_recipients' AND policyname = 'transfer_recipients_insert_service'
  ) THEN
    EXECUTE $pol$
      CREATE POLICY transfer_recipients_insert_service ON transfer_recipients
        FOR INSERT TO authenticated
        WITH CHECK (auth.role() = 'service_role');
    $pol$;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'transfer_recipients' AND policyname = 'transfer_recipients_update_service'
  ) THEN
    EXECUTE $pol$
      CREATE POLICY transfer_recipients_update_service ON transfer_recipients
        FOR UPDATE TO authenticated
        USING (auth.role() = 'service_role')
        WITH CHECK (auth.role() = 'service_role');
    $pol$;
  END IF;
END $$;
