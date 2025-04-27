const express = require('express');
const router = express.Router();
const Notification = require("../models/notification_model");
const mongoose = require('mongoose');

module.exports = (io) => {
   // Socket.io event handlers with proper authentication
   io.on('connection', (socket) => {
    console.log(`⚡ Client connected to notifications: ${socket.id}`);

    // Handle authentication and room joining
    socket.on('authenticate', ({ userId, role, token }) => {
      try {
        // Verify token and get user role (pseudo-code)
        // const decoded = jwt.verify(token, process.env.JWT_SECRET);
        // const verifiedRole = decoded.role;
        
        // For now, we'll trust the role from client (in production, verify via token)
        if (!role) {
          throw new Error('Role is required');
        }
        
        // Join role-specific room
        socket.join(`role_${role}`);
        
        // Join user-specific room if userId provided
        if (userId) {
          socket.join(`user_${userId}`);
        }
        
        console.log(`Client authenticated as ${role} ${userId ? '(user: ' + userId + ')' : ''}`);
        
        // Send initial notifications
        if (userId) {
          broadcastNotificationsUpdate(userId, role);
        } else {
          broadcastNotificationsUpdate(null, role);
        }
        
      } catch (err) {
        console.error('Authentication error:', err);
        socket.disconnect();
      }
    });

    socket.on('disconnect', () => {
      console.log(`Client disconnected from notifications: ${socket.id}`);
    });
  });
  // WebSocket Broadcast Function with role-based filtering
  const broadcastNotificationsUpdate = async (userId = null, role = null) => {
    try {
      let query = {};
      
      if (userId) {
        query = {
          $or: [
            { targetUserId: userId },
            { targetRoles: role }
          ]
        };
        
        const userNotifications = await Notification.find(query)
          .sort({ timestamp: -1 });
        
        io.to(`user_${userId}`).emit('userNotificationsUpdate', userNotifications);
      } 
      
      if (role) {
        query = { targetRoles: role };
        const roleNotifications = await Notification.find(query)
          .sort({ timestamp: -1 });
        
        io.to(`role_${role}`).emit('roleNotificationsUpdate', roleNotifications);
      }
    } catch (err) {
      console.error("Error broadcasting notifications update:", err);
    }
  };

  // Get role-based notifications with strict filtering
  router.get('/notifications', async (req, res) => {
    try {
      const { role, user_id } = req.query;
      const limit = parseInt(req.query.limit) || 50;
      const skip = parseInt(req.query.skip) || 0;
      
      if (!role && !user_id) {
        return res.status(400).json({ 
          message: "Either role or user_id must be provided" 
        });
      }
      
      let query = {};
      
      if (role && user_id) {
        query = {
          $or: [
            { targetRoles: role },
            { targetUserId: user_id }
          ]
        };
      } else if (role) {
        query = { targetRoles: role };
      } else {
        query = { targetUserId: user_id };
      }

      const notifications = await Notification.find(query)
        .sort({ timestamp: -1 })
        .skip(skip)
        .limit(limit);
        
      res.json(notifications);
    } catch (err) {
      console.error('Error fetching notifications:', err);
      res.status(500).json({ message: err.message });
    }
  });

  // Mark notification as read with role validation
  router.patch('/notifications/:id/read', async (req, res) => {
    try {
      const { role, user_id } = req.query;
      
      if (!role && !user_id) {
        return res.status(400).json({ 
          message: "Either role or user_id must be provided" 
        });
      }
      
      // First verify the notification belongs to this user/role
      let query = { _id: req.params.id };
      
      if (user_id) {
        query.targetUserId = user_id;
      } else {
        query.targetRoles = role;
      }
      
      const notification = await Notification.findOne(query);
      
      if (!notification) {
        return res.status(404).json({ 
          message: "Notification not found or unauthorized" 
        });
      }

      const updatedNotification = await Notification.findByIdAndUpdate(
        req.params.id,
        { read: true },
        { new: true }
      );

      // Broadcast update to affected user/role
      if (updatedNotification.targetUserId) {
        broadcastNotificationsUpdate(updatedNotification.targetUserId);
      } else {
        updatedNotification.targetRoles.forEach(role => {
          broadcastNotificationsUpdate(null, role);
        });
      }

      res.json(updatedNotification);
    } catch (err) {
      console.error('Error marking notification as read:', err);
      res.status(500).json({ message: err.message });
    }
  });

  // Get unread count with role validation
  router.get('/notifications/unread-count', async (req, res) => {
    try {
      const { role, user_id } = req.query;
      
      if (!role && !user_id) {
        return res.status(400).json({ 
          message: "Either role or user_id must be provided" 
        });
      }
      
      let query = { read: false };
      
      if (user_id) {
        query.$or = [
          { targetUserId: user_id },
          { targetRoles: role }
        ];
      } else {
        query.targetRoles = role;
      }

      const count = await Notification.countDocuments(query);
      res.json({ count });
    } catch (err) {
      console.error('Error fetching unread count:', err);
      res.status(500).json({ message: err.message });
    }
  });

 

  // Secure notification sending with role validation
  const sendNotification = (notificationData) => {
    if (!notificationData.targetRoles && !notificationData.targetUserId) {
      console.error('Notification must have targets');
      return;
    }
  console.log(notificationData,"notificationData")
    const notification = new Notification(notificationData);
    notification.save()
      .then(savedNotification => {
        // User-specific notifications
        if (notificationData.targetUserId) {
          io.to(`user_${notificationData.targetUserId}`)
            .emit('userNotification', savedNotification);
        }
        
        // Role-specific notifications
        if (notificationData.targetRoles?.length) {
          notificationData.targetRoles.forEach(role => {
            if (['admin', 'vendor', 'user'].includes(role)) {
              io.to(`role_${role}`)
                .emit(`${role}Notification`, savedNotification); // Role-specific event names
            }
          });
        }
      })
      .catch(console.error);
  };

  // Expose the sendNotification function to other modules
  router.sendNotification = sendNotification;

  return router;
};