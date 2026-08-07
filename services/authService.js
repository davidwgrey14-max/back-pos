const bcrypt = require('bcrypt');
const { Cashier, Admin } = require('../models');

module.exports = {
  async cashierLogin(email, password) {
    const cashier = await Cashier.findOne({ where: { email } });
    if (!cashier) {
      throw new Error('Cashier not found');
    }

    const isValid = await bcrypt.compare(password, cashier.password);
    if (!isValid) {
      throw new Error('Invalid credentials');
    }

    return {
      id: cashier.id,
      name: cashier.name,
      email: cashier.email
    };
  },

  async adminLogin(email, password) {
    const admin = await Admin.findOne({ where: { email } });
    if (!admin) {
      throw new Error('Admin not found');
    }

    const isValid = await bcrypt.compare(password, admin.password);
    if (!isValid) {
      throw new Error('Invalid credentials');
    }

    return {
      id: admin.id,
      name: admin.name,
      email: admin.email,
      role: admin.role
    };
  },

  async logout(req, res) {
    // Session-based logout handled by express-session
    req.session.destroy();
    return { success: true };
  }
};