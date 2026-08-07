const { MenuItem } = require('../models');

module.exports = {
  async getAllDrinks() {
    return await MenuItem.findAll({
      order: [['category', 'ASC'], ['name', 'ASC']]
    });
  },

  async updateDrink(id, updateData) {
    const drink = await MenuItem.findByPk(id);
    if (!drink) throw new Error('Drink not found');
    
    return await drink.update(updateData);
  },

  async createDrink(drinkData) {
    return await MenuItem.create(drinkData);
  }
};