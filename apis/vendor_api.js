const express = require("express");
const Vendor = require("../models/vendor_model");
const upload = require("../middlewares/uploadMiddleware");
const path = require("path");
const mongoose = require("mongoose");
const Notification = require("../models/notification_model");
const BASE_URL = "http://localhost:3000";
const BASE_URL_UPLOAD = "http://localhost:3000/uploads";
const jwt = require('jsonwebtoken');
const nodemailer = require("nodemailer");

module.exports = (io) => {
  const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
      }
    });
  const router = express.Router();

  // Serve static files
  router.use("/uploads", express.static(path.join(__dirname, "../uploads")));

  // WebSocket Broadcast Functions
  const broadcastVendorsUpdate = async (specificVendorId = null) => {
    try {
      const vendors = await Vendor.find().sort({ createdAt: -1 });
      
      // Emit full list update
      io.emit("vendorsUpdate", vendors);
      
      // If specific vendor was updated, emit individual update
      if (specificVendorId) {
        // Convert to string first in case it's a number
        const vendorIdStr = specificVendorId.toString();
        
        // Check if it's a valid ObjectId (24 character hex string)
        if (mongoose.Types.ObjectId.isValid(vendorIdStr)) {
          const vendor = await Vendor.findById(vendorIdStr);
          if (vendor) {
            io.emit("vendorPaymentUpdate", {
              id: vendor._id.toString(), 
              payment_attachment: vendor.payment_attachment,
              payment_status: vendor.payment_status
            });
  
            const notification =new Notification({
              type: 'status_update',
              message: `Your payment has been ${status}`,
              targetRoles: ['vendor'],
              targetUserId: vendor._id, // Specific to this vendor
              entityId: vendor._id,
              metadata: {
                status: status
              }
            });
            await notification.save();
    
            // Emit admin notification
            io.emit("adminNotification", notification.toObject());
          }
        } else {
          console.warn(`Invalid vendor ID format: ${vendorIdStr}`);
        }
      }
      
      // Emit counts
      emitStatusCounts();
    } catch (err) {
      console.error("Error broadcasting vendors update:", err);
    }
  };

  const emitStatusCounts = async () => {
    try {
      // Count vendors with payment attachments
      const paymentVendorsCount = await Vendor.countDocuments({ 
        payment_attachment: { $ne: null } 
      });
      
      const [registrationCounts, paymentCounts] = await Promise.all([
        Vendor.aggregate([
          { $group: { _id: "$registration_status", count: { $sum: 1 } } }
        ]),
        Vendor.aggregate([
          { $group: { _id: "$payment_status", count: { $sum: 1 } } }
        ])
      ]);

      const counts = {
        registration: registrationCounts.reduce((acc, { _id, count }) => {
          acc[_id] = count;
          return acc;
        }, {}),
        payment: paymentCounts.reduce((acc, { _id, count }) => {
          acc[_id] = count;
          return acc;
        }, {}),
        paymentVendors: paymentVendorsCount
      };

      io.emit("vendorStatusCounts", counts);
    } catch (err) {
      console.error("Error emitting status counts:", err);
    }
  };

  // GET all vendors with optional filtering
  router.get("/vendors", async (req, res) => {
    try {
      const { registration_status, payment_status, has_payment } = req.query;
      const filter = {};
      
      if (registration_status) filter.registration_status = registration_status;
      if (payment_status) filter.payment_status = payment_status;
      if (has_payment === 'true') filter.payment_attachment = { $ne: null };
      
      const vendors = await Vendor.find(filter).sort({ createdAt: -1 });
      res.json(vendors);
    } catch (err) {
      res.status(500).json({ message: err.message });
    }
  });
  // GET vendors by festival ID
