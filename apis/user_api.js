const express = require("express");
const bcrypt = require("bcryptjs");
const upload = require("../middlewares/uploadMiddleware"); // ✅ Import middleware
const User = require("../models/user_model");
module.exports = (io) => {
  const router = express.Router();

  // WebSocket Broadcast Function
  const broadcastUpdate = async () => {
    const users = await User.find();
    const pendingCount = await User.countDocuments({ status: "pending" });
    const approvedCount = await User.countDocuments({ status: "approved" });
    const rejectedCount = await User.countDocuments({ status: "rejected" });

    const data = {
      users,
      counts: { pending: pendingCount, approved: approvedCount, rejected: rejectedCount },
    };

    io.emit("usersUpdate", data); // Emit event via WebSockets
  };

  router.get("/users", async (req, res) => {
    try {
        console.log("Fetching users...");

        // ✅ Fetch all users and sort them in descending order (newest first)
        const users = await User.find().sort({ _id: -1 });

       

        // ✅ Count users based on different statuses
        const pendingCount = await User.countDocuments({ status: "pending" });
        const approvedCount = await User.countDocuments({ status: "approved" });
        const rejectedCount = await User.countDocuments({ status: "rejected" });

      

        res.json({
            users: users, // ✅ Send modified user list
            counts: { pending: pendingCount, approved: approvedCount, rejected: rejectedCount },
        });

    } catch (err) {
        console.error("Error fetching users:", err);
        res.status(500).json({ message: err.message });
    }
});

  

  

  // 📌 Create a new user with file upload
  router.post("/users", upload.single("paymentProof"), async (req, res) => {
    try {
        const hashedPassword = await bcrypt.hash(req.body.password, 10);
        const paymentProofPath = req.file ? `http://localhost:3000/uploads/${req.file.filename}` : null; 

        const user = new User({
            name: req.body.name,
            phone: req.body.phone,
            email: req.body.email,
            password: hashedPassword,
            festival_id: req.body.festival_id,
            paymentProof: paymentProofPath, // ✅ Save URL instead of local path
            status: "pending", // Default status
        });

        const newUser = await user.save();
        // In attendee route handler
const notification = new Notification({
  type: 'new_attendee',
  message: `New attendee registered: ${attendee.name}`,
  entityId: attendee._id,
  metadata: {
    name: attendee.name,
    ticketType: attendee.ticket_type
  }
});
await notification.save();
io.emit("adminNotification", notification.toObject());
        res.status(201).json(newUser);
        broadcastUpdate(); // Notify clients via WebSockets
    } catch (err) {
        res.status(400).json({ message: err.message });
    }
});

  // 📌 Update user status
  router.patch("/users/:id/status", async (req, res) => {
    try {
      const user = await User.findById(req.params.id);
      if (!user) return res.status(404).json({ message: "User not found" });

      user.status = req.body.status;
      await user.save();
      res.json({ message: "User status updated" });
      broadcastUpdate(); // Notify all clients via WebSockets
    } catch (err) {
      res.status(400).json({ message: err.message });
    }
  });

  return router;
};
