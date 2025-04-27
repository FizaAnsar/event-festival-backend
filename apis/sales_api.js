const express = require("express");
const Sale = require("../models/sales_model");
const mongoose = require("mongoose");
const BASE_URL = "http://localhost:3000";
const Notification = require("../models/notification_model");
module.exports = (io) => {
  const router = express.Router();

  // WebSocket Broadcast Function
  const broadcastSalesUpdate = async (vendorId) => {
    try {
      const filter = vendorId ? { vendorId: new mongoose.Types.ObjectId(vendorId) } : {};
      const sales = await Sale.find(filter).sort({ saleDate: -1 }).populate('customerId');
      io.emit("salesUpdate", sales);
    } catch (err) {
      console.error("Error broadcasting sales update:", err);
    }
  };

 
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

  // ======================
  // DASHBOARD ANALYTICS ROUTES (must come before /sales/:id)
  // ======================

  router.get("/sales/summary", async (req, res) => {
    try {
      const { vendorId } = req.query;
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const baseMatch = vendorId ? { vendorId: new mongoose.Types.ObjectId(vendorId) } : {};

      const totalStats = await Sale.aggregate([
        { $match: baseMatch },
        {
          $group: {
            _id: null,
            totalSales: { $sum: 1 },
            totalRevenue: { $sum: "$totalPrice" },
            avgSaleValue: { $avg: "$totalPrice" }
          }
        }
      ]);

      const todayStats = await Sale.aggregate([
        {
          $match: { 
            ...baseMatch,
            saleDate: { $gte: today } 
          }
        },
        {
          $group: {
            _id: null,
            salesToday: { $sum: 1 },
            revenueToday: { $sum: "$totalPrice" }
          }
        }
      ]);

      res.json({
        totalSales: totalStats[0]?.totalSales || 0,
        totalRevenue: totalStats[0]?.totalRevenue || 0,
        avgSaleValue: totalStats[0]?.avgSaleValue || 0,
        salesToday: todayStats[0]?.salesToday || 0,
        revenueToday: todayStats[0]?.revenueToday || 0
      });
    } catch (err) {
      res.status(500).json({ message: err.message });
    }
  });

  router.get("/sales/trends", async (req, res) => {
    const { range = "daily", days = 7, vendorId } = req.query;
    const dateFrom = new Date();
    dateFrom.setDate(dateFrom.getDate() - parseInt(days));

    const groupBy = range === "monthly"
      ? { $dateToString: { format: "%Y-%m", date: "$saleDate" } }
      : { $dateToString: { format: "%Y-%m-%d", date: "$saleDate" } };

    const baseMatch = vendorId ? { vendorId: new mongoose.Types.ObjectId(vendorId) } : {};

    try {
      const result = await Sale.aggregate([
        { 
          $match: { 
            ...baseMatch,
            saleDate: { $gte: dateFrom } 
          } 
        },
        {
          $group: {
            _id: groupBy,
            count: { $sum: 1 },
            revenue: { $sum: "$totalPrice" }
          }
        },
        { $sort: { _id: 1 } }
      ]);

      res.json(result);
    } catch (err) {
      res.status(500).json({ message: err.message });
    }
  });

  router.get("/sales/top-customers", async (req, res) => {
    const limit = parseInt(req.query.limit || "5");
    const { vendorId } = req.query;

    const baseMatch = vendorId ? { vendorId: new mongoose.Types.ObjectId(vendorId) } : {};

    try {
      const topCustomers = await Sale.aggregate([
        { $match: baseMatch },
        {
          $group: {
            _id: "$customerId",
            customerName: { $first: "$customerName" },
            totalSpent: { $sum: "$totalPrice" },
            totalOrders: { $sum: 1 }
          }
        },
        { $sort: { totalSpent: -1 } },
        { $limit: limit }
      ]);

      res.json(topCustomers);
    } catch (err) {
      res.status(500).json({ message: err.message });
    }
  });

  router.get("/sales/by-time", async (req, res) => {
    const { vendorId } = req.query;
    const baseMatch = vendorId ? { vendorId: new mongoose.Types.ObjectId(vendorId) } : {};

    try {
      const byHour = await Sale.aggregate([
        { $match: baseMatch },
        {
          $group: {
            _id: { $hour: "$saleDate" },
            count: { $sum: 1 }
          }
        }
      ]);

      const byDayOfWeek = await Sale.aggregate([
        { $match: baseMatch },
        {
          $group: {
            _id: { $dayOfWeek: "$saleDate" }, // 1 (Sun) to 7 (Sat)
            count: { $sum: 1 }
          }
        }
      ]);

      res.json({ byHour, byDayOfWeek });
    } catch (err) {
      res.status(500).json({ message: err.message });
    }
  });

  router.get("/sales/recent", async (req, res) => {
    const limit = parseInt(req.query.limit || "10");
    const { vendorId } = req.query;

    const filter = vendorId ? { vendorId } : {};

    try {
      const recentSales = await Sale.find(filter)
        .sort({ saleDate: -1 })
        .limit(limit)
        .populate('customerId');

      res.json(recentSales);
    } catch (err) {
      res.status(500).json({ message: err.message });
    }
  });

  // ======================
  // CRUD ROUTES
  // ======================

  router.get("/sales", async (req, res) => {
    const { vendorId } = req.query;
    const filter = vendorId ? { vendorId } : {};

    try {
      const sales = await Sale.find(filter).sort({ saleDate: -1 }).populate('customerId');
      res.json(sales);
    } catch (err) {
      res.status(500).json({ message: err.message });
    }
  });

  router.get("/sales/:id", async (req, res) => {
    try {
      const sale = await Sale.findById(req.params.id).populate('customerId');
      if (!sale) return res.status(404).json({ message: "Sale not found" });
      res.json(sale);
    } catch (err) {
      res.status(500).json({ message: err.message });
    }
  });

  router.post("/sales", async (req, res) => {
    try {
      const saleData = {
        ...req.body,
        customerId: new mongoose.Types.ObjectId(req.body.customerId),
        vendorId: req.body.vendorId ? new mongoose.Types.ObjectId(req.body.vendorId) : undefined,
        saleDate: req.body.saleDate ? new Date(req.body.saleDate) : new Date()
      };

      const sale = new Sale(saleData);
      const validationError = sale.validateSync();
      
      if (validationError) {
        const errors = parseValidationError(validationError);
        return res.status(400).json({
          success: false,
          errors
        });
      }

      const newSale = await sale.save();
      const populatedSale = await Sale.findById(newSale._id).populate('customerId');
      
      res.status(201).json({
        success: true,
        data: populatedSale
      });
  

     const notification = new Notification({
      type: 'new_sale',
      message: `New Sale Added`,
      targetRoles: ['vendor'], 
      targetUserId: saleData.vendorId, 
      entityId: newSale._id,
      
  });
  await notification.save();

  // Emit to vendor dashboard
  io.emit("vendorNotification", notification.toObject());

      broadcastSalesUpdate(req.body.vendorId);

    } catch (err) {
      const errors = handleError(err);
      res.status(err instanceof mongoose.Error.ValidationError ? 400 : 500).json({
        success: false,
        errors
      });
    }
  });

  router.put("/sales/:id", async (req, res) => {
    try {
      const updateData = { ...req.body };

      // Convert IDs to ObjectId if provided
      if (req.body.customerId) {
        updateData.customerId = new mongoose.Types.ObjectId(req.body.customerId);
      }
      if (req.body.vendorId) {
        updateData.vendorId = new mongoose.Types.ObjectId(req.body.vendorId);
      }

      // Date handling
      if (req.body.saleDate) {
        const dateObj = new Date(req.body.saleDate);
        if (isNaN(dateObj.getTime())) {
          return res.status(400).json({ 
            success: false,
            message: "Invalid date format"
          });
        }
        updateData.saleDate = dateObj;
      }

      const updatedSale = await Sale.findByIdAndUpdate(
        req.params.id,
        updateData,
        { new: true, runValidators: true }
      ).populate('customerId');

      if (!updatedSale) {
        return res.status(404).json({ message: "Sale not found" });
      }

      res.json(updatedSale);
      broadcastSalesUpdate(updatedSale.vendorId);

    } catch (err) {
      res.status(500).json({ 
        success: false,
        message: err.message
      });
    }
  });

  router.delete("/sales/:id", async (req, res) => {
    try {
      const sale = await Sale.findById(req.params.id);
      if (!sale) {
        return res.status(404).json({ message: "Sale not found" });
      }

      const vendorId = sale.vendorId;
      await Sale.findByIdAndDelete(req.params.id);

      res.json({ message: "Sale deleted successfully" });
      broadcastSalesUpdate(vendorId);

    } catch (err) {
      res.status(500).json({ message: err.message });
    }
  });

  return router;
};