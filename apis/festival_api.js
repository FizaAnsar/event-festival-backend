const express = require("express");
const Festival = require("../models/festival_model");
const { uploadFestivalImages } = require("../middlewares/upload");
const BASE_URL = "http://localhost:3000";

module.exports = (io) => {
  const router = express.Router();

  // WebSocket Broadcast Function
  const broadcastFestivalsUpdate = async () => {
    try {
      const festivals = await Festival.find().sort({ date: 1 }); // Sort by date ascending
      io.emit("festivalsUpdate", festivals); // Emit the updated list to all clients
    } catch (err) {
      console.error("Error broadcasting festivals update:", err);
    }
  };

  // GET all festivals
  router.get("/festivals", async (req, res) => {
    try {
      const festivals = await Festival.find().sort({ date: 1 });
      res.json(festivals);
    } catch (err) {
      res.status(500).json({ message: err.message });
    }
  });

  // GET a single festival by ID
  router.get("/festivals/:id", async (req, res) => {
    try {
      const festival = await Festival.findById(req.params.id);
      if (!festival) return res.status(404).json({ message: "Festival not found" });
      res.json(festival);
    } catch (err) {
      res.status(500).json({ message: err.message });
    }
  });

  // POST - Create new festival
  router.post("/festivals", uploadFestivalImages, async (req, res) => {
    try {
      const festivalData = {
        name: req.body.name,
        organizer: req.body.organizer,
        date: new Date(req.body.date),
        status: req.body.status,
        address: req.body.address,
        category: req.body.category,
        contact: req.body.contact,
        ticketPrice: Number(req.body.ticketPrice),
        website: req.body.website || undefined,
        guestsAllowed: Number(req.body.guestsAllowed),
        description: req.body.description,
        images: req.files?.map(file => `${BASE_URL}/${file.path.replace(/\\/g, '/')}`) || []
      };

      const festival = new Festival(festivalData);
      const validationError = festival.validateSync();
      
      if (validationError) {
        const errors = parseValidationError(validationError);
        return res.status(400).json({
          success: false,
          errors
        });
      }

      const newFestival = await festival.save();
      res.status(201).json({
        success: true,
        data: newFestival
      });

      // Broadcast the update to all clients
      broadcastFestivalsUpdate();

    } catch (err) {
      const errors = handleError(err);
      res.status(err instanceof mongoose.Error.ValidationError ? 400 : 500).json({
        success: false,
        errors
      });
    }
  });

  router.put("/festivals/:id", uploadFestivalImages, async (req, res) => {
    try {
      const updateData = { ...req.body };
  
      // Robust date handling
      if (req.body.date) {
        let dateObj;
        
        // If it's already a valid ISO string
        if (typeof req.body.date === 'string' && !isNaN(new Date(req.body.date).getTime())) {
          dateObj = new Date(req.body.date);
        }
        // If it's a Date object (from JSON parse)
        else if (typeof req.body.date === 'object' && req.body.date instanceof Date) {
          dateObj = req.body.date;
        }
        // Try to parse as date string
        else {
          dateObj = new Date(req.body.date);
        }
  
        // Final validation
        if (isNaN(dateObj.getTime())) {
          return res.status(400).json({ 
            success: false,
            message: "Invalid date format",
            received: req.body.date,
            expected: "Valid ISO 8601 date string (e.g., 2025-03-27T19:00:00.000Z)"
          });
        }
  
        updateData.date = dateObj;
      }
  
      // Rest of your update logic...
      if (req.files && req.files.length > 0) {
        const existingImages = req.body.existingImages ? 
          JSON.parse(req.body.existingImages) : [];
        
        updateData.images = [
          ...existingImages,
          ...req.files.map(file => `${BASE_URL}/${file.path.replace(/\\/g, '/')}`)
        ];
      } else if (req.body.existingImages) {
        updateData.images = JSON.parse(req.body.existingImages);
      }
  
      const updatedFestival = await Festival.findByIdAndUpdate(
        req.params.id,
        updateData,
        { new: true, runValidators: true }
      );
  
      if (!updatedFestival) {
        return res.status(404).json({ message: "Festival not found" });
      }
  
      res.json(updatedFestival);
      broadcastFestivalsUpdate();
  
    } catch (err) {
      console.error('Update error:', err);
      res.status(500).json({ 
        success: false,
        message: err.message,
        errorType: err.name
      });
    }
  });

  // DELETE a festival by ID
  router.delete("/festivals/:id", async (req, res) => {
    try {
      const deletedFestival = await Festival.findByIdAndDelete(req.params.id);
      if (!deletedFestival) {
        return res.status(404).json({ message: "Festival not found" });
      }

      res.json({ message: "Festival deleted successfully" });
      
      // Broadcast the update to all clients
      broadcastFestivalsUpdate();

    } catch (err) {
      res.status(500).json({ message: err.message });
    }
  });

  // Utility functions (same as before)
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