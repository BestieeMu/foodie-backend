const supabase = require('../utils/supabase');
const paystack = require('../utils/paystack');

async function ensureWallet(ownerType, ownerId) {
  const { data, error } = await supabase
    .from('wallet_accounts')
    .select('*')
    .eq('owner_type', ownerType)
    .eq('owner_id', ownerId)
    .single();
  if (data) return data;
  const { data: created, error: insErr } = await supabase
    .from('wallet_accounts')
    .insert({ owner_type: ownerType, owner_id: ownerId })
    .select()
    .single();
  if (insErr) throw new Error('Failed to create wallet');
  return created;
}

const getWallet = async (req, res) => {
  try {
    const user = req.user;
    if (user.role === 'admin' && user.restaurant_id) {
      const wallet = await ensureWallet('restaurant', user.restaurant_id);
      return res.json(wallet);
    }
    const wallet = await ensureWallet(user.role === 'driver' ? 'driver' : 'customer', user.id);
    res.json(wallet);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

const getTransactions = async (req, res) => {
  try {
    const user = req.user;
    let wallet;
    if (user.role === 'admin' && user.restaurant_id) {
      wallet = await ensureWallet('restaurant', user.restaurant_id);
    } else {
      wallet = await ensureWallet(user.role === 'driver' ? 'driver' : 'customer', user.id);
    }
    const { data, error } = await supabase
      .from('wallet_transactions')
      .select('*')
      .eq('wallet_id', wallet.id)
      .order('created_at', { ascending: false });
    if (error) throw error;
    res.json(data || []);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

const setupVirtualAccount = async (req, res) => {
  try {
    const user = req.user;
    const ownerType = user.role === 'driver' ? 'driver' : (user.role === 'admin' && user.restaurant_id ? 'restaurant' : 'customer');
    const ownerId = ownerType === 'restaurant' ? user.restaurant_id : user.id;
    const wallet = await ensureWallet(ownerType, ownerId);
    let customerCode = wallet.paystack_customer_code;
    if (!customerCode) {
      const customer = await paystack.createCustomer({ email: user.email, name: user.name, phone: user.phone });
      customerCode = customer.data.customer_code;
    }
    const dva = await paystack.createDedicatedAccount({ customer: customerCode });
    const vaPayload = dva.data;
    const { data: updated, error } = await supabase
      .from('wallet_accounts')
      .update({ paystack_customer_code: customerCode, paystack_virtual_account: vaPayload, updated_at: new Date().toISOString() })
      .eq('id', wallet.id)
      .select()
      .single();
    if (error) throw error;
    res.json(updated);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

const withdraw = async (req, res) => {
  try {
    const { amount, bank_code, account_number, account_name } = req.body;
    const user = req.user;
    const ownerType = user.role === 'driver' ? 'driver' : (user.role === 'admin' && user.restaurant_id ? 'restaurant' : 'customer');
    const ownerId = ownerType === 'restaurant' ? user.restaurant_id : user.id;
    const wallet = await ensureWallet(ownerType, ownerId);
    if (amount <= 0) return res.status(400).json({ message: 'Invalid amount' });
    if (Number(wallet.balance) < Number(amount)) return res.status(400).json({ message: 'Insufficient balance' });
    const { data: existing } = await supabase
      .from('transfer_recipients')
      .select('*')
      .eq('owner_type', ownerType)
      .eq('owner_id', ownerId)
      .single();
    let recipientCode = existing?.paystack_recipient_code;
    if (!recipientCode) {
      const recipient = await paystack.createTransferRecipient({
        name: account_name || user.name,
        account_number,
        bank_code
      });
      recipientCode = recipient.data.recipient_code;
      await supabase.from('transfer_recipients').insert({
        owner_type: ownerType,
        owner_id: ownerId,
        paystack_recipient_code: recipientCode,
        details: { account_number, bank_code, account_name: account_name || user.name }
      });
    }
    const transfer = await paystack.initiateTransfer({
      amount: Math.round(Number(amount) * 100),
      recipient: recipientCode,
      reason: 'Wallet withdrawal'
    });
    const { data: tx, error: txErr } = await supabase
      .from('wallet_transactions')
      .insert({
        wallet_id: wallet.id,
        type: 'debit',
        amount,
        reference: transfer.data.reference,
        description: 'Withdrawal',
        meta: { transfer },
        status: 'pending'
      })
      .select()
      .single();
    if (txErr) throw txErr;
    const { error: balErr } = await supabase
      .from('wallet_accounts')
      .update({ balance: Number(wallet.balance) - Number(amount), updated_at: new Date().toISOString() })
      .eq('id', wallet.id);
    if (balErr) throw balErr;
    res.json({ status: 'pending', reference: transfer.data.reference });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

const paystackWebhook = async (req, res) => {
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const event = body?.event;
    if (!event) return res.status(400).json({ message: 'Invalid payload' });
    if (event === 'charge.success') {
      const amountKobo = body.data.amount;
      const metadata = body.data.metadata || {};
      const ownerType = metadata.owner_type || 'customer';
      const ownerId = metadata.owner_id;
      if (!ownerId) return res.status(200).json({ ok: true });
      const wallet = await ensureWallet(ownerType, ownerId);
      const amount = amountKobo / 100;
      const { data: tx, error: txErr } = await supabase
        .from('wallet_transactions')
        .insert({
          wallet_id: wallet.id,
          type: 'credit',
          amount,
          reference: body.data.reference,
          description: 'Top-up',
          meta: { source: 'dva' },
          status: 'success'
        })
        .select()
        .single();
      if (txErr) throw txErr;
      const { error: balErr } = await supabase
        .from('wallet_accounts')
        .update({ balance: Number(wallet.balance) + Number(amount), updated_at: new Date().toISOString() })
        .eq('id', wallet.id);
      if (balErr) throw balErr;
      return res.json({ ok: true });
    }
    if (event === 'transfer.success' || event === 'transfer.failed') {
      const reference = body.data.reference;
      const status = event === 'transfer.success' ? 'success' : 'failed';
      const { data: tx, error } = await supabase
        .from('wallet_transactions')
        .update({ status })
        .eq('reference', reference)
        .select()
        .single();
      if (!error && status === 'failed' && tx) {
        const { data: wallet } = await supabase.from('wallet_accounts').select('*').eq('id', tx.wallet_id).single();
        if (wallet) {
          await supabase
            .from('wallet_accounts')
            .update({ balance: Number(wallet.balance) + Number(tx.amount), updated_at: new Date().toISOString() })
            .eq('id', wallet.id);
        }
      }
      return res.json({ ok: true });
    }
    res.json({ ok: true });
  } catch (e) {
    res.status(200).json({ ok: true });
  }
};

const accrueRestaurantEarning = async (order) => {
  const { data: settings } = await supabase.from('system_settings').select('*').single();
  const commissionRate = settings?.commission_rate || 10;
  const platformCommission = Number(order.subtotal) * (commissionRate / 100);
  const restaurantEarning = Number(order.subtotal) + Number(order.tax) - platformCommission;
  const driverEarning = Number(order.delivery_fee);
  await supabase.from('earnings_ledger').insert({
    order_id: order.id,
    restaurant_id: order.restaurant_id,
    driver_id: order.driver_id || null,
    subtotal: order.subtotal,
    tax: order.tax,
    delivery_fee: order.delivery_fee,
    platform_commission: platformCommission,
    restaurant_earning: restaurantEarning,
    driver_earning: driverEarning,
    status: 'accrued'
  });
  const restaurantWallet = await ensureWallet('restaurant', order.restaurant_id);
  await supabase
    .from('wallet_accounts')
    .update({ balance: Number(restaurantWallet.balance) + restaurantEarning, updated_at: new Date().toISOString() })
    .eq('id', restaurantWallet.id);
  await supabase.from('wallet_transactions').insert({
    wallet_id: restaurantWallet.id,
    type: 'credit',
    amount: restaurantEarning,
    reference: `order_${order.id}`,
    description: 'Order earning',
    status: 'success'
  });
};

module.exports = {
  getWallet,
  getTransactions,
  setupVirtualAccount,
  withdraw,
  paystackWebhook,
  accrueRestaurantEarning
};
