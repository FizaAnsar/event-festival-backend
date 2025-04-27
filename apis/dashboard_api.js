const express = require("express");
const Festival = require("../models/festival_model");
const Vendor = require("../models/vendor_model");
const User = require("../models/user_auth_model");
const UserTicket = require("../models/user_ticket_model");
const mongoose = require("mongoose");

module.exports = (io) => {
  const router = express.Router();

  // WebSocket Broadcast Function for Dashboard Stats
  const broadcastDashboardStats = async () => {
    try {
      const stats = await getDashboardStats();
      io.emit("dashboardStatsUpdate", stats);
    } catch (err) {
      console.error("Error broadcasting dashboard stats update:", err);
    }
  };

  // GET dashboard statistics
  router.get("/dashboard-stats", async (req, res) => {
    try {
      const stats = await getDashboardStats();
      res.json(stats);
    } catch (err) {
      res.status(500).json({ message: err.message });
    }
  });

  // Function to get all dashboard statistics
  async function getDashboardStats() {
    return {
      festivals: await getFestivalStats(),
      vendors: await getVendorStats(),
      attendees: await getAttendeeStats(),
      financials: await getFinancialStats(),
      timestamp: new Date().toISOString()
    };
  }

  // Festival Statistics
  async function getFestivalStats() {
    const now = new Date();
    
    const [totalFestivals, upcomingFestivals, activeFestivals, pastFestivals] = await Promise.all([
      Festival.countDocuments(),
      Festival.countDocuments({ date: { $gt: now } }),
      Festival.countDocuments({ 
        $and: [
          { date: { $lte: now } },
          { $or: [
            { endDate: { $gte: now } },
            { endDate: { $exists: false } }
          ]}
        ]
      }),
      Festival.countDocuments({ 
        $or: [
          { endDate: { $lt: now } },
          { $and: [
            { date: { $lt: now } },
            { endDate: { $exists: false } }
          ]}
        ]
      })
    ]);

    return {
      total: totalFestivals,
      upcoming: upcomingFestivals,
      active: activeFestivals,
      past: pastFestivals,
      byCategory: await getFestivalsByCategory(),
      latestFestivals: await Festival.find().sort({ createdAt: -1 }).limit(5)
    };
  }

  async function getFestivalsByCategory() {
    return Festival.aggregate([
      { $group: { _id: "$category", count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);
  }

  // Vendor Statistics
  async function getVendorStats() {
    const [
      totalVendors,
      approvedVendors,
      pendingVendors,
      rejectedVendors,
      paidVendors,
      vendorsByType
    ] = await Promise.all([
      Vendor.countDocuments(),
      Vendor.countDocuments({ registration_status: "Approved" }),
      Vendor.countDocuments({ registration_status: "Pending" }),
      Vendor.countDocuments({ registration_status: "Rejected" }),
      Vendor.countDocuments({ 
        payment_status: "Approved",
        payment_attachment: { $ne: null }
      }),
      Vendor.aggregate([
        { $group: { _id: "$stall_type", count: { $sum: 1 } } },
        { $sort: { count: -1 } }
      ])
    ]);

    return {
      total: totalVendors,
      approved: approvedVendors,
      pending: pendingVendors,
      rejected: rejectedVendors,
      paid: paidVendors,
      byType: vendorsByType,
      latestVendors: await Vendor.find().sort({ createdAt: -1 }).limit(5)
    };
  }

  // Attendee Statistics
  async function getAttendeeStats() {
    const [
      totalUsers,
      verifiedUsers,
      unverifiedUsers,
      ticketPurchases,
      approvedTickets,
      ticketsByFestival
    ] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ emailVerified: true }),
      User.countDocuments({ emailVerified: false }),
      UserTicket.countDocuments(),
      UserTicket.countDocuments({ payment_status: "Approved" }),
      UserTicket.aggregate([
        { 
          $lookup: {
            from: "festivals",
            localField: "festival_id",
            foreignField: "_id",
            as: "festival"
          }
        },
        { $unwind: "$festival" },
        { $group: { _id: "$festival.name", count: { $sum: 1 } } },
        { $sort: { count: -1 } }
      ])
    ]);

    return {
      total: totalUsers,
      verified: verifiedUsers,
      unverified: unverifiedUsers,
      tickets_purchased: ticketPurchases,
      tickets_approved: approvedTickets,
      byFestival: ticketsByFestival,
      latestTickets: await UserTicket.find()
        .populate("user_id", "name email")
        .populate("festival_id", "name")
        .sort({ createdAt: -1 })
        .limit(5)
    };
  }

  // Financial Statistics
  async function getFinancialStats() {
    const [
      totalRevenue,
      pendingPayments,
      revenueByFestival,
      paymentMethods
    ] = await Promise.all([
      UserTicket.aggregate([
        { $match: { payment_status: "Approved" } },
        { $group: { _id: null, total: { $sum: "$amount" } } }
      ]),
      UserTicket.aggregate([
        { $match: { payment_status: "Pending" } },
        { $group: { _id: null, total: { $sum: "$amount" } } }
      ]),
      UserTicket.aggregate([
        { $match: { payment_status: "Approved" } },
        { 
          $lookup: {
            from: "festivals",
            localField: "festival_id",
            foreignField: "_id",
            as: "festival"
          }
        },
        { $unwind: "$festival" },
        { $group: { _id: "$festival.name", total: { $sum: "$amount" } } },
        { $sort: { total: -1 } }
      ]),
      UserTicket.aggregate([
        { $group: { _id: "$payment_method", count: { $sum: 1 } } },
        { $sort: { count: -1 } }
      ])
    ]);

    return {
      total_revenue: totalRevenue[0]?.total || 0,
      pending_payments: pendingPayments[0]?.total || 0,
      revenue_by_festival: revenueByFestival,
      payment_methods: paymentMethods,
      latestTransactions: await UserTicket.find()
        .populate("user_id", "name")
        .populate("festival_id", "name")
        .sort({ createdAt: -1 })
        .limit(5)
    };
  }

  // Alternative to Change Streams: Set up periodic polling
  function setupPolling() {
    // Update stats every 30 seconds
    setInterval(broadcastDashboardStats, 30000);
  }

  // Initialize polling
  setupPolling();

  return router;
};