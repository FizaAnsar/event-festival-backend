const mongoose = require("mongoose");

const menuItemSchema = new mongoose.Schema({
  name: { 
    type: String, 
    required: [true, "Menu item name is required"],
    trim: true
  },
  description: { 
    type: String,
    trim: true
  },
  price: { 
    type: Number,
    required: [true, "Price is required"],
    min: [0, "Price cannot be negative"]
  },
  imageUrl: { 
    type: String,
    validate: {
      validator: function(v) {
        // Allow empty/undefined imageUrl
        if (!v) return true;
        return /^(http|https):\/\/[^ "]+$/.test(v);
      },
      message: "Invalid URL format (must include http:// or https://)"
    }
  },
  category: { 
    type: String, 
    required: [true, "Category is required"],
    trim: true
  },
  status: { 
    type: String, 
    required: [true, "Status is required"],
    enum: {
      values: ["active", "inactive", "out_of_stock"],
      message: "Invalid status. Must be active, inactive, or out_of_stock"
    },
    default: "active"
  },
  vendorId: { 
    type: String, 
    required: [true, "Vendor ID is required"]
  }
}, { 
  collection: 'menu_items',
  timestamps: true,
  strict: true
});

const MenuItem = mongoose.model("MenuItem", menuItemSchema);
module.exports = MenuItem;