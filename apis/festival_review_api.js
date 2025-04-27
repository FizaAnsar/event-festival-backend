const express = require("express");
const mongoose = require("mongoose");
const FestivalReview = require("../models/festival_review_model");
const Sentiment = require('sentiment');
const Notification = require("../models/notification_model");

module.exports = (io) => {
  const router = express.Router();

  const broadcastFestivalReviewsUpdate = async () => {
    try {
      const reviews = await FestivalReview.find()
        .sort({ createdAt: -1 })
        .populate('attendeeId festivalId');
      io.emit("festivalReviewsUpdate", reviews);
    } catch (err) {
      console.error("Error broadcasting festival reviews update:", err);
    }
  };

  // GET all festival reviews
  router.get("/festival-reviews", async (req, res) => {
    try {
      const reviews = await FestivalReview.find()
        .sort({ createdAt: -1 })
        .populate('attendeeId festivalId');
      res.json(reviews);
    } catch (err) {
      res.status(500).json({ message: err.message });
    }
  });

  // GET reviews for a specific festival
  router.get("/festival-reviews/festival/:festivalId", async (req, res) => {
    try {
      const reviews = await FestivalReview.find({ 
        festivalId: req.params.festivalId
      }).sort({ createdAt: -1 }).populate('attendeeId');
      res.json(reviews);
    } catch (err) {
      res.status(500).json({ message: err.message });
    }
  });

  // POST - Create new festival review
  router.post("/festival-reviews", async (req, res) => {
    try {
      const sentiment = new Sentiment();
      const comment = req.body.comment;
      const result = sentiment.analyze(comment);
      let sentimentResult = 'Neutral';
      if (result.score > 0) sentimentResult = 'Positive';
      if (result.score < 0) sentimentResult = 'Negative';

      const reviewData = {
        attendeeId: new mongoose.Types.ObjectId(req.body.attendeeId),
        festivalId: new mongoose.Types.ObjectId(req.body.festivalId),
        rating: req.body.rating,
        comment: req.body.comment,
        sentiment: sentimentResult,
      };

      const review = new FestivalReview(reviewData);
      const validationError = review.validateSync();

      if (validationError) {
        const errors = parseValidationError(validationError);
        return res.status(400).json({ success: false, errors });
      }
      
      const newReview = await review.save();
      
      // Notify admin about new festival review
      const notification = new Notification({
        type: 'festival_review',
        message: `New ${sentimentResult} Festival Review Added`,
        targetRoles: ['admin'], 
        entityId: newReview._id,
      });
      await notification.save();
  
      // Emit to admin dashboard
      io.emit("adminNotification", notification.toObject());
      
      const populatedReview = await FestivalReview.findById(newReview._id)
        .populate('attendeeId festivalId');

      res.status(201).json({ success: true, data: populatedReview });
      broadcastFestivalReviewsUpdate();

    } catch (err) {
      const errors = handleError(err);
      res.status(500).json({ success: false, errors });
    }
  });

  // PATCH - Add/update reply to a festival review
  router.patch("/festival-reviews/:id/reply", async (req, res) => {
    try {
      console.log('Received reply request:', req.body); // Log incoming request
      const { message } = req.body;
      
      const updatedReview = await FestivalReview.findByIdAndUpdate(
        req.params.id,
        { 
          reply: {
            message,
            repliedAt: new Date()
          }
        },
        { new: true }
      ).populate('attendeeId festivalId');
  
      console.log('Updated review:', updatedReview); // Log the result
  
      if (!updatedReview) {
        return res.status(404).json({ message: "Festival review not found" });
      }
  
      res.json(updatedReview);
      broadcastFestivalReviewsUpdate();
  
    } catch (err) {
      console.error('Error in reply endpoint:', err);
      res.status(500).json({ message: err.message });
    }
  });

  // DELETE - Remove a festival review
  router.delete("/festival-reviews/:id", async (req, res) => {
    try {
      const deletedReview = await FestivalReview.findByIdAndDelete(req.params.id);
      if (!deletedReview) {
        return res.status(404).json({ message: "Festival review not found" });
      }

      res.json({ message: "Festival review deleted successfully" });
      broadcastFestivalReviewsUpdate();

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