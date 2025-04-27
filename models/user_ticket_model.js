const mongoose = require("mongoose");
const QRCode = require('qrcode');
const path = require('path');
const BASE_URL_UPLOAD = "http://localhost:3000/uploads";

const userTicketSchema = new mongoose.Schema({
  user_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: [true, "User reference is required"]
  },
  festival_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Festival",
    required: [true, "Festival reference is required"]
  },
  amount: {
    type: Number,
    required: [true, "Amount is required"],
    min: [0, "Amount cannot be negative"]
  },
  payment_method: {
    type: String,
    required: [true, "Payment method is required"],
    enum: {
      values: ["EasyPaisa", "JazzCash", "BankTransfer"],
      message: "Invalid payment method"
    }
  },
  payment_proof: {
    type: String,
    required: [true, "Payment proof is required"],
    validate: {
      validator: function(v) {
        return /^(http|https):\/\/[^ "]+$/.test(v);
      },
      message: "Invalid payment proof URL format"
    }
  },
  payment_status: {
    type: String,
    enum: {
      values: ["Pending", "Approved", "Rejected"],
      message: "Invalid status. Must be Pending, Approved, or Rejected"
    },
    default: "Pending"
  },
  qr_code: {
    type: String,
    validate: {
      validator: function(v) {
        if (v === null || v === undefined || v === "") return true;
        return /^(http|https):\/\/[^ "]+$/.test(v);
      },
      message: "Invalid QR code URL format"
    },
    default: null
  },
  ticket_status: {
    type: String,
    enum: {
      values: ["Active", "Used", "Cancelled"],
      message: "Invalid ticket status"
    },
    default: "Active"
  },
  verification_code: {
    type: String,
    unique: true,
    index: true
  }
}, {
  collection: 'user_tickets',
  timestamps: true,
  strict: true
});

// Generate verification code and QR code before saving
userTicketSchema.pre('save', async function(next) {
  if (!this.verification_code) {
    this.verification_code = generateVerificationCode();
  }
  
  if (this.payment_status === 'Approved' && !this.qr_code) {
    try {
      const qrData = {
        ticketId: this._id,
        userId: this.user_id,
        festivalId: this.festival_id,
        verificationCode: this.verification_code
      };
      
      const qrCodeUrl = await generateQRCode(JSON.stringify(qrData));
      this.qr_code = qrCodeUrl;
    } catch (err) {
      return next(err);
    }
  }
  next();
});

function generateVerificationCode() {
  return Math.random().toString(36).substring(2, 10).toUpperCase();
}

async function generateQRCode(data) {
  try {
    const fileName = `qrcode-${Date.now()}.png`;
    const filePath = path.join(__dirname, '../uploads/qrcodes', fileName);
    
    await QRCode.toFile(filePath, data, {
      color: {
        dark: '#000000',
        light: '#ffffff'
      }
    });
    
    return `${BASE_URL_UPLOAD}/qrcodes/${fileName}`;
  } catch (err) {
    throw err;
  }
}

// Indexes
userTicketSchema.index({ user_id: 1 });
userTicketSchema.index({ festival_id: 1 });
userTicketSchema.index({ payment_status: 1 });
userTicketSchema.index({ verification_code: 1 });

const UserTicket = mongoose.model("UserTicket", userTicketSchema);
module.exports = UserTicket;