const express = require("express");
const router = express.Router();
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const nodemailer = require("nodemailer");
const User = require("../models/user_auth_model");
const Notification = require("../models/notification_model");

module.exports = (io) => { // Wrap router in WebSocket function
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS
    }
  });

  // WebSocket Broadcast Function
  const broadcastUsersUpdate = async () => {
    try {
      const users = await User.find()
        .select('-password -verificationToken -verificationExpires')
        .exec();
      io.emit("usersUpdate", users);
    } catch (err) {
      console.error("Error broadcasting users update:", err);
    }
  };

  // New GET endpoint for fetching users
  router.get("/users", async (req, res) => {
    try {
      const users = await User.find()
        .select('-password -verificationToken -verificationExpires')
        .exec();
      res.json(users);
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });

  /**
   * @route POST /api/signup
   * @desc Register a new user
   * @access Public
   */
  router.post("/signup", async (req, res) => {
    try {
        const { name, phone, email, password } = req.body;
        console.log(req.body, "request body");

        // Validation
        if (!name || !phone || !email || !password) {
            return res.status(400).json({ message: "All fields are required" });
        }

        // Check for existing user (case-insensitive)
        const existingUser = await User.findOne({ 
            email: { $regex: new RegExp(`^${email}$`, 'i') } 
        });
        
        if (existingUser) {
            return res.status(409).json({ message: "Email already exists" });
        }

        // Password validation
        if (password.length < 8) {
            return res.status(400).json({ message: "Password must be at least 8 characters" });
        }

        const verificationToken = crypto.randomBytes(32).toString('hex');
        const verificationExpires = Date.now() + 3600000; // 1 hour expiration

        // Create user
        const user = new User({ 
            name, 
            phone, 
            email: email.toLowerCase(),
            password: password,
            verificationToken,
            verificationExpires
        });

        await user.save();
      
        // Create admin notification with targetRoles
        const notification = new Notification({
            type: 'new_user',
            message: `New user registered: ${user.email}`,
            targetRoles: ['admin'], // Only admins should see this
            targetUserId: null, // Not targeting a specific user
            entityId: user._id,
            metadata: {
                name: user.name,
                email: user.email,
                status: user.status
            }
        });
        await notification.save();

        // Emit to admin dashboard
        io.emit("adminNotification", notification.toObject());
        await broadcastUsersUpdate();

        // Send verification email
        const verificationUrl = `${process.env.FRONTEND_URL}/verify-email?token=${verificationToken}`;
        
        await transporter.sendMail({
            from: `"Festival App" <${process.env.EMAIL_USER}>`,
            to: email,
            subject: "Please Verify Your Email",
            html: `
                <h2>Welcome to Festival App!</h2>
                <p>Please verify your email by clicking the link below:</p>
                <a href="${verificationUrl}">Verify Email</a>
                <p>This link will expire in 1 hour.</p>
            `
        });

        res.status(201).json({ 
            success: true,
            message: "Verification email sent. Please check your inbox."
        });

    } catch (error) {
        console.error("Signup error:", error);
        res.status(500).json({ 
            success: false,
            message: "Registration failed",
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// Get a single user by ID
router.get("/users/:id", async (req, res) => {
  try {
    const userId = req.params.id;
    console.log(userId,"userId");
    const user = await User.findById(userId)
      .select('-password -verificationToken -verificationExpires')
      .exec();

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    res.json(user);
  } catch (error) {
    console.error("Get user by ID error:", error);
    res.status(500).json({ message: "Server error" });
  }
});

/**
 * @route GET /api/verify-email
 * @desc Verify user's email with token
 * @access Public
 */
router.get("/verify-email", async (req, res) => {
  try {
      const { token } = req.query;

      // Validate token exists
      if (!token || typeof token !== 'string') {
          console.log('Email verification attempt with missing token');
          return res.status(400).json({ 
              success: false,
              verified: false,
              message: "Verification token is required",
              code: "MISSING_TOKEN"
          });
      }

      console.log(`Starting email verification for token: ${token.substring(0, 8)}...`);

      // Find and update user
      const user = await User.findOneAndUpdate(
          { 
              verificationToken: token,
              verificationExpires: { $gt: Date.now() }
          },
          { 
              $set: { 
                  emailVerified: true,
                  status: "Active",
                  updatedAt: new Date()
              },
              $unset: {
                  verificationToken: "",
                  verificationExpires: ""
              }
          },
          { 
              new: true,
              projection: { 
                  name: 1,
                  email: 1,
                  status: 1
              } 
          }
      );

      // Handle invalid/expired token
      if (!user) {
          console.log(`Failed verification attempt - invalid/expired token: ${token.substring(0, 8)}...`);
          return res.status(400).json({
              success: false,
              verified: false,
              message: "Invalid or expired verification token",
              code: "INVALID_TOKEN"
          });
      }

      console.log(`Successfully verified email for user: ${user.email}`);

      // Create verification notification with targetRoles
      const verificationNotification = new Notification({
          type: 'user_verified',
          message: `User verified email: ${user.email}`,
          targetRoles: ['admin'], // Only admins need to know
          targetUserId: user._id, // Also associate with this user
          entityId: user._id,
          metadata: {
              name: user.name,
              email: user.email,
              status: user.status
          }
      });

      await verificationNotification.save();

      // Create user-specific notification
      const userNotification = new Notification({
          type: 'welcome',
          message: `Welcome to Festival App, ${user.name}! Your email has been verified.`,
          targetRoles: ['user'], // Only this user will see
          targetUserId: user._id, // Specifically for this user
          entityId: user._id,
          metadata: {
              name: user.name,
              status: user.status
          }
      });
      await userNotification.save();

      // Emit real-time events
      io.emit("adminNotification", verificationNotification.toObject());
      io.to(user._id.toString()).emit("userNotification", userNotification.toObject());
      await broadcastUsersUpdate();

      // Successful response
      return res.json({
          success: true,
          verified: true,
          message: "Email verified successfully",
          user: {
              id: user._id,
              email: user.email,
              name: user.name,
              status: user.status
          },
          timestamp: new Date().toISOString()
      });

  } catch (error) {
      console.error("Email verification error:", error);
      
      if (error.name === 'MongoError' && error.code === 11000) {
          return res.status(500).json({
              success: false,
              verified: false,
              message: "Database error during verification",
              code: "DATABASE_ERROR"
          });
      }

      return res.status(500).json({
          success: false,
          verified: false,
          message: "Email verification failed due to server error",
          code: "SERVER_ERROR",
          error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
  }
});
  
/**
 * @route POST /api/login
 * @desc Authenticate user and get JWT token
 * @access Public
 */
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    // Input validation
    if (!email || !password) {
      return res.status(400).json({ 
        message: "Email and password are required" 
      });
    }

    // Find user
    const user = await User.findOne({ 
      email: { $regex: new RegExp(`^${email}$`, 'i') } 
    });

    if (!user) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    // Use the instance method for comparison
    const isMatch = await user.comparePassword(password);
    console.log('Password match:', isMatch);

    if (!isMatch) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    // Check verification and status
    if (!user.emailVerified) {
      // Create notification for user about unverified email
      const notification = new Notification({
        type: 'login_attempt_unverified',
        message: `Login attempt with unverified email: ${user.email}`,
        targetRoles: ['admin', 'user'],
        targetUserId: user._id,
        entityId: user._id,
        metadata: {
          email: user.email,
          status: user.status
        }
      });
      await notification.save();

      io.emit("adminNotification", notification.toObject());
      io.to(user._id.toString()).emit("userNotification", notification.toObject());

      return res.status(403).json({ 
        message: "Please verify your email first",
        notificationId: notification._id // Optional: return notification ID
      });
    }

    if (user.status !== "Active") {
      // Create notification about inactive account
      const notification = new Notification({
        type: 'login_attempt_inactive',
        message: `Login attempt with inactive account: ${user.email}`,
        targetRoles: ['admin'],
        targetUserId: user._id,
        entityId: user._id,
        metadata: {
          email: user.email,
          status: user.status
        }
      });
      await notification.save();

      io.emit("adminNotification", notification.toObject());

      return res.status(403).json({ 
        message: "Account is not active",
        notificationId: notification._id
      });
    }

    // Generate token
    const token = jwt.sign(
      { 
        userId: user._id, 
        email: user.email,
        role: 'user' // Include role in JWT
      },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    // Create successful login notification
    const loginNotification = new Notification({
      type: 'user_login',
      message: `User logged in: ${user.email}`,
      targetRoles: ['admin'],
      targetUserId: user._id,
      entityId: user._id,
      metadata: {
        name: user.name,
        loginTime: new Date().toISOString()
      }
    });
    await loginNotification.save();

    io.emit("adminNotification", loginNotification.toObject());

    // Return response
    res.json({ 
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        status: user.status
      },
      notifications: [loginNotification.toObject()] // Optional: include recent notifications
    });

  } catch (error) {
    console.error("Login error:", error);
    
    // Create error notification for admins
    const errorNotification = new Notification({
      type: 'login_error',
      message: `Login error for email: ${req.body.email}`,
      targetRoles: ['admin'],
      metadata: {
        error: error.message,
        timestamp: new Date().toISOString()
      }
    });
    await errorNotification.save();

    io.emit("adminNotification", errorNotification.toObject());

    res.status(500).json({ 
      message: "Authentication failed",
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

  return router;
};