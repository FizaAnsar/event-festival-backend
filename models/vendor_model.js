const mongoose = require("mongoose");
const bcrypt = require("bcryptjs"); // Add bcrypt for password hashing

const vendorSchema = new mongoose.Schema({
  id: { 
    type: Number, 
    unique: true,
    index: true
  },
  name: { 
    type: String, 
    required: [true, "Vendor name is required"],
    trim: true,
    minlength: [2, "Name must be at least 2 characters"]
  },
  email: { 
    type: String, 
    required: [true, "Email is required"],
    unique: true,
    trim: true,
    lowercase: true,
    validate: {
      validator: function(v) {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
      },
      message: "Invalid email format"
    }
  },
  phone: { 
    type: String, 
    required: [true, "Phone number is required"],
    validate: {
      validator: function(v) {
        return /^[0-9]{10,}$/.test(v);
      },
      message: "Invalid phone number format (10+ digits required)"
    }
  },
  password: { 
    type: String, 
    required: [true, "Password is required"],
    minlength: [6, "Password must be at least 6 characters"],
    select: false // Don't return password in queries by default
  },
  profile_image: { 
    type: String, 
    required: [true, "Profile image is required"],
    validate: {
      validator: function(v) {
        return /^(http|https):\/\/[^ "]+$/.test(v);
      },
      message: "Invalid image URL format"
    }
  },
  stall_name: { 
    type: String, 
    required: [true, "Stall name is required"],
    trim: true,
    minlength: [2, "Stall name must be at least 2 characters"]
  },
  stall_type: { 
    type: String, 
    required: [true, "Stall type is required"],
    enum: {
      values: ["Food", "Beverage", "Merchandise", "Service", "Other"],
      message: "Invalid stall type. Must be Food, Beverage, Merchandise, Service, or Other"
    }
  },
  festival_id: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: "Festival", 
    required: [true, "Festival reference is required"]
  },
  registration_status: {
    type: String,
    enum: {
      values: ["Pending", "Approved", "Rejected"],
      message: "Invalid status. Must be Pending, Approved, or Rejected"
    },
    default: "Pending"
  },
  payment_status: {
    type: String,
    enum: {
      values: ["Pending", "Approved", "Rejected", null],
      message: "Invalid status. Must be Pending, Approved, Rejected, or null"
    },
    default: null
  },
  document_attachment: { 
    type: String, 
    required: [true, "Document attachment is required"],
    validate: {
      validator: function(v) {
        return /^(http|https):\/\/[^ "]+$/.test(v);
      },
      message: "Invalid document URL format"
    }
  },
  payment_attachment: { 
    type: String,
    validate: {
      validator: function(v) {
        if (v === null || v === undefined || v === "") return true;
        return /^(http|https):\/\/[^ "]+$/.test(v);
      },
      message: "Invalid payment attachment URL format"
    },
    default: null
  },
  emailVerified: { 
    type: Boolean, 
    default: false 
  },
  verificationToken: { 
    type: String,
    select: false // Don't return this in queries
  },
  verificationExpires: { 
    type: Date,
    select: false
  },
  isAssign: {
    type: Boolean,
    default: false
  },
  booth_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Booth",
    default: null
  }
}, { 
  collection: 'vendors',
  timestamps: true,
  strict: true
});

// Password hashing middleware (same as user model)
vendorSchema.pre("save", async function(next) {
  if (!this.isModified("password")) return next();
  
  try {
    this.password = await bcrypt.hash(this.password, 10); // 10 salt rounds
    next();
  } catch (err) {
    next(err);
  }
});

// Method to compare passwords (same as user model)
vendorSchema.methods.comparePassword = async function(candidatePassword) {
  if (!this.password) {
    // If password isn't loaded, fetch the vendor with password
    const vendorWithPassword = await this.model('Vendor').findById(this._id).select('+password');
    return bcrypt.compare(candidatePassword, vendorWithPassword.password);
  }
  return bcrypt.compare(candidatePassword, this.password);
};

// Auto-increment `id` before saving a new vendor
vendorSchema.pre("save", async function (next) {
  if (!this.id) {
    const lastVendor = await mongoose.model("Vendor").findOne().sort({ id: -1 });
    this.id = lastVendor ? lastVendor.id + 1 : 1;
  }
  next();
});

// Create index on the id field
vendorSchema.index({ id: 1 });

// Index for frequently queried fields
vendorSchema.index({ festival_id: 1 });
vendorSchema.index({ registration_status: 1 });
vendorSchema.index({ payment_status: 1 });

const Vendor = mongoose.model("Vendor", vendorSchema);
module.exports = Vendor;