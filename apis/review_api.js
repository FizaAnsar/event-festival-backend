const express = require("express");
const mongoose = require("mongoose");
const Review = require("../models/review_model");
const Sentiment = require('sentiment');
const Notification = require("../models/notification_model");
module.exports = (io) => {
  const router = express.Router();

  const broadcastReviewsUpdate = async () => {
    try {
      const reviews = await Review.find().sort({ createdAt: -1 }).populate('customerId vendorId');
      io.emit("reviewsUpdate", reviews);
    } catch (err) {
      console.error("Error broadcasting reviews update:", err);
    }
  };

  // GET all reviews
  router.get("/reviews", async (req, res) => {
    try {
      const reviews = await Review.find().sort({ createdAt: -1 }).populate('customerId vendorId');
      res.json(reviews);
    } catch (err) {
      res.status(500).json({ message: err.message });
    }
  });

  // GET reviews for a specific vendor
  router.get("/reviews/vendor/:vendorId", async (req, res) => {
    try {
      const reviews = await Review.find({ vendorId: req.params.vendorId }).sort({ createdAt: -1 }).populate('customerId');
      res.json(reviews);
    } catch (err) {
      res.status(500).json({ message: err.message });
    }
  });

  // POST - Create new review
  router.post("/reviews", async (req, res) => {
    try {
      const sentiment = new Sentiment();
      const comment = req.body.comment;
    const result = sentiment.analyze(comment);
    let sentimentResult = 'Neutral';
    if (result.score > 0) sentimentResult = 'Positive';
    if (result.score < 0) sentimentResult = 'Negative';
      const reviewData = {
        customerId: new mongoose.Types.ObjectId(req.body.customerId),
        vendorId: new mongoose.Types.ObjectId(req.body.vendorId),
        rating: req.body.rating,
        comment: req.body.comment,
        sentiment: sentimentResult,
      };

      const review = new Review(reviewData);
      const validationError = review.validateSync();

      if (validationError) {
        const errors = parseValidationError(validationError);
        return res.status(400).json({ success: false, errors });
      }
      
      const newReview = await review.save();
      const notification = new Notification({
        type: 'new_review',
        message: `New ${sentimentResult} Feedback Added`,
        targetRoles: ['vendor'], 
        targetUserId: reviewData.vendorId, 
        entityId: newReview._id,
        
    });
    await notification.save();
  
    // Emit to vendor dashboard
    io.emit("vendorNotification", notification.toObject());
      const populatedReview = await Review.findById(newReview._id).populate('customerId vendorId');

      res.status(201).json({ success: true, data: populatedReview });
      broadcastReviewsUpdate();

    } catch (err) {
      const errors = handleError(err);
      res.status(500).json({ success: false, errors });
    }
  });

  // Add this new route
router.get("/reviews/vendor/:vendorId/sentiment/:sentiment", async (req, res) => {
  try {
    const reviews = await Review.find({ 
      vendorId: req.params.vendorId,
      sentiment: req.params.sentiment 
    }).sort({ createdAt: -1 }).populate('customerId');
    
    res.json(reviews);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});
router.get("/reviews/vendor/:vendorId/stats", async (req, res) => {
  try {
    const stats = await Review.aggregate([
      { $match: { vendorId: mongoose.Types.ObjectId(req.params.vendorId) } },
      { $group: {
        _id: "$sentiment",
        count: { $sum: 1 },
        averageRating: { $avg: "$rating" }
      }}
    ]);
    
    res.json(stats);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

  // PATCH - Reply to a review
  router.patch("/reviews/:id/reply", async (req, res) => {
    try {
      const { message } = req.body;
      const reply = {
        message,
        repliedAt: new Date()
      };

      const updatedReview = await Review.findByIdAndUpdate(
        req.params.id,
        { reply },
        { new: true }
      ).populate('customerId vendorId');

      if (!updatedReview) {
        return res.status(404).json({ message: "Review not found" });
      }

      res.json(updatedReview);
      broadcastReviewsUpdate();

    } catch (err) {
      res.status(500).json({ message: err.message });
    }
  });

  // DELETE - Remove a review
  router.delete("/reviews/:id", async (req, res) => {
    try {
      const deletedReview = await Review.findByIdAndDelete(req.params.id);
      if (!deletedReview) {
        return res.status(404).json({ message: "Review not found" });
      }

      res.json({ message: "Review deleted successfully" });
      broadcastReviewsUpdate();

    } catch (err) {
      res.status(500).json({ message: err.message });
    }
  });

  // feedback analytics
  // Add these routes to your reviews API
router.get('/analytics/overview', async (req, res) => {
  try {
    const results = await Review.aggregate([
      {
        $facet: {
          totalReviews: [{ $count: "count" }],
          averageRating: [{ 
            $group: { 
              _id: null, 
              avg: { $avg: "$rating" } 
            } 
          }], // Fixed missing closing bracket
          sentimentDistribution: [ // Added colon
            { $group: { _id: "$sentiment", count: { $sum: 1 } } }
          ],
          responseRate: [ // Added colon
            { 
              $group: {
                _id: null,
                total: { $sum: 1 },
                replied: { $sum: { $cond: [{ $ifNull: ["$reply", false] }, 1, 0] } }
              }
            }
          ]
        }
      }
    ]);

    const processed = {
      totalReviews: results[0].totalReviews[0]?.count || 0,
      averageRating: results[0].averageRating[0]?.avg?.toFixed(1) || 0,
      sentimentDistribution: results[0].sentimentDistribution.reduce((acc, curr) => {
        acc[curr._id] = curr.count;
        return acc;
      }, {}),
      responseRate: results[0].responseRate[0] ? 
        (results[0].responseRate[0].replied / results[0].responseRate[0].total * 100).toFixed(1) : 0
    };

    res.json(processed);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get('/analytics/sentiment-trends', async (req, res) => {
  try {
    const { months = 6 } = req.query;
    const dateThreshold = new Date();
    dateThreshold.setMonth(dateThreshold.getMonth() - months);

    const trends = await Review.aggregate([
      { $match: { createdAt: { $gte: dateThreshold } } },
      {
        $group: {
          _id: {
            month: { $dateToString: { format: "%Y-%m", date: "$createdAt" } },
            sentiment: "$sentiment"
          },
          count: { $sum: 1 }
        }
      },
      {
        $group: {
          _id: "$_id.month",
          sentiments: {
            $push: {
              sentiment: "$_id.sentiment",
              count: "$count"
            }
          },
          total: { $sum: "$count" }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    res.json(trends);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get('/analytics/word-frequency', async (req, res) => {
  try {
    const { limit = 20 } = req.query;
    const stopWords = new Set(['the', 'and', 'a', 'to', 'was', 'is', 'for', 'it', 'of', 'with']);

    const wordStats = await Review.aggregate([
      { $project: { words: { $split: [{ $toLower: "$comment" }, " "] } } },
      { $unwind: "$words" },
      { $match: { words: { $nin: Array.from(stopWords), $regex: /^[a-zA-Z]/ } } },
      { $group: { _id: "$words", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: parseInt(limit) }
    ]);

    res.json(wordStats);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get('/analytics/rating-distribution', async (req, res) => {
  try {
    const distribution = await Review.aggregate([
      { $group: { _id: "$rating", count: { $sum: 1 } } },
      { $sort: { _id: 1 } }
    ]);

    res.json(distribution);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get('/analytics/response-metrics', async (req, res) => {
  try {
    const metrics = await Review.aggregate([
      {
        $project: {
          hasReply: { $cond: [{ $ifNull: ["$reply", false] }, 1, 0] },
          responseTime: {
            $cond: [
              "$reply.repliedAt",
              { $subtract: ["$reply.repliedAt", "$createdAt"] },
              null
            ]
          }
        }
      },
      {
        $group: {
          _id: null,
          responseRate: { $avg: "$hasReply" },
          avgResponseHours: { $avg: "$responseTime" },
          totalReviews: { $sum: 1 }
        }
      }
    ]);

    const processed = metrics[0] ? {
      responseRate: (metrics[0].responseRate * 100).toFixed(1),
      avgResponseHours: metrics[0].avgResponseHours ? 
        (metrics[0].avgResponseHours / (1000 * 60 * 60)).toFixed(1) : null,
      totalReviews: metrics[0].totalReviews
    } : {};

    res.json(processed);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get('/analytics/vendor-comparison', async (req, res) => {
  try {
    const comparison = await Review.aggregate([
      {
        $group: {
          _id: "$vendorId",
          avgRating: { $avg: "$rating" },
          totalReviews: { $sum: 1 },
          sentiment: {
            $push: "$sentiment"
          },
          responses: {
            $sum: { $cond: [{ $ifNull: ["$reply", false] }, 1, 0] }
          }
        }
      },
      {
        $project: {
          avgRating: { $round: ["$avgRating", 1] },
          totalReviews: 1,
          sentimentDistribution: {
            Positive: { 
              $size: { 
                $filter: { 
                  input: "$sentiment", 
                  as: "s", 
                  cond: { $eq: ["$$s", "Positive"] } 
                } 
              } 
            },
            Neutral: { 
              $size: { 
                $filter: { 
                  input: "$sentiment", 
                  as: "s", 
                  cond: { $eq: ["$$s", "Neutral"] } 
                } 
              } 
            }, 
            Negative: { 
              $size: { 
                $filter: { 
                  input: "$sentiment", 
                  as: "s", 
                  cond: { $eq: ["$$s", "Negative"] } 
                } 
              } 
            }
          },
          responseRate: {
            $multiply: [{ $divide: ["$responses", "$totalReviews"] }, 100]
          }
        }
      },
      { $sort: { avgRating: -1 } }
    ]);

    res.json(comparison);
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
