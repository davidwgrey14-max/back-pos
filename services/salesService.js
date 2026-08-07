const { Sale, Cashier } = require('../models');

module.exports = {
  async getSalesHistory(cashierId = null) {
    const where = cashierId ? { cashierId } : {};
    
    return await Sale.findAll({
      where,
      order: [['createdAt', 'DESC']],
      include: [{ model: Cashier, attributes: ['name'] }],
      limit: 100
    });
  },

  async getDailySales() {
    return await Sale.findAll({
      attributes: [
        [Sequelize.fn('DATE', Sequelize.col('createdAt')), 'date'],
        [Sequelize.fn('SUM', Sequelize.col('total')), 'total']
      ],
      group: ['date'],
      order: [['date', 'DESC']]
    });
  }
};