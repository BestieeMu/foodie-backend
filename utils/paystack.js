const axios = require('axios');

const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY;

const client = axios.create({
  baseURL: 'https://api.paystack.co',
  headers: {
    Authorization: `Bearer ${PAYSTACK_SECRET}`,
    'Content-Type': 'application/json',
  },
});

const initializePayment = async (email, amount, metadata = {}) => {
  const response = await client.post('/transaction/initialize', {
    email,
    amount: amount * 100,
    metadata,
  });
  return response.data;
};

const verifyPayment = async (reference) => {
  const response = await client.get(`/transaction/verify/${reference}`);
  return response.data;
};

const createCustomer = async ({ email, name, phone }) => {
  const response = await client.post('/customer', { email, first_name: name, phone });
  return response.data;
};

const createDedicatedAccount = async ({ customer, preferred_bank = 'wema-bank' }) => {
  const response = await client.post('/dedicated_account', { customer, preferred_bank });
  return response.data;
};

const createTransferRecipient = async ({ name, account_number, bank_code }) => {
  const response = await client.post('/transferrecipient', {
    type: 'nuban',
    name,
    account_number,
    bank_code
  });
  return response.data;
};

const initiateTransfer = async ({ amount, recipient, reason }) => {
  const response = await client.post('/transfer', { amount, recipient, reason });
  return response.data;
};

module.exports = {
  initializePayment,
  verifyPayment,
  createCustomer,
  createDedicatedAccount,
  createTransferRecipient,
  initiateTransfer,
};
