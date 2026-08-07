// controllers/transactions.js - UPDATED
const Transaction = require('../models/Transaction');
const Product = require('../models/products');
const asyncHandler = require('../middlewares/async');
const mongoose = require('mongoose');

// Utility function for date filtering
function buildDateFilter(startDate, endDate) {
  if (!startDate && !endDate) return {};
  
  const start = new Date(startDate);
  start.setHours(0, 0, 0, 0);
  const end = new Date(endDate);
  end.setHours(23, 59, 59, 999);
  
  return {
    $or: [
      { createdAt: { $gte: start, $lte: end } },
      { saleDate: { $gte: start, $lte: end } }
    ]
  };
}

// Utility function to get shop ID from request
function getShopId(req) {
  return req.query.shopId || 
         req.query.shop || 
         req.body.shopId || 
         req.body.shop || 
         req.user?.shopId || 
         req.headers['x-shop-id'];
}

// NEW: Enhanced cashier daily stats with proper aggregation
exports.getCashierDailyStats = asyncHandler(async (req, res) => {
  const { cashierId, shop, shopId, startDate, endDate } = req.query;

  console.log('📊 Fetching enhanced cashier daily stats:', { cashierId, shop, shopId, startDate, endDate });

  try {
    // Enhanced shop filtering
    const finalShopId = shopId || shop || getShopId(req);
    
    const filter = { 
      status: 'completed',
      cashierId: cashierId
    };

    // Add shop filter if specified
    if (finalShopId && finalShopId !== 'all') {
      filter.shop = finalShopId;
    }

    // Date filter
    if (startDate && endDate) {
      Object.assign(filter, buildDateFilter(startDate, endDate));
    }

    console.log('🔍 Cashier stats filter:', JSON.stringify(filter, null, 2));

    // Use aggregation pipeline for better performance and accurate calculations
    const aggregationPipeline = [
      { $match: filter },
      {
        $facet: {
          // Basic transaction stats
          transactionStats: [
            {
              $group: {
                _id: null,
                todaySales: { $sum: '$totalAmount' },
                todayTransactions: { $sum: 1 },
                totalItems: { $sum: '$itemsCount' },
                cashAmount: {
                  $sum: {
                    $cond: [
                      { $eq: ['$paymentMethod', 'cash'] },
                      '$totalAmount',
                      0
                    ]
                  }
                },
                bankMpesaAmount: {
                  $sum: {
                    $cond: [
                      { $in: ['$paymentMethod', ['bank_mpesa', 'mpesa', 'bank']] },
                      '$totalAmount',
                      0
                    ]
                  }
                },
                creditAmount: {
                  $sum: {
                    $cond: [
                      { $eq: ['$paymentMethod', 'credit'] },
                      '$totalAmount',
                      0
                    ]
                  }
                },
                cashBankMpesaCashAmount: {
                  $sum: {
                    $cond: [
                      { $eq: ['$paymentMethod', 'cash_bank_mpesa'] },
                      { $ifNull: ['$cashAmount', 0] },
                      0
                    ]
                  }
                },
                cashBankMpesaBankAmount: {
                  $sum: {
                    $cond: [
                      { $eq: ['$paymentMethod', 'cash_bank_mpesa'] },
                      { $ifNull: ['$bankMpesaAmount', 0] },
                      0
                    ]
                  }
                }
              }
            }
          ],
          // Payment method breakdown
          paymentBreakdown: [
            {
              $group: {
                _id: '$paymentMethod',
                totalAmount: { $sum: '$totalAmount' },
                count: { $sum: 1 }
              }
            }
          ],
          // Last transaction
          lastTransaction: [
            { $sort: { createdAt: -1 } },
            { $limit: 1 },
            {
              $project: {
                saleDate: 1,
                createdAt: 1
              }
            }
          ]
        }
      }
    ];

    const [result] = await Transaction.aggregate(aggregationPipeline);

    console.log('📈 Aggregation result:', JSON.stringify(result, null, 2));

    // Extract and calculate final stats
    const transactionStats = result.transactionStats[0] || {
      todaySales: 0,
      todayTransactions: 0,
      totalItems: 0,
      cashAmount: 0,
      bankMpesaAmount: 0,
      creditAmount: 0,
      cashBankMpesaCashAmount: 0,
      cashBankMpesaBankAmount: 0
    };

    // Calculate combined amounts
    const finalCashAmount = transactionStats.cashAmount + transactionStats.cashBankMpesaCashAmount;
    const finalBankMpesaAmount = transactionStats.bankMpesaAmount + transactionStats.cashBankMpesaBankAmount;
    const finalCreditAmount = transactionStats.creditAmount;

    // Calculate total items sold (cashierItemsSold)
    const cashierItemsSold = transactionStats.totalItems;

    // Calculate average transaction
    const averageTransaction = transactionStats.todayTransactions > 0 
      ? transactionStats.todaySales / transactionStats.todayTransactions 
      : 0;

    // Build payment method breakdown
    const paymentMethodBreakdown = {
      cash: finalCashAmount,
      bank_mpesa: finalBankMpesaAmount,
      credit: finalCreditAmount
    };

    // Get last transaction time
    const lastTransaction = result.lastTransaction[0];
    const lastTransactionTime = lastTransaction 
      ? (lastTransaction.saleDate || lastTransaction.createdAt)
      : null;

    const stats = {
      todaySales: transactionStats.todaySales,
      todayTransactions: transactionStats.todayTransactions,
      todayItems: cashierItemsSold,
      averageTransaction,
      lastTransactionTime,
      paymentMethodBreakdown,
      cashAmount: finalCashAmount,
      bankMpesaAmount: finalBankMpesaAmount,
      creditAmount: finalCreditAmount,
      cashierItemsSold
    };

    console.log('✅ Final cashier stats:', stats);

    res.status(200).json({
      success: true,
      data: stats
    });

  } catch (error) {
    console.error('❌ Error fetching cashier daily stats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch cashier daily stats',
      error: process.env.NODE_ENV === 'production' ? 'Internal server error' : error.message
    });
  }
});