router.get("/vendors/by-festival/:festivalId", async (req, res) => {
  try {
    const { festivalId } = req.params;

    // Validate ObjectId
    if (!mongoose.Types.ObjectId.isValid(festivalId)) {
      return res.status(400).json({ 
        success: false,
        message: "Invalid festival ID format" 
      });
    }

    const vendors = await Vendor.find({ festival_id: festivalId }).sort({ createdAt: -1 });

    res.json({ 
      success: true, 
      data: vendors 
    });
  } catch (err) {
    console.error("Error fetching vendors by festival ID:", err);
    res.status(500).json({ 
      success: false,
      message: "Server error" 
    });
  }
});

     // GET vendors with payment attachments
     router.get("/vendors/with-payment-attachment", async (req, res) => {
      try {
        const vendors = await Vendor.find({ 
          payment_attachment: { $ne: null } 
        }).sort({ createdAt: -1 });
        
        res.json(vendors);
      } catch (err) {
        res.status(500).json({ message: err.message });
      }
    });

  // GET vendor by ID
  router.get("/vendors/:id", async (req, res) => {
    try {
      const vendor = await Vendor.findById(req.params.id);
      if (!vendor) return res.status(404).json({ message: "Vendor not found" });
      res.json(vendor);
    } catch (err) {
      res.status(500).json({ message: err.message });
    }
  });

  // POST - Create new vendor
  router.post("/vendors", upload.fields([
    { name: "profile_image", maxCount: 1 },
    { name: "document_attachment", maxCount: 1 },
    { name: "payment_attachment", maxCount: 1 }
  ]), async (req, res) => {
    try {
      const vendorData = {
        ...req.body,
        registration_status: "Pending",
        payment_status: req.files["payment_attachment"] ? "Pending" : null,
        profile_image: req.files["profile_image"]?.[0] ? `${BASE_URL_UPLOAD}/${req.files["profile_image"][0].filename}` : null,
        document_attachment: req.files["document_attachment"]?.[0] ? `${BASE_URL_UPLOAD}/${req.files["document_attachment"][0].filename}` : null,
        payment_attachment: req.files["payment_attachment"]?.[0] ? `${BASE_URL_UPLOAD}/${req.files["payment_attachment"][0].filename}` : null
      };

      console.log(vendorData, 'vendorData')
      const vendor = new Vendor(vendorData);
      const validationError = vendor.validateSync();
      
      if (validationError) {
        const errors = parseValidationError(validationError);
        return res.status(400).json({
          success: false,
          errors
        });
      }

      const newVendor = await vendor.save();
      // Create notification
    const notification = new Notification({
      type: 'new_vendor',
      message: `New vendor registered: ${vendor.name}`,
      targetRoles: ['admin'],
      entityId: vendor._id,
      metadata: {
        name: vendor.name,
        registrationStatus: vendor.registration_status
      }
    });
    await notification.save();

    // Emit to admin
    io.emit("adminNotification", notification.toObject());
      res.status(201).json({
        success: true,
        data: newVendor
      });

      broadcastVendorsUpdate();
    } catch (err) {
      const errors = handleError(err);
      res.status(err instanceof mongoose.Error.ValidationError ? 400 : 500).json({
        success: false,
        errors
      });
    }
  });

  // PATCH - Update registration status
  router.patch("/vendors/:id/registration-status", async (req, res) => {
    try {
      const { status } = req.body;
      const validStatuses = ["Pending", "Approved", "Rejected"];
      
      if (!validStatuses.includes(status)) {
        return res.status(400).json({ 
          success: false,
          message: `Status must be one of: ${validStatuses.join(", ")}`
        });
      }

      const vendor = await Vendor.findByIdAndUpdate(
        req.params.id,
        { registration_status: status },
        { new: true, runValidators: true }
      );

      if (!vendor) {
        return res.status(404).json({ 
          success: false,
          message: "Vendor not found" 
        });
      }

      res.json({ 
        success: true,
        data: vendor 
      });

      broadcastVendorsUpdate();
    } catch (err) {
      const errors = handleError(err);
      res.status(500).json({
        success: false,
        errors
      });
    }
  });


 

// PATCH - Update payment status
router.patch("/vendors/:id/payment-status", async (req, res) => {
  try {
    const { status } = req.body;
    const validStatuses = ["Pending", "Approved", "Rejected"];
    
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ 
        success: false,
        message: `Status must be one of: ${validStatuses.join(", ")}`
      });
    }

    const vendor = await Vendor.findByIdAndUpdate(
      req.params.id,
      { payment_status: status },
      { new: true, runValidators: true }
    );

    if (!vendor) {
      return res.status(404).json({ 
        success: false,
        message: "Vendor not found" 
      });
    }

    // Send email notification based on status
    if (status === 'Approved' || status === 'Rejected') {
      try {
        let emailSubject, emailHtml;

        if (status === 'Approved') {
          emailSubject = 'Payment Approved - Festival App';
          emailHtml = `
            <h2>Payment Status Update</h2>
            <p>Dear ${vendor.name},</p>
            <p>We are pleased to inform you that your payment has been approved.</p>
            <p>You can now login to your vendor account:</p>
            <a href="http://localhost:4200/vendor-login" style="background: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Login to Vendor Portal</a>
            <p>If you have any questions, please contact our support team.</p>
          `;
        } else { // Rejected
          emailSubject = 'Payment Rejected - Festival App';
          emailHtml = `
            <h2>Payment Status Update</h2>
            <p>Dear ${vendor.name},</p>
            <p>We regret to inform you that your payment has been rejected.</p>
            <p>Please review your payment details and submit a new payment receipt if necessary.</p>
            <p>If you believe this was a mistake, please contact our support team for assistance.</p>
          `;
        }

        await transporter.sendMail({
          from: `"Festival App" <${process.env.EMAIL_USER}>`,
          to: vendor.email,
          subject: emailSubject,
          html: emailHtml
        });

        console.log(`✅ Payment ${status} email sent to ${vendor.email}`);
      } catch (emailError) {
        console.error('Failed to send payment status email:', emailError);
        // Don't fail the whole request if email fails
      }
    }

    res.json({ 
      success: true,
      data: vendor 
    });

    // Emit specific payment status update
    io.emit("paymentStatusUpdate", {
      id: vendor._id.toString(), 
      status: vendor.payment_status
    });
    
    console.log(vendor._id, "checking vendor id format");
    // Broadcast full updates
    broadcastVendorsUpdate(vendor._id);
  } catch (err) {
    const errors = handleError(err);
    res.status(500).json({
      success: false,
      errors
    });
  }
});

