const express = require("express");
const UserTicket = require("../models/user_ticket_model");
const upload = require("../middlewares/uploadMiddleware");
const path = require("path");
const mongoose = require("mongoose");
const Notification = require("../models/notification_model");
const BASE_URL = "http://localhost:3000";
const BASE_URL_UPLOAD = "http://localhost:3000/uploads";
const { sendTicketEmail } = require("../services/emailService");
const User = require("../models/user_auth_model");
const qr = require('qr-image');
const fs = require('fs');
const PDFDocument = require('pdfkit');
module.exports = (io) => {
  const router = express.Router();

  // WebSocket Broadcast Functions
  const broadcastTicketsUpdate = async (specificTicketId = null) => {
    try {
      const tickets = await UserTicket.find()
        .populate('user_id', 'name email')
        .populate('festival_id', 'name date')
        .sort({ createdAt: -1 });

      io.emit("ticketsUpdate", tickets);

      if (specificTicketId) {
        const ticket = await UserTicket.findById(specificTicketId)
          .populate('user_id', 'name email')
          .populate('festival_id', 'name date');

        if (ticket) {
          io.emit("ticketPaymentUpdate", {
            id: ticket._id,
            payment_status: ticket.payment_status,
            qr_code: ticket.qr_code
          });

          const notification = new Notification({
            type: 'ticket_status_update',
            message: `Ticket status updated for ${ticket.user_id.name}`,
            entityId: ticket._id,
            metadata: {
              user: ticket.user_id.name,
              festival: ticket.festival_id.name,
              status: ticket.payment_status
            }
          });
          await notification.save();
          io.emit("adminNotification", notification.toObject());
        }
      }

      emitStatusCounts();
    } catch (err) {
      console.error("Error broadcasting tickets update:", err);
    }
  };

  const emitStatusCounts = async () => {
    try {
      const statusCounts = await UserTicket.aggregate([
        { $group: { _id: "$payment_status", count: { $sum: 1 } } }
      ]);

      const counts = statusCounts.reduce((acc, { _id, count }) => {
        acc[_id] = count;
        return acc;
      }, {});

      io.emit("ticketStatusCounts", counts);
    } catch (err) {
      console.error("Error emitting ticket status counts:", err);
    }
  };

  // POST - Create new ticket purchase
  router.post("/tickets", upload.single("payment_proof"), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: "Payment proof is required"
        });
      }

      // 1. First check if user already has a ticket for this festival
      const existingTicket = await UserTicket.findOne({
        user_id: req.body.user_id,
        festival_id: req.body.festival_id,
        payment_status: { $ne: "Rejected" } // Optional: exclude rejected tickets
      });

      if (existingTicket) {
        return res.status(400).json({
          success: false,
          message: "You already have a ticket for this festival",
          existingTicket: existingTicket // Optional: return existing ticket details
        });
      }

      // 2. Fetch user details
      const user = await User.findById(req.body.user_id);
      if (!user) {
        return res.status(404).json({
          success: false,
          message: "User not found"
        });
      }

      // 3. Create new ticket
      const ticketData = {
        ...req.body,
        payment_status: "Pending",
        payment_method: "EasyPaisa",
        payment_proof: `${BASE_URL_UPLOAD}/${req.file.filename}`,
      };

      const ticket = new UserTicket(ticketData);
      const newTicket = await ticket.save();

      // 4. Create notification
      const notification = new Notification({
        type: 'new_ticket',
        message: `New ticket purchase by ${user.name}`,
        entityId: newTicket._id,
        metadata: {
          user: user.name,
          festival: req.body.festival_id,
          amount: newTicket.amount
        }
      });

      await notification.save();
      io.emit("adminNotification", notification.toObject());

      res.status(201).json({
        success: true,
        data: newTicket
      });

      broadcastTicketsUpdate();
    } catch (err) {
      res.status(500).json({
        success: false,
        message: err.message
      });
    }
  });

  // GET - Serve HTML verification page for QR codes
  router.get("/tickets/verify-page", async (req, res) => {
    try {
      const ticketData = JSON.parse(decodeURIComponent(req.query.data));

      // Simple HTML response (customize with your template)
      res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Ticket Verification</title>
        <style>
          body { font-family: Arial; text-align: center; padding: 20px; }
          .approved { color: green; }
          .rejected { color: red; }
          .ticket-card { border: 1px solid #ddd; padding: 20px; border-radius: 10px; }
        </style>
      </head>
      <body>
        <div class="ticket-card">
          <h1 class="${ticketData.payment_status === 'Approved' ? 'approved' : 'rejected'}">
            ${ticketData.payment_status === 'Approved' ? '✅ Approved' : '❌ Rejected'}
          </h1>
          <h2>${ticketData.festivalId.name}</h2>
          <p><strong>Attendee:</strong> ${ticketData.userId.name}</p>
          <p><strong>Email:</strong> ${ticketData.userId.email}</p>
          <p><strong>Verification Code:</strong> ${ticketData.verificationCode}</p>
        </div>
      </body>
      </html>
    `);
    } catch (err) {
      res.status(400).send("Invalid ticket data");
    }
  });





  // PATCH - Update payment status (admin approval)
  // PATCH - Update payment status (admin approval) - Simplified version
router.patch("/tickets/:id/payment-status", async (req, res) => {
  try {
    const { status } = req.body;
    const validStatuses = ["Pending", "Approved", "Rejected"];
    
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ 
        success: false,
        message: `Status must be one of: ${validStatuses.join(", ")}`
      });
    }

    const ticket = await UserTicket.findById(req.params.id)
      .populate('user_id', 'name email')
      .populate('festival_id', 'name date');

    if (!ticket) {
      return res.status(404).json({ 
        success: false,
        message: "Ticket not found" 
      });
    }

    if (status === "Approved") {
      try {
        // Create downloads directory if it doesn't exist
        const downloadsDir = path.join(__dirname, '../public/downloads');
        if (!fs.existsSync(downloadsDir)) {
          fs.mkdirSync(downloadsDir, { recursive: true, mode: 0o755 });
        }

        // Create JSON data for QR code
        const qrData = {
          ticketId: ticket._id.toString(),
          userId: ticket.user_id._id.toString(),
          festivalId: ticket.festival_id._id.toString(),
          verificationCode: ticket.verification_code,
          userName: ticket.user_id.name,
          festivalName: ticket.festival_id.name,
          festivalDate: ticket.festival_id.date,
          status: "Approved"
        };

        // Generate QR code with JSON data
        const qrFilename = `ticket-${ticket._id}.png`;
        const qrPath = path.join(downloadsDir, qrFilename);
        const qrImage = qr.imageSync(JSON.stringify(qrData), { type: 'png' });
        fs.writeFileSync(qrPath, qrImage);

        // Update ticket with QR code URL
        ticket.payment_status = status;
        ticket.qr_code = `${BASE_URL}/downloads/${qrFilename}`;
        await ticket.save();

        // Send email
        try {
          await sendTicketEmail({
            to: ticket.user_id.email,
            userName: ticket.user_id.name,
            festivalName: ticket.festival_id.name,
            amount: ticket.amount,
            qrCodeUrl: ticket.qr_code,
            verificationCode: ticket.verification_code
          });
        } catch (emailError) {
          console.error('Email sending failed:', emailError);
        }

      } catch (fileError) {
        console.error("QR code generation error:", fileError);
        return res.status(500).json({
          success: false,
          message: "Failed to generate QR code"
        });
      }
    } else {
      ticket.payment_status = status;
      await ticket.save();
    }

    res.json({ 
      success: true,
      data: ticket 
    });

    broadcastTicketsUpdate(ticket._id);

  } catch (err) {
    console.error("Payment status update error:", err);
    res.status(500).json({
      success: false,
      message: "Internal server error"
    });
  }
});

// New endpoint to verify scanned QR codes
router.post("/tickets/verify", async (req, res) => {
  try {
    const { qrData } = req.body;
    
    if (!qrData) {
      return res.status(400).json({ 
        success: false,
        message: "QR code data is required"
      });
    }

    // Parse the QR code data
    let parsedData;
    try {
      parsedData = JSON.parse(qrData);
    } catch (e) {
      return res.status(400).json({ 
        success: false,
        message: "Invalid QR code data format"
      });
    }

    // Verify the ticket
    const ticket = await UserTicket.findById(parsedData.ticketId)
      .populate('user_id', 'name email')
      .populate('festival_id', 'name date');

    if (!ticket) {
      return res.status(404).json({ 
        success: false,
        message: "Ticket not found" 
      });
    }

    // Check if ticket is approved
    if (ticket.payment_status !== "Approved") {
      return res.json({ 
        success: false,
        message: "Ticket not approved",
        data: {
          valid: false,
          status: ticket.payment_status,
          ticket: ticket
        }
      });
    }

    // Check verification code
    if (ticket.verification_code !== parsedData.verificationCode) {
      return res.json({ 
        success: false,
        message: "Invalid verification code",
        data: {
          valid: false,
          ticket: ticket
        }
      });
    }

    // If all checks pass
    res.json({ 
      success: true,
      message: "Ticket is valid",
      data: {
        valid: true,
        ticket: ticket
      }
    });

  } catch (err) {
    console.error("QR verification error:", err);
    res.status(500).json({
      success: false,
      message: "Internal server error"
    });
  }
});

// Serve QR code image download
router.get('/downloads/:filename', (req, res) => {
  const file = path.join(__dirname, '../public/downloads', req.params.filename);
  res.download(file);
});

// Serve PDF download
// Modify PDF download route
router.get('/tickets/:id/download', async (req, res) => {
  try {
    const ticket = await UserTicket.findById(req.params.id);
    if (!ticket) return res.status(404).send('Ticket not found');
    
    const filePath = path.join(__dirname, '../public/downloads', `ticket-${ticket._id}.pdf`);
    
    // Verify file exists
    if (!fs.existsSync(filePath)) {
      return res.status(404).send('Ticket PDF not found');
    }

    res.download(filePath, `FestivalTicket-${ticket._id}.pdf`, (err) => {
      if (err) console.error('Download error:', err);
    });
  } catch (err) {
    res.status(500).send('Error downloading ticket');
  }
});
  // GET all tickets with optional filtering
  router.get("/tickets", async (req, res) => {
    try {
      const { payment_status, festival_id } = req.query;
      const filter = {};

      if (payment_status) filter.payment_status = payment_status;
      if (festival_id) filter.festival_id = festival_id;

      const tickets = await UserTicket.find(filter)
        .populate('user_id', 'name email')
        .populate('festival_id', 'name date')
        .sort({ createdAt: -1 });

      res.json(tickets);
    } catch (err) {
      res.status(500).json({ message: err.message });
    }
  });

  return router;
};