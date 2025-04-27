const express = require("express");
const Event = require("../models/event_model");
const mongoose = require("mongoose");
const BASE_URL = "http://localhost:3000";
module.exports = (io) => {
  const router = express.Router();

  // WebSocket Broadcast Function
  const broadcastEventsUpdate = async () => {
    try {
      const events = await Event.find().populate("festivalId").sort({ id: 1 });
      io.emit("eventsUpdate", events);
    } catch (err) {
      console.error("Error broadcasting events update:", err);
    }
  };

  // GET events by festival ID
router.get("/events/festival/:festivalId", async (req, res) => {
  try {
    const events = await Event.find({ festivalId: req.params.festivalId }).populate("festivalId").sort({ startTime: 1 });

    if (!events.length) {
      return res.status(404).json({ message: "No events found for this festival" });
    }

    res.json(events);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});
  // GET all events
  router.get("/events", async (req, res) => {
    try {
      const events = await Event.find().populate("festivalId").sort({ id: 1 });
      res.json(events);
    } catch (err) {
      res.status(500).json({ message: err.message });
    }
  });

  // GET a single event by ID
  router.get("/events/:id", async (req, res) => {
    try {
      const event = await Event.findById(req.params.id).populate("festivalId");
      if (!event) return res.status(404).json({ message: "Event not found" });
      res.json(event);
    } catch (err) {
      res.status(500).json({ message: err.message });
    }
  });
  // GET events by festival ID
router.get("/events/festival/:festivalId", async (req, res) => {
  try {
    const { festivalId } = req.params;
    
    // Validate festival ID format
    if (!mongoose.Types.ObjectId.isValid(festivalId)) {
      return res.status(400).json({ 
        success: false,
        message: "Invalid festival ID format" 
      });
    }

    const events = await Event.find({ festivalId: festivalId })
      .populate("festivalId")
      .sort({ startTime: 1 }); // Sort by start time (earliest first)

    res.json({
      success: true,
      data: events
    });

  } catch (err) {
    console.error("Error fetching events by festival ID:", err);
    res.status(500).json({ 
      success: false,
      message: err.message 
    });
  }
});

  // POST - Create new event
  router.post("/events", async (req, res) => {
    try {
      const eventData = {
        festivalId: req.body.festivalId,
        title: req.body.title,
        eventType: req.body.eventType,
        startTime: req.body.startTime,
        endTime: req.body.endTime,
        location: req.body.location,
        description: req.body.description,
        status: req.body.status || "draft"
      };

      const event = new Event(eventData);
      const validationError = event.validateSync();
      
      if (validationError) {
        const errors = parseValidationError(validationError);
        return res.status(400).json({
          success: false,
          errors
        });
      }

      const newEvent = await event.save();
      res.status(201).json({
        success: true,
        data: newEvent
      });

      broadcastEventsUpdate();

    } catch (err) {
      const errors = handleError(err);
      res.status(err instanceof mongoose.Error.ValidationError ? 400 : 500).json({
        success: false,
        errors
      });
    }
  });

  // PUT - Update event
  router.put("/events/:id", async (req, res) => {
    try {
      const updateData = { 
        festivalId: req.body.festivalId,
        title: req.body.title,
        eventType: req.body.eventType,
        startTime: req.body.startTime,
        endTime: req.body.endTime,
        location: req.body.location,
        description: req.body.description,
        status: req.body.status
      };

      const updatedEvent = await Event.findByIdAndUpdate(
        req.params.id,
        updateData,
        { new: true, runValidators: true }
      );

      if (!updatedEvent) {
        return res.status(404).json({ message: "Event not found" });
      }

      res.json(updatedEvent);
      broadcastEventsUpdate();

    } catch (err) {
      const errors = handleError(err);
      res.status(err instanceof mongoose.Error.ValidationError ? 400 : 500).json({
        success: false,
        errors
      });
    }
  });

  // DELETE an event by ID
  router.delete("/events/:id", async (req, res) => {
    try {
      const deletedEvent = await Event.findByIdAndDelete(req.params.id);
      if (!deletedEvent) {
        return res.status(404).json({ message: "Event not found" });
      }

      res.json({ message: "Event deleted successfully" });
      broadcastEventsUpdate();

    } catch (err) {
      res.status(500).json({ message: err.message });
    }
  });

  // PATCH - Update event status
router.patch("/events/:id/status", async (req, res) => {
  try {
    const { status } = req.body;
    const allowedStatuses = ["draft", "published", "cancelled"];

    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        errors: {
          status: {
            message: "Invalid status. Allowed values: draft, published, cancelled"
          }
        }
      });
    }

    const event = await Event.findById(req.params.id);
    if (!event) {
      return res.status(404).json({ message: "Event not found" });
    }

    // Add status transition validation if needed
    if (event.status === "cancelled" && status !== "cancelled") {
      return res.status(400).json({
        success: false,
        errors: {
          status: {
            message: "Cancelled events cannot be reactivated"
          }
        }
      });
    }

    const updatedEvent = await Event.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true, runValidators: true }
    );

    res.json(updatedEvent);
    broadcastEventsUpdate();

  } catch (err) {
    const errors = handleError(err);
    res.status(err instanceof mongoose.Error.ValidationError ? 400 : 500).json({
      success: false,
      errors
    });
  }
});

  // Validation error parser (reuse from booth API)
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

  // Error handler (reuse from booth API with event-specific messages)
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