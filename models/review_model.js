const mongoose = require("mongoose");

const reviewSchema = new mongoose.Schema({
  customerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  },
  vendorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Vendor",
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
    repliedAt: Date
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

module.exports = mongoose.model("Review", reviewSchema);
