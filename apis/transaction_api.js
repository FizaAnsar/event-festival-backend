const express = require('express');
const Transaction = require('../models/transaction_model');

const router = express.Router();

// Get all transactions
router.get('/transactions', async (req, res) => {
  try {
    const transactions = await Transaction.find().populate('user vendor sale');
    res.json(transactions);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Create a new transaction
router.post('/transactions', async (req, res) => {
  const transaction = new Transaction({
    user: req.body.user,
    vendor: req.body.vendor,
    sale: req.body.sale,
    amount: req.body.amount,
    paymentMethod: req.body.paymentMethod,
    transactionStatus: req.body.transactionStatus
  });

  try {
    const newTransaction = await transaction.save();
    res.status(201).json(newTransaction);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

module.exports = router;
