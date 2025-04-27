const mongoose = require("mongoose");

const festivalSchema = new mongoose.Schema({
 
  name: { 
    type: String, 
    required: [true, "Festival name is required"],
    trim: true
  },
  organizer: { 
    type: String, 
    required: [true, "Organizer name is required"],
    trim: true
  },
  date: { 
    type: Date,
    required: [true, "Festival date is required"],
    validate: {
      validator: function(v) {
        return v instanceof Date && !isNaN(v);
      },
      message: "Invalid date format"
    }
  },
  status: { 
    type: String, 
    required: [true, "Status is required"],
    enum: {
      values: ["Active", "Inactive", "Upcoming"],
      message: "Invalid status. Must be Active, Inactive, or Upcoming"
    }
  },
  address: { 
    type: String, 
    required: [true, "Address is required"],
    trim: true
  },
  category: { 
    type: String, 
    required: [true, "Category is required"],
    enum: {
      values: ["Religious", "Cultural", "Music", "Food"],
      message: "Invalid category. Must be Religious, Cultural, Music, or Food"
    }
  },
  contact: { 
    type: String, 
    required: [true, "Contact number is required"],
    validate: {
      validator: function(v) {
        return /^[0-9]{10,}$/.test(v);
      },
      message: "Invalid phone number format (10+ digits required)"
    }
  },
  website: { 
    type: String,
    validate: {
      validator: function(v) {
        return /^(http|https):\/\/[^ "]+$/.test(v);
      },
      message: "Invalid URL format (must include http:// or https://)"
    }
  },
  description: { 
    type: String,
    trim: true
  },
  guestsAllowed: { 
    type: Number, // Changed from String to Number for consistency
    required: [true, "Guest capacity is required"],
    min: [1, "Minimum 1 guest required"]
  },
  images: { 
    type: [String]
  },
  ticketPrice: { 
    type: Number,
    required: [true, "Ticket price is required"],
    min: [0, "Ticket price cannot be negative"]
  }
}, { 
  collection: 'festivals',
  timestamps: true,
  strict: true
});


const Festival = mongoose.model("Festival", festivalSchema);
module.exports = Festival;