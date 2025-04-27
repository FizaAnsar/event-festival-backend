// vendor_performance_api.js
const express = require("express");
const mongoose = require("mongoose");
const Sale = require("../models/sales_model");
const Review = require("../models/review_model");
const Vendor = require("../models/vendor_model");
const Festival = require("../models/festival_model"); // Assuming you have a Festival model

module.exports = (io) => {
  const router = express.Router();

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
      return { [field]: { message: `${field.charAt(0).toUpperCase() + field.slice(1)} must be unique` } };
    }
    if (err instanceof mongoose.Error.CastError) {
      return { [err.path]: { message: `Invalid ${err.path} format` } };
    }
    return { server: { message: 'An unexpected error occurred' } };
  }

  router.get("/vendor-performance", async (req, res) => {
    try {
      console.log('Starting vendor performance calculation');
      const { vendorId, festivalId } = req.query;
      
      if (!festivalId) {
        console.error('festivalId is required');
        return res.status(400).json({ 
          success: false,
          message: "festivalId is required"
        });
      }

      // Get festival info
      console.log(`Fetching festival with ID: ${festivalId}`);
      const festival = await Festival.findById(festivalId);
      if (!festival) {
        console.error('Festival not found');
        return res.status(404).json({ 
          success: false,
          message: "Festival not found"
        });
      }
      console.log(`Found festival: ${festival.name}`);

      // Get vendors for this festival
      console.log(`Fetching vendors for festival ${festivalId}${vendorId ? ` (specific vendor: ${vendorId})` : ''}`);
      const vendors = await Vendor.find({ 
        ...(vendorId && { _id: vendorId }),
        festival_id: festivalId 
      }).lean();

      if (vendors.length === 0) {
        console.error('No vendors found for festival');
        return res.status(404).json({ 
          success: false,
          message: "No vendors found for the specified criteria"
        });
      }
      console.log(`Found ${vendors.length} vendors`);

      // Convert vendor IDs to ObjectIds for matching
      const vendorIds = vendors.map(v => v._id);
      console.log('Vendor IDs to query:', vendorIds);

      // SALES AGGREGATION
      console.log('Starting sales aggregation');
      const salesAggregation = await Sale.aggregate([
        { 
          $match: {
            vendorId: { $in: vendorIds }
          } 
        },
        {
          $group: {
            _id: "$vendorId",
            totalSales: { $sum: 1 },
            totalRevenue: { $sum: "$totalPrice" },
            totalProductsSold: { $sum: "$quantity" },
            uniqueCustomers: { $addToSet: "$customerId" }
          }
        }
      ]);

      console.log('Raw sales aggregation results:', JSON.stringify(salesAggregation, null, 2));

      // Create a map of vendor sales data
      const salesMap = new Map();
      salesAggregation.forEach(sale => {
        console.log(`Found sales for vendor ${sale._id}: ${sale.totalSales} sales`);
        salesMap.set(sale._id.toString(), sale);
      });

      // CUSTOMER ENGAGEMENT
      console.log('Starting customer engagement aggregation');
      const engagementAggregation = await Sale.aggregate([
        { 
          $match: {
            vendorId: { $in: vendorIds }
          } 
        },
        {
          $group: {
            _id: {
              vendorId: "$vendorId",
              customerId: "$customerId"
            },
            orderCount: { $sum: 1 }
          }
        },
        {
          $group: {
            _id: "$_id.vendorId",
            totalCustomers: { $sum: 1 },
            repeatCustomers: {
              $sum: {
                $cond: [{ $gt: ["$orderCount", 1] }, 1, 0]
              }
            }
          }
        }
      ]);

      console.log('Raw engagement aggregation results:', JSON.stringify(engagementAggregation, null, 2));

      // Create a map of engagement data
      const engagementMap = new Map();
      engagementAggregation.forEach(engagement => {
        console.log(`Found engagement for vendor ${engagement._id}: ${engagement.totalCustomers} customers`);
        engagementMap.set(engagement._id.toString(), engagement);
      });

      // REVIEWS AGGREGATION
      console.log('Starting reviews aggregation');
      const reviewAggregation = await Review.aggregate([
        { 
          $match: { 
            vendorId: { $in: vendorIds }
          } 
        },
        {
          $group: {
            _id: "$vendorId",
            avgRating: { $avg: "$rating" },
            totalReviews: { $sum: 1 },
            sentimentCounts: {
              $push: "$sentiment"
            }
          }
        }
      ]);

      console.log('Raw review aggregation results:', JSON.stringify(reviewAggregation, null, 2));

      // Create a map of review data
      const reviewMap = new Map();
      reviewAggregation.forEach(review => {
        console.log(`Found reviews for vendor ${review._id}: ${review.totalReviews} reviews`);
        reviewMap.set(review._id.toString(), review);
      });

      // COMBINE RESULTS
      console.log('Combining results for all vendors');
      const vendorPerformance = vendors.map(vendor => {
        const vendorIdStr = vendor._id.toString();
        console.log(`Processing vendor ${vendorIdStr} (${vendor.name})`);

        const sales = salesMap.get(vendorIdStr) || {};
        const engagement = engagementMap.get(vendorIdStr) || {};
        const reviews = reviewMap.get(vendorIdStr) || {};

        console.log(`Sales data for ${vendorIdStr}:`, sales);
        console.log(`Engagement data for ${vendorIdStr}:`, engagement);
        console.log(`Review data for ${vendorIdStr}:`, reviews);

        // Calculate metrics
        const avgOrderValue = sales.totalSales ? sales.totalRevenue / sales.totalSales : 0;
        let repeatCustomerRate = 0;
        if (engagement.totalCustomers) {
          repeatCustomerRate = (engagement.repeatCustomers / engagement.totalCustomers) * 100;
        }

        let sentimentDistribution = {
          Positive: 0,
          Neutral: 0,
          Negative: 0
        };
        
        if (reviews.sentimentCounts) {
          sentimentDistribution.Positive = reviews.sentimentCounts.filter(s => s === 'Positive').length;
          sentimentDistribution.Neutral = reviews.sentimentCounts.filter(s => s === 'Neutral').length;
          sentimentDistribution.Negative = reviews.sentimentCounts.filter(s => s === 'Negative').length;
        }

        const result = {
          vendorId: vendor._id,
          vendorName: vendor.name,
          stallName: vendor.stall_name,
          stallType: vendor.stall_type,
          totalSales: sales.totalSales || 0,
          totalRevenue: sales.totalRevenue || 0,
          avgOrderValue: avgOrderValue,
          totalProductsSold: sales.totalProductsSold || 0,
          uniqueCustomers: sales.uniqueCustomers ? sales.uniqueCustomers.length : 0,
          repeatCustomerRate: repeatCustomerRate,
          avgRating: reviews.avgRating ? parseFloat(reviews.avgRating.toFixed(1)) : 0,
          totalReviews: reviews.totalReviews || 0,
          sentimentDistribution: sentimentDistribution,
          festivalName: festival.name
        };

        console.log(`Final metrics for ${vendorIdStr}:`, result);
        return result;
      });

      console.log('Completed performance calculation');
      res.json({
        success: true,
        data: vendorId ? vendorPerformance[0] : vendorPerformance,
        filters: {
          vendorId,
          festivalId
        }
      });

    } catch (err) {
      console.error("Error in vendor-performance:", err);
      res.status(500).json({ 
        success: false,
        message: err.message,
        stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
      });
    }
  });

  return router;
};