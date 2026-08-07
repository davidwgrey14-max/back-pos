const { Inventory } = require('../models');

module.exports = {
  async getInventory() {
    return await Inventory.findAll({
      order: [['name', 'ASC']]
    });
  },

  async updateInventory(itemId, quantity) {
    const item = await Inventory.findByPk(itemId);
    if (!item) throw new Error('Inventory item not found');
    
    return await item.update({ quantity });
  },

  async getLowStockItems() {
    return await Inventory.findAll({
      where: {
        quantity: {
          [Op.lt]: Sequelize.col('threshold')
        }
      }
    });
  }
};