const mongoose = require("mongoose");
const notificationSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ['new_vendor', 'new_attendee', 'payment_attachment', 'status_update', 'new_user','festival_review','login_attempt_unverified','welcome', 'new_ticket', 'ticket_status_update', 'user_verified', 'booth_assigned','new_sale','new_review','user_login','login_error'],
    required: true
  },
  message: {
    type: String,
    required: true
  },
  timestamp: {
    type: Date,
    default: Date.now
  },
  read: {
    type: Boolean,
    default: false
  },
  entityId: mongoose.Schema.Types.ObjectId,
  targetRoles: {
    type: [String],
    enum: ['admin', 'vendor', 'user'],
    required: true
  },
  targetUserId: {
    type: mongoose.Schema.Types.ObjectId,
    required: false
  },
  metadata: {
    documentType: String,
    name: String,
    amount: Number,
  }
}, { 
  collection: 'notifications',
  timestamps: true,
  strict: true
});

// Add this line to actually create and export the model
const Notification = mongoose.model("Notification", notificationSchema);
module.exports = Notification;