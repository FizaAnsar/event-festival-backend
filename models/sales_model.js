const mongoose = require("mongoose");

const saleSchema = new mongoose.Schema({
  productName: { 
    type: String, 
    required: [true, "Product name is required"],
    trim: true
  },
  quantity: { 
    type: Number, 
    required: [true, "Quantity is required"],
    min: [1, "Minimum quantity is 1"]
  },
  price: { 
    type: Number,
    required: [true, "Price is required"],
    min: [0, "Price cannot be negative"]
  },
  totalPrice: {
    type: Number,
    default: function() { return this.quantity * this.price }
  },
  customerName: { 
    type: String, 
    required: [true, "Customer name is required"],
    trim: true
  },
  customerId: {
    type: mongoose.Schema.Types.ObjectId,
    required: [true, "Customer ID is required"],
    ref: 'User' 
  },
  vendorId: {
    type: mongoose.Schema.Types.ObjectId,
    required: [true, "Vendor ID is required"],
    ref: 'Vendor' 
  },
  saleDate: { 
    type: Date,
    default: Date.now,
    validate: {
      validator: function(v) {
        return v instanceof Date && !isNaN(v);
      },
      message: "Invalid date format"
    }
  },
}, { 
  collection: 'sales',
  timestamps: true,
  strict: true
});

// Pre-save hook to calculate total price
saleSchema.pre('save', function(next) {
  this.totalPrice = this.quantity * this.price;
  next();
});

const Sale = mongoose.model("Sale", saleSchema);
module.exports = Sale;