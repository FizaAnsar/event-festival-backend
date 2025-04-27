// routes/booth-assignment_api.js
const express = require("express");
const BoothAssignment = require("../models/booth-assignmnet_model");
const Vendor = require("../models/vendor_model"); 
const Festival = require("../models/festival_model"); 
const Booth = require("../models/booth_model"); 
const mongoose = require("mongoose");
const BASE_URL = "http://localhost:3000";
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
  const broadcastVendorAssignmentUpdate = async (vendorId) => {
    try {
      const vendor = await Vendor.findById(vendorId);
      if (vendor) {
        io.emit("vendorAssignmentUpdate", {
          id: vendor.id,
          isAssign: vendor.isAssign,
          booth_id: vendor.booth_id
        });
        
        // Also emit to the specific vendor if they're connected
        io.to(`vendor_${vendor.id}`).emit("yourBoothAssignment", {
          isAssigned: vendor.isAssign,
          boothId: vendor.booth_id
        });
      }
    } catch (err) {
      console.error("Error broadcasting vendor assignment update:", err);
    }
  };
  
  // WebSocket Broadcast Function
  const broadcastAssignmentsUpdate = async () => {
    try {
      const assignments = await BoothAssignment.find()
        .populate("vendor")
        .populate("festival")
        .populate("booth")
        .sort({ id: 1 });
      io.emit("assignmentsUpdate", assignments);
    } catch (err) {
      console.error("Error broadcasting assignments update:", err);
    }
  };

  // GET all assignments
  router.get("/assignments", async (req, res) => {
    try {
      const assignments = await BoothAssignment.find()
        .populate("vendor")
        .populate("festival")
        .populate("booth")
        .sort({ id: 1 });
      res.json(assignments);
    } catch (err) {
      res.status(500).json({ message: err.message });
    }
  });

  // GET a single assignment by ID
  router.get("/assignments/:id", async (req, res) => {
    try {
      const assignment = await BoothAssignment.findById(req.params.id)
        .populate("vendor")
        .populate("festival")
        .populate("booth");
      
      if (!assignment) return res.status(404).json({ message: "Assignment not found" });
      res.json(assignment);
    } catch (err) {
      res.status(500).json({ message: err.message });
    }
  });

  // POST - Create new assignment
  router.post("/assignments", async (req, res) => {
  
    try {
      const { vendor, festival, booth } = req.body;
  
      const assignment = new BoothAssignment({ vendor, festival, booth });
      const validationError = assignment.validateSync();
  
      if (validationError) {
        const errors = parseValidationError(validationError);
        return res.status(400).json({ success: false, errors });
      }
  
      // Check if booth is already assigned
      const existingAssignment = await BoothAssignment.findOne({ booth });
      if (existingAssignment) {
        return res.status(400).json({
          success: false,
          errors: { booth: { message: "Booth is already assigned" } }
        });
      }
  
      // Check if vendor already has a booth assigned
      const vendorWithBooth = await Vendor.findOne({ _id: vendor, isAssign: true });
      if (vendorWithBooth) {
        return res.status(400).json({
          success: false,
          errors: { vendor: { message: "Vendor already has a booth assigned" } }
        });
      }
  
      // Save the assignment
      const newAssignment = await assignment.save();
     
  
      // Update vendor's booth assignment
      await Vendor.findByIdAndUpdate(vendor, {
        isAssign: true,
        booth_id: booth
      });
 
  
      // Fetch vendor, festival, and booth details
      const vendorDoc = await Vendor.findById(vendor);
      const festivalDoc = await Festival.findById(festival);
      const boothDoc = await Booth.findById(booth);
  
      const paymentLink = `${process.env.FRONTEND_URL}/payment/${newAssignment._id}`;
  
      // Email content
      const emailHtml = `
        <h2>Booth Assignment Notification</h2>
        <p>Dear ${vendorDoc.name},</p>
        <p>You have been assigned a booth for the festival.</p>
        <ul>
          <li><strong>Festival:</strong> ${festivalDoc.name}</li>
          <li><strong>Booth:</strong> ${boothDoc.boothNumber}</li>
        </ul>
        <p>Please send your payment to the following number: <strong>${festivalDoc.contact}</strong></p>
        <p>Please upload your payment receipt by clicking the button below:</p>
        <a href="${paymentLink}" style="background: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Upload Payment</a>
        <p>If you have any questions, feel free to contact our support team.</p>
      `;
  
      
      const emailResponse = await transporter.sendMail({
        from: `"Festival App" <${process.env.EMAIL_USER}>`,
        to: vendorDoc.email,
        subject: "Booth Assigned - Festival App",
        html: emailHtml
      });
  
      console.log("✅ Email sent successfully:", emailResponse);
  
      // Send real-time updates
      broadcastVendorAssignmentUpdate(vendor);
      broadcastAssignmentsUpdate();
      console.log("📢 Real-time updates broadcasted");
  
      res.status(201).json({
        success: true,
        message: "Assignment created and email sent",
        data: newAssignment
      });
  
    } catch (err) {
      console.error("🔥 Assignment error:", err);
      const errors = handleError(err);
      res.status(err instanceof mongoose.Error.ValidationError ? 400 : 500).json({
        success: false,
        errors
      });
    }
  });
  
  

  // PUT - Update assignment
  router.put("/assignments/:id", async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();
    
    try {
      const updateData = { 
        vendor: req.body.vendor,
        festival: req.body.festival,
        booth: req.body.booth
      };

      // Check if new booth is already assigned
      if (req.body.booth) {
        const existingAssignment = await BoothAssignment.findOne({ 
          booth: req.body.booth,
          _id: { $ne: req.params.id }
        });
        if (existingAssignment) {
          await session.abortTransaction();
          session.endSession();
          return res.status(400).json({
            success: false,
            errors: { booth: { message: "Booth is already assigned" } }
          });
        }
      }

      // Get current assignment to check vendor changes
      const currentAssignment = await BoothAssignment.findById(req.params.id);
      if (!currentAssignment) {
        await session.abortTransaction();
        session.endSession();
        return res.status(404).json({ message: "Assignment not found" });
      }

      // Update the assignment
      const updatedAssignment = await BoothAssignment.findByIdAndUpdate(
        req.params.id,
        updateData,
        { new: true, runValidators: true, session }
      );

      // Handle vendor changes
      if (updateData.vendor && updateData.vendor !== currentAssignment.vendor.toString()) {
        // Clear assignment from old vendor
        await Vendor.findByIdAndUpdate(
          currentAssignment.vendor,
          {
            isAssign: false,
            booth_id: null
          },
          { session }
        );

        // Set assignment to new vendor
        await Vendor.findByIdAndUpdate(
          updateData.vendor,
          {
            isAssign: true,
            booth_id: updateData.booth
          },
          { session }
        );
        broadcastVendorAssignmentUpdate(updateData.vendor); 
      } else if (updateData.booth && updateData.booth !== currentAssignment.booth.toString()) {
        // Just update booth reference for same vendor
        await Vendor.findByIdAndUpdate(
          updateData.vendor,
          {
            booth_id: updateData.booth
          },
          { session }
        );
      }

      await session.commitTransaction();
      session.endSession();

      res.json(updatedAssignment);
      broadcastAssignmentsUpdate();

    } catch (err) {
      await session.abortTransaction();
      session.endSession();
      
      const errors = handleError(err);
      res.status(err instanceof mongoose.Error.ValidationError ? 400 : 500).json({
        success: false,
        errors
      });
    }
  });

  // DELETE an assignment by ID
  router.delete("/assignments/:id", async (req, res) => {
    try {
      const assignment = await BoothAssignment.findById(req.params.id);
      if (!assignment) {
        return res.status(404).json({ message: "Assignment not found" });
      }
  
      // Clear vendor assignment
      await Vendor.findByIdAndUpdate(
        assignment.vendor,
        {
          isAssign: false,
          booth_id: null
        }
      );
  
      // Broadcast vendor update
      broadcastVendorAssignmentUpdate(assignment.vendor);
  
      // Delete the assignment
      await BoothAssignment.findByIdAndDelete(req.params.id);
  
      // Broadcast assignment update
      broadcastAssignmentsUpdate();
  
      res.json({ message: "Assignment deleted successfully" });
  
    } catch (err) {
      res.status(500).json({ message: err.message });
    }
  });
  

  // Validation error parser (same as booth API)
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

  // Error handler (same as booth API)
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