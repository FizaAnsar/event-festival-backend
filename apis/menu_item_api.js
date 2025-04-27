const express = require("express");
const mongoose = require("mongoose");
const MenuItem = require("../models/menu_item_model");
const upload = require("../middlewares/uploadMiddleware");
const BASE_URL = "http://localhost:3000";

module.exports = (io) => {
  const router = express.Router();
  const uploadMenuItemImage = upload.single("image");

  // Database index check (run once at startup)
  const checkDatabaseIndexes = async () => {
    try {
      const indexes = await MenuItem.collection.getIndexes();
      if (indexes.id_1) {
        console.warn('WARNING: Found legacy id index on menu_items collection');
        await MenuItem.collection.dropIndex("id_1");
        console.log('Removed legacy id index successfully');
      }
    } catch (err) {
      if (err.code !== 27) { // Ignore "index not found" errors
        console.error('Error checking indexes:', err);
      }
    }
  };
  checkDatabaseIndexes();

  const broadcastMenuItemsUpdate = async (vendorId) => {
    try {
      const menuItems = await MenuItem.find({ vendorId }).sort({ createdAt: -1 });
      io.emit("menuItemsUpdate", { vendorId, menuItems });
    } catch (err) {
      console.error("Error broadcasting menu items update:", err);
    }
  };

  // GET all menu items for a vendor
  router.get("/menu-items/:vendorId", async (req, res) => {
    try {
      const menuItems = await MenuItem.find({ vendorId: req.params.vendorId }).sort({ createdAt: -1 });
      res.json(menuItems);
    } catch (err) {
      res.status(500).json({ message: err.message });
    }
  });

  // GET a single menu item by ID
  router.get("/menu-items/item/:_id", async (req, res) => {
    try {
      const menuItem = await MenuItem.findById(req.params._id);
      if (!menuItem) return res.status(404).json({ message: "Menu item not found" });
      res.json(menuItem);
    } catch (err) {
      res.status(500).json({ message: err.message });
    }
  });

  // POST - Create new menu item
  router.post("/menu-items", uploadMenuItemImage, async (req, res) => {
    try {
      const menuItemData = {
        name: req.body.name,
        description: req.body.description,
        price: Number(req.body.price),
        imageUrl: req.file ? `${BASE_URL}/${req.file.path.replace(/\\/g, '/')}` : undefined,
        category: req.body.category,
        status: req.body.status || 'active',
        vendorId: req.body.vendorId
      };

      const menuItem = new MenuItem(menuItemData);
      const validationError = menuItem.validateSync();
      
      if (validationError) {
        return res.status(400).json({
          success: false,
          errors: parseValidationError(validationError)
        });
      }

      const newMenuItem = await menuItem.save();
      res.status(201).json({
        success: true,
        data: newMenuItem
      });

      broadcastMenuItemsUpdate(newMenuItem.vendorId);

    } catch (err) {
      res.status(500).json({
        success: false,
        errors: handleError(err)
      });
    }
  });

  // PUT - Update a menu item
  router.put("/menu-items/:_id", uploadMenuItemImage, async (req, res) => {
    try {
      const updateData = {
        name: req.body.name,
        description: req.body.description,
        price: Number(req.body.price),
        category: req.body.category,
        status: req.body.status,
        vendorId: req.body.vendorId
      };

      if (req.file) {
        updateData.imageUrl = `${BASE_URL}/${req.file.path.replace(/\\/g, '/')}`;
      } else if (req.body.imageUrl) {
        updateData.imageUrl = req.body.imageUrl;
      }

      const updatedMenuItem = await MenuItem.findByIdAndUpdate(
        req.params._id,
        updateData,
        { new: true, runValidators: true }
      );

      if (!updatedMenuItem) {
        return res.status(404).json({ message: "Menu item not found" });
      }

      res.json(updatedMenuItem);
      broadcastMenuItemsUpdate(updatedMenuItem.vendorId);

    } catch (err) {
      res.status(500).json({ 
        success: false,
        message: err.message,
        errorType: err.name
      });
    }
  });

  // DELETE a menu item by ID
  router.delete("/menu-items/:_id", async (req, res) => {
    try {
      const deletedMenuItem = await MenuItem.findByIdAndDelete(req.params._id);
      if (!deletedMenuItem) {
        return res.status(404).json({ message: "Menu item not found" });
      }

      res.json({ message: "Menu item deleted successfully" });
      broadcastMenuItemsUpdate(deletedMenuItem.vendorId);

    } catch (err) {
      res.status(500).json({ message: err.message });
    }
  });

  // Utility functions
  function parseValidationError(error) {
    const errors = {};
    for (const field in error.errors) {
      errors[field] = {
        message: error.errors[field].message,
        value: error.errors[field].value
      };
    }
    return errors;
  }

  function handleError(err) {
    console.error('Server Error:', err);

    if (err.code === 11000) {
      if (err.keyValue && err.keyValue.id === null) {
        return { 
          database: { 
            message: 'Database configuration issue. Please try again or contact support.' 
          } 
        };
      }
      const field = Object.keys(err.keyPattern)[0];
      return {
        [field]: {
          message: `${field.charAt(0).toUpperCase() + field.slice(1)} must be unique`
        }
      };
    }

    if (err instanceof mongoose.Error.CastError) {
      return {
        [err.path]: {
          message: `Invalid ${err.path} format`
        }
      };
    }

    return { server: { message: 'An unexpected error occurred' } };
  }

  return router;
};