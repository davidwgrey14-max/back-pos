const { Sale, MenuItem } = require('../models');

module.exports = {
  async getCashierProfile(cashierId) {
    return await Cashier.findByPk(cashierId, {
      attributes: ['id', 'name', 'email']
    });
  },

  async getMenuItems() {
    return await MenuItem.findAll({
      where: { isActive: true },
      attributes: ['id', 'name', 'price', 'category']
    });
  },

  async createSale(cashierId, items) {
    const total = items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    
    const sale = await Sale.create({
      cashierId,
      total,
      items: JSON.stringify(items)
    });

    return sale;
  }
};