// PATCH - Update payment attachment
router.patch("/vendors/:id/payment-attachment", upload.single("payment_attachment"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ 
        success: false,
        message: "No file uploaded" 
      });
    }

    // First check if vendor exists and has payment attachment
    const existingVendor = await Vendor.findById(req.params.id);
    if (!existingVendor) {
      return res.status(404).json({ 
        success: false,
        message: "Vendor not found" 
      });
    }

    if (existingVendor.payment_attachment) {
      return res.status(400).json({ 
        success: false,
        message: "Payment attachment already exists. You cannot submit payment attachment multiple times."
      });
    }

    const allowedExtensions = ["jpg", "jpeg", "png", "pdf"];
    const fileExtension = req.file.originalname.split(".").pop().toLowerCase();
    
    if (!allowedExtensions.includes(fileExtension)) {
      return res.status(400).json({ 
        success: false,
        message: `Only ${allowedExtensions.join(", ")} files are allowed`
      });
    }

    const vendor = await Vendor.findByIdAndUpdate(
      req.params.id,
      { 
        payment_attachment: `${BASE_URL_UPLOAD}/${req.file.filename}`,
        payment_status: "Pending" // Reset status when new attachment is uploaded
      },
      { new: true }
    );

    res.json({ 
      success: true,
      data: vendor 
    });

    // Emit specific updates for payment attachment changes
    io.emit("paymentAttachmentUpdate", {
      id: vendor.id,
      attachment: vendor.payment_attachment
    });
    
    // Create notification
    const notification =  new Notification({
      type: 'payment_attachment',
      message: `Payment document uploaded by ${vendor.name}`,
      targetRoles: ['admin'],
      entityId: vendor._id,
      metadata: {
        documentType: 'Payment Receipt',
        // name: fileName
        name: req.file.filename
      }
    });
    await notification.save();

    // Emit specific event
    io.emit("paymentAttachmentAdmin", {
      vendorId: vendor.id,
      fileName: req.file.filename
    });

    // Emit general admin notification
    io.emit("adminNotification", notification.toObject());
    
    // Broadcast full updates
    broadcastVendorsUpdate(vendor.id);
  } catch (err) {
    const errors = handleError(err);
    res.status(500).json({
      success: false,
      errors
    });
  }
});
router.post('/vendor/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    // 1. Find vendor with password
    const vendor = await Vendor.findOne({ email }).select('+password');
    if (!vendor) {
      return res.status(404).json({ 
        success: false,
        message: 'Vendor not found' 
      });
    }

    // 2. Check if registration is approved
    if (vendor.registration_status !== 'Approved') {
      return res.status(403).json({ 
        success: false,
        message: 'Login not allowed. Your registration is not yet approved.' 
      });
    }

    // 3. Check payment status
    if (vendor.payment_status !== 'Approved') {
      return res.status(403).json({ 
        success: false,
        message: 'Please wait for payment approval from admin. Thank you for your patience.' 
      });
    }
    
    // 4. Compare passwords
    const isMatch = await vendor.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ 
        success: false,
        message: 'Invalid credentials' 
      });
    }

    // 5. Generate JWT Token
    const token = jwt.sign(
      { 
        id: vendor._id, 
        role: 'vendor', 
      },
      process.env.JWT_SECRET || 'your_secret_key',
      { expiresIn: '1h' }
    );

    res.json({
      success: true,
      token,
      user: {
        name: vendor.name,
        email: vendor.email,
        stall_name: vendor.stall_name,
        profile_image: vendor.profile_image,
        payment_attachment: vendor.payment_attachment,
        payment_status: vendor.payment_status,
        registration_status: vendor.registration_status,
        isAssign: vendor.isAssign,
        booth_id: vendor.booth_id
      }
    });
    
  } catch (error) {
    res.status(500).json({ 
      success: false,
      message: 'Server error', 
      error: error.message 
    });
  }
});

// GET vendors by festival ID
router.get("/vendors/festival/:festivalId", async (req, res) => {
  try {
    const { festivalId } = req.params;
    
    // Validate festival ID format
    if (!mongoose.Types.ObjectId.isValid(festivalId)) {
      return res.status(400).json({ 
        success: false,
        message: "Invalid festival ID format" 
      });
    }

    const vendors = await Vendor.find({ festival_id: festivalId })
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      data: vendors
    });
  } catch (err) {
    console.error("Error fetching vendors by festival ID:", err);
    res.status(500).json({ 
      success: false,
      message: err.message 
    });
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