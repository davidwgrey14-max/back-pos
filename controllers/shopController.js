const Shop = require('../models/shop');

// Helper function for consistent error responses
const errorResponse = (res, status, message, error = null) => {
  if (error) console.error('Error:', error);
  return res.status(status).json({ 
    success: false, 
    error: message 
  });
};

// 1. GET all shops
const getAllShops = async (req, res) => {
  try {
    const shops = await Shop.find()
      .sort({ createdAt: -1 })
      .select('name location createdAt isActive');
      
    res.status(200).json({ 
      success: true, 
      data: shops,
      count: shops.length 
    });
  } catch (error) {
    errorResponse(res, 500, 'Failed to fetch shops', error);
  }
};

// 2. GET single shop
const getShop = async (req, res) => {
  try {
    const shop = await Shop.findById(req.params.id)
      .select('name location description isActive createdAt');
    
    if (!shop) {
      return errorResponse(res, 404, 'Shop not found');
    }
    
    res.status(200).json({ 
      success: true, 
      data: shop 
    });
  } catch (error) {
    errorResponse(res, 500, 'Failed to fetch shop', error);
  }
};

// 3. POST create new shop
const createShop = async (req, res) => {
  try {
    const { name, location, description } = req.body;
    
    if (!name || !name.trim()) {
      return errorResponse(res, 400, 'Shop name is required');
    }
    if (!location || !location.trim()) {
      return errorResponse(res, 400, 'Location is required');
    }

    const shop = await Shop.create({
      name: name.trim(),
      location: location.trim(),
      description: description?.trim() || ''
    });
    
    res.status(201).json({ 
      success: true, 
      data: {
        _id: shop._id,
        name: shop.name,
        location: shop.location,
        description: shop.description,
        isActive: shop.isActive,
        createdAt: shop.createdAt
      },
      message: 'Shop created successfully'
    });
  } catch (error) {
    if (error.code === 11000) {
      return errorResponse(res, 400, 'Shop name already exists');
    }
    errorResponse(res, 400, 'Failed to create shop', error);
  }
};

// 4. PUT update shop
const updateShop = async (req, res) => {
  try {
    const { name, location, description, isActive } = req.body;
    
    if (!name?.trim()) {
      return errorResponse(res, 400, 'Shop name is required');
    }
    if (!location?.trim()) {
      return errorResponse(res, 400, 'Location is required');
    }

    const shop = await Shop.findByIdAndUpdate(
      req.params.id,
      {
        name: name.trim(),
        location: location.trim(),
        description: description?.trim() || '',
        isActive: isActive !== undefined ? isActive : true
      },
      { 
        new: true,
        runValidators: true
      }
    ).select('name location description isActive createdAt');
    
    if (!shop) {
      return errorResponse(res, 404, 'Shop not found');
    }
    
    res.status(200).json({ 
      success: true, 
      data: shop,
      message: 'Shop updated successfully'
    });
  } catch (error) {
    if (error.code === 11000) {
      return errorResponse(res, 400, 'Shop name already exists');
    }
    errorResponse(res, 400, 'Failed to update shop', error);
  }
};

// 5. DELETE shop
const deleteShop = async (req, res) => {
  try {
    const shop = await Shop.findByIdAndDelete(req.params.id);
    
    if (!shop) {
      return errorResponse(res, 404, 'Shop not found');
    }
    
    res.status(200).json({ 
      success: true, 
      message: 'Shop deleted successfully'
    });
  } catch (error) {
    errorResponse(res, 500, 'Failed to delete shop', error);
  }
};

module.exports = {
  getAllShops,
  getShop,
  createShop,
  updateShop,
  deleteShop
};