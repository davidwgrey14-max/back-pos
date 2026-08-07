// middlewares/validationMiddleware.js
exports.validateDrink = (req, res, next) => {
  const { name, price, stock, category } = req.body;

  // Validate name
  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    return res.status(400).json({ 
      success: false,
      error: 'Valid drink name is required (2-50 characters)' 
    });
  }

  if (name.trim().length < 2 || name.trim().length > 50) {
    return res.status(400).json({ 
      success: false,
      error: 'Drink name must be between 2-50 characters' 
    });
  }

  // Validate price
  if (isNaN(price)) {
    return res.status(400).json({ 
      success: false,
      error: 'Price must be a number' 
    });
  }

  if (Number(price) < 0) {
    return res.status(400).json({ 
      success: false,
      error: 'Price must be a positive number' 
    });
  }

  // Validate stock
  if (isNaN(stock)) {
    return res.status(400).json({ 
      success: false,
      error: 'Stock must be a number' 
    });
  }

  if (Number(stock) < 0) {
    return res.status(400).json({ 
      success: false,
      error: 'Stock cannot be negative' 
    });
  }

  // Validate category
  const validCategories = ['Hot Drinks', 'Cold Drinks', 'Alcoholic', 'Non-Alcoholic', 'Other'];
  if (category && !validCategories.includes(category)) {
    return res.status(400).json({ 
      success: false,
      error: `Invalid category. Must be one of: ${validCategories.join(', ')}` 
    });
  }

  next();
};