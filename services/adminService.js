const { Cashier, Sale, Inventory } = require('../models');

module.exports = {
  async getDashboardStats() {
    const [cashiers, sales, inventory] = await Promise.all([
      Cashier.count(),
      Sale.sum('total'),
      Inventory.findAll()
    ]);

    return {
      totalCashiers: cashiers,
      totalSales: sales || 0,
      lowStockItems: inventory.filter(item => item.quantity < item.threshold)
    };
  },

  async getCashiers() {
    return await Cashier.findAll({
      attributes: ['id', 'name', 'email', 'createdAt']
    });
  },

  async getSalesReport(startDate, endDate) {
    return await Sale.findAll({
      where: {
        createdAt: {
          [Op.between]: [startDate, endDate]
        }
      },
      include: [{ model: Cashier, attributes: ['name'] }]
    });
  }
};