// NEW: Enhanced daily sales stats for dashboard
exports.getDailySalesStats = asyncHandler(async (req, res) => {
  const { cashierId, shop, shopId, startDate, endDate } = req.query;

  console.log('📈 Fetching enhanced daily sales stats:', { cashierId, shop, shopId, startDate, endDate });

  try {
    // Enhanced shop filtering
    const finalShopId = shopId || shop || getShopId(req);
    
    const filter = { 
      status: 'completed'
    };

    // Add shop filter if specified
    if (finalShopId && finalShopId !== 'all') {
      filter.shop = finalShopId;
    }

    // Add cashier filter if specified
    if (cashierId) {
      filter.cashierId = cashierId;
    }

    // Date filter
    if (startDate && endDate) {
      Object.assign(filter, buildDateFilter(startDate, endDate));
    }

    console.log('🔍 Daily sales stats filter:', JSON.stringify(filter, null, 2));

    // Use aggregation pipeline for accurate calculations
    const aggregationPipeline = [
      { $match: filter },
      {
        $group: {
          _id: null,
          totalSales: { $sum: '$totalAmount' },
          totalTransactions: { $sum: 1 },
          totalItems: { $sum: '$itemsCount' },
          cashAmount: {
            $sum: {
              $cond: [
                { $eq: ['$paymentMethod', 'cash'] },
                '$totalAmount',
                0
              ]
            }
          },
          bankMpesaAmount: {
            $sum: {
              $cond: [
                { $in: ['$paymentMethod', ['bank_mpesa', 'mpesa', 'bank']] },
                '$totalAmount',
                0
              ]
            }
          },
          creditAmount: {
            $sum: {
              $cond: [
                { $eq: ['$paymentMethod', 'credit'] },
                '$totalAmount',
                0
              ]
            }
          },
          cashBankMpesaCashAmount: {
            $sum: {
              $cond: [
                { $eq: ['$paymentMethod', 'cash_bank_mpesa'] },
                { $ifNull: ['$cashAmount', 0] },
                0
              ]
            }
          },
          cashBankMpesaBankAmount: {
            $sum: {
              $cond: [
                { $eq: ['$paymentMethod', 'cash_bank_mpesa'] },
                { $ifNull: ['$bankMpesaAmount', 0] },
                0
              ]
            }
          }
        }
      }
    ];

    const [result] = await Transaction.aggregate(aggregationPipeline);

    console.log('📊 Daily sales aggregation result:', result);

    // Calculate final amounts
    const finalResult = result || {
      totalSales: 0,
      totalTransactions: 0,
      totalItems: 0,
      cashAmount: 0,
      bankMpesaAmount: 0,
      creditAmount: 0,
      cashBankMpesaCashAmount: 0,
      cashBankMpesaBankAmount: 0
    };

    const finalCashAmount = finalResult.cashAmount + finalResult.cashBankMpesaCashAmount;
    const finalBankMpesaAmount = finalResult.bankMpesaAmount + finalResult.cashBankMpesaBankAmount;
    const finalCreditAmount = finalResult.creditAmount;

    const stats = {
      totalSales: finalResult.totalSales,
      totalTransactions: finalResult.totalTransactions,
      totalItems: finalResult.totalItems,
      averageTransaction: finalResult.totalTransactions > 0 
        ? finalResult.totalSales / finalResult.totalTransactions 
        : 0,
      cashAmount: finalCashAmount,
      bankMpesaAmount: finalBankMpesaAmount,
      creditAmount: finalCreditAmount,
      cashierItemsSold: finalResult.totalItems // For cashier-specific view
    };

    console.log('✅ Final daily sales stats:', stats);

    res.status(200).json({
      success: true,
      data: stats
    });

  } catch (error) {
    console.error('❌ Error fetching daily sales stats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch daily sales stats',
      error: process.env.NODE_ENV === 'production' ? 'Internal server error' : error.message
    });
  }
});

// Keep existing methods but ensure they work with enhanced data
exports.getAllTransactions = asyncHandler(async (req, res) => {
  const {
    startDate,
    endDate,
    shop,
    shopId,
    cashier,
    cashierId,
    paymentMethod,
    status = 'completed',
    page = 1,
    limit = 50
  } = req.query;

  console.log('📊 Fetching transactions with filters:', {
    startDate, endDate, shop, shopId, cashier, cashierId, paymentMethod, status, page, limit
  });

  try {
    // Enhanced shop filtering
    const finalShopId = shopId || shop || getShopId(req);
    
    const filter = buildCommonFilters({ 
      startDate, 
      endDate, 
      shop: finalShopId,
      cashierId: cashierId || cashier,
      paymentMethod, 
      status 
    });

    // Pagination
    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
    const skip = (pageNum - 1) * limitNum;

    console.log('🔍 Final filter:', JSON.stringify(filter, null, 2));

    // Execute query and count in parallel for better performance
    const [transactions, total] = await Promise.all([
      Transaction.find(filter)
        .populate('cashierId', 'name email')
        .populate('items.productId', 'name category buyingPrice barcode')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      Transaction.countDocuments(filter)
    ]);

    console.log(`✅ Found ${transactions.length} transactions out of ${total} total for shop: ${finalShopId || 'all shops'}`);

    const enhancedTransactions = transactions.map(transaction => {
      const totalCost = transaction.totalCost || 0;
      const totalProfit = transaction.totalProfit || (transaction.totalAmount - totalCost);
      const profitMargin = transaction.profitMargin || (transaction.totalAmount > 0 ? 
        (totalProfit / transaction.totalAmount) * 100 : 0);

      return {
        ...transaction,
        transactionNumber: transaction.transactionNumber || transaction._id.toString().substring(0, 8),
        cashierName: transaction.cashierName || 'Unknown Cashier',
        customerName: transaction.customerName || 'Walk-in Customer',
        totalCost,
        totalProfit,
        profitMargin,
        cost: totalCost,
        profit: totalProfit,
        saleDate: transaction.saleDate || transaction.createdAt,
        itemsCount: transaction.items?.reduce((sum, item) => sum + (item.quantity || 0), 0) || 0,
        items: (transaction.items || []).map(item => {
          const itemCost = (item.costPrice || 0) * (item.quantity || 0);
          const itemProfit = item.profit || ((item.totalPrice || 0) - itemCost);
          const itemProfitMargin = item.profitMargin || ((item.totalPrice || 0) > 0 ? 
            (itemProfit / (item.totalPrice || 0)) * 100 : 0);

          return {
            ...item,
            productName: item.productName || 'Unknown Product',
            quantity: item.quantity || 0,
            price: item.unitPrice || item.price || 0,
            totalPrice: item.totalPrice || 0,
            cost: itemCost,
            profit: itemProfit,
            profitMargin: itemProfitMargin,
            category: item.category || 'Uncategorized',
            barcode: item.barcode || '',
            unitPrice: item.unitPrice || item.price || 0,
            costPrice: item.costPrice || 0
          };
        })
      };
    });

    res.status(200).json({
      success: true,
      data: enhancedTransactions,
      pagination: {
        current: pageNum,
        pageSize: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum)
      },
      shop: finalShopId || 'All shops'
    });

  } catch (error) {
    console.error('❌ Error in getAllTransactions:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch transactions',
      error: process.env.NODE_ENV === 'production' ? 'Internal server error' : error.message
    });
  }
});

// Utility function to build common filters with enhanced shop handling
function buildCommonFilters({ startDate, endDate, shop, shopId, paymentMethod, status, cashierId, cashier }) {
  const filter = {};

  // Enhanced shop filtering - support both shop and shopId
  const finalShopId = shopId || shop;
  if (finalShopId && finalShopId !== 'all') {
    filter.shop = finalShopId;
  }

  // Date filter
  if (startDate && endDate) {
    Object.assign(filter, buildDateFilter(startDate, endDate));
  }

  // Cashier filter (support both cashierId and cashier for compatibility)
  if (cashierId) filter.cashierId = cashierId;
  if (cashier) filter.cashierId = cashier;

  // Payment method filter
  if (paymentMethod) {
    if (paymentMethod === 'digital') {
      filter.paymentMethod = { $in: ['mpesa', 'bank'] };
    } else {
      filter.paymentMethod = paymentMethod;
    }
  }

  // Status filter
  if (status) filter.status = status;

  return filter;
}