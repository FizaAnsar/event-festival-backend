const mongoose = require("mongoose");

const festivalReviewSchema = new mongoose.Schema({
  attendeeId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  },
  festivalId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Festival",
    required: true
  },
  rating: {
    type: Number,
    required: true,
    min: 1,
    max: 5
  },
  comment: {
    type: String,
    required: true
  },
  reply: {
    message: String,
    repliedAt: {
      type: Date,
      default: Date.now
    }
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  sentiment: {
    type: String,
    enum: ['Positive', 'Neutral', 'Negative'],
    required: true
  }
});

module.exports = mongoose.model("FestivalReview", festivalReviewSchema);