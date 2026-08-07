const express = require('express');
const router = express.Router();
const Transaction = require('../models/Transaction');
const { protect, authorize } = require('../middlewares/auth');

// Handle partial credit payment
router.post('/:id/payment', protect, authorize('cashier', 'admin', 'manager'), async (req, res) => {
  try {
    const { id } = req.params;
    const { 
      paymentAmount, 
      paymentMethod, 
      paymentDate = new Date(),
      notes = '',
      cashierName,
      recordedBy 
    } = req.body;

    // Validate input
    if (!paymentAmount || paymentAmount <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Valid payment amount is required'
      });
    }

    if (!paymentMethod) {
      return res.status(400).json({
        success: false,
        message: 'Payment method is required'
      });
    }

    // Find the credit transaction
    const creditTransaction = await Transaction.findById(id);
    
    if (!creditTransaction) {
      return res.status(404).json({
        success: false,
        message: 'Credit transaction not found'
      });
    }

    if (!creditTransaction.isCreditTransaction) {
      return res.status(400).json({
        success: false,
        message: 'This is not a credit transaction'
      });
    }

    const currentBalance = creditTransaction.balanceDue || creditTransaction.totalCreditAmount;
    
    // Validate payment doesn't exceed balance
    if (paymentAmount > currentBalance) {
      return res.status(400).json({
        success: false,
        message: `Payment amount (${paymentAmount}) exceeds balance due (${currentBalance})`
      });
    }

    // Create payment transaction record
    const paymentTransaction = new Transaction({
      transactionNumber: `PAY-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      totalAmount: paymentAmount,
      paymentMethod: paymentMethod,
      customerName: creditTransaction.customerName,
      customerPhone: creditTransaction.customerPhone,
      cashierName: cashierName || creditTransaction.cashierName,
      cashierId: creditTransaction.cashierId,
      shop: creditTransaction.shop,
      shopId: creditTransaction.shopId,
      shopName: creditTransaction.shopName,
      saleDate: paymentDate,
      status: 'completed',
      isCreditPayment: true,
      originalCreditId: creditTransaction._id,
      items: [{
        productName: `Credit Payment - ${creditTransaction.customerName}`,
        quantity: 1,
        price: paymentAmount,
        totalPrice: paymentAmount
      }],
      notes: `Credit payment for ${creditTransaction.customerName} - ${notes}`
    });

    await paymentTransaction.save();

    // Update the original credit transaction
    const newAmountPaid = (creditTransaction.amountPaid || 0) + paymentAmount;
    const newBalanceDue = Math.max(0, (creditTransaction.totalCreditAmount || creditTransaction.totalAmount) - newAmountPaid);

    // Add to payment history
    const paymentRecord = {
      amount: paymentAmount,
      paymentDate: paymentDate,
      paymentMethod: paymentMethod,
      recordedBy: recordedBy || cashierName || 'System',
      cashierName: cashierName || creditTransaction.cashierName,
      notes: notes || `Payment of ${paymentAmount}`,
      transactionReference: paymentTransaction.transactionNumber
    };

    await Transaction.findByIdAndUpdate(id, {
      $inc: { amountPaid: paymentAmount },
      $set: { balanceDue: newBalanceDue },
      $push: { paymentHistory: paymentRecord },
      updatedAt: new Date()
    });

    // Get updated transaction
    const updatedCredit = await Transaction.findById(id);

    console.log('✅ Credit payment processed:', {
      creditId: id,
      paymentAmount,
      newAmountPaid,
      newBalanceDue,
      paymentTransaction: paymentTransaction._id
    });

    res.json({
      success: true,
      message: `Payment of ${paymentAmount} recorded successfully`,
      data: {
        creditTransaction: updatedCredit,
        paymentTransaction: paymentTransaction,
        summary: {
          previousBalance: currentBalance,
          paymentAmount: paymentAmount,
          newBalance: newBalanceDue,
          totalPaid: newAmountPaid
        }
      }
    });

  } catch (error) {
    console.error('Error processing credit payment:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to process credit payment',
      error: error.message
    });
  }
});

// Get credit transaction with payment history
router.get('/:id/details', protect, async (req, res) => {
  try {
    const { id } = req.params;

    const creditTransaction = await Transaction.findById(id);
    
    if (!creditTransaction) {
      return res.status(404).json({
        success: false,
        message: 'Credit transaction not found'
      });
    }

    // Get all payment transactions for this credit
    const paymentTransactions = await Transaction.find({
      originalCreditId: id,
      isCreditPayment: true
    }).sort({ saleDate: -1 });

    const totalPayments = paymentTransactions.reduce((sum, payment) => sum + payment.totalAmount, 0);

    res.json({
      success: true,
      data: {
        creditTransaction,
        paymentTransactions,
        paymentSummary: {
          totalCreditAmount: creditTransaction.totalCreditAmount || creditTransaction.totalAmount,
          totalPaid: totalPayments,
          balanceDue: (creditTransaction.totalCreditAmount || creditTransaction.totalAmount) - totalPayments,
          paymentCount: paymentTransactions.length
        }
      }
    });

  } catch (error) {
    console.error('Error fetching credit details:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch credit details',
      error: error.message
    });
  }
});

// Get all credit transactions with balances
router.get('/', protect, async (req, res) => {
  try {
    const { 
      shop, 
      status, 
      customerName,
      page = 1, 
      limit = 50 
    } = req.query;

    const filter = { isCreditTransaction: true };
    
    if (shop && shop !== 'all') filter.shop = shop;
    if (status && status !== 'all') filter.creditStatus = status;
    if (customerName) filter.customerName = { $regex: customerName, $options: 'i' };

    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
    const skip = (pageNum - 1) * limitNum;

    const [credits, total] = await Promise.all([
      Transaction.find(filter)
        .sort({ saleDate: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      Transaction.countDocuments(filter)
    ]);

    // Calculate summary statistics
    const summary = {
      totalCredits: credits.length,
      totalCreditAmount: credits.reduce((sum, credit) => sum + (credit.totalCreditAmount || credit.totalAmount), 0),
      totalPaid: credits.reduce((sum, credit) => sum + (credit.amountPaid || 0), 0),
      totalOutstanding: credits.reduce((sum, credit) => sum + (credit.balanceDue || 0), 0),
      byStatus: {
        pending: credits.filter(c => c.creditStatus === 'pending').length,
        partially_paid: credits.filter(c => c.creditStatus === 'partially_paid').length,
        paid: credits.filter(c => c.creditStatus === 'paid').length,
        overdue: credits.filter(c => c.creditStatus === 'overdue').length
      }
    };

    res.json({
      success: true,
      data: credits,
      pagination: {
        current: pageNum,
        pageSize: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum)
      },
      summary
    });

  } catch (error) {
    console.error('Error fetching credits:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch credit transactions',
      error: error.message
    });
  }
});

module.exports = router;