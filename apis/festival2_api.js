const express = require("express");
const Festival = require("../models/festival_model");
const { uploadFestivalImages } = require("../middlewares/upload");

const router = express.Router();

// GET all festivals
router.get("/festivals", async (req, res) => {
  try {
    const festivals = await Festival.find();
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

// Modified POST route
router.post("/festivals", uploadFestivalImages, async (req, res) => {
  try {
    // Validate required files
    // if (!req.files || req.files.length === 0) {
    //   return res.status(400).json({ 
    //     success: false,
    //     error: "At least one image is required"
    //   });
    // }

    // Prepare festival data with proper typing
    const festivalData = {
      name: req.body.name,
      organizer: req.body.organizer,
      date: new Date(req.body.date),
      status: req.body.status,
      address: req.body.address,
      category: req.body.category,
      contact: req.body.contact,
      website: req.body.website || undefined, // Optional field
      guestsAllowed: Number(req.body.guestsAllowed),
      description: req.body.description,
      images: req.files.map(file => file.path.replace(/\\/g, '/'))
    };

    // Validate data before saving
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

  } catch (err) {
    const errors = handleError(err);
    res.status(err instanceof mongoose.Error.ValidationError ? 400 : 500).json({
      success: false,
      errors
    });
  }
});

// Utility function to parse validation errors
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

// Enhanced error handler
function handleError(err) {
  console.error('Server Error:', err);

  // Handle duplicate key errors
  if (err.code === 11000) {
    const field = Object.keys(err.keyPattern)[0];
    return {
      [field]: {
        message: `${field.charAt(0).toUpperCase() + field.slice(1)} must be unique`
      }
    };
  }

  // Handle CastErrors (invalid ID format, etc)
  if (err instanceof mongoose.Error.CastError) {
    return {
      [err.path]: {
        message: `Invalid ${err.path} format`
      }
    };
  }

  // Generic error fallback
  return { server: { message: 'An unexpected error occurred' } };
}

// Add to router for access in route handlers
router.parseValidationError = parseValidationError;
router.handleError = handleError;
// UPDATE a festival by ID
router.put("/festivals/:id", async (req, res) => {
  try {
    const updatedFestival = await Festival.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );

    if (!updatedFestival) return res.status(404).json({ message: "Festival not found" });

    res.json(updatedFestival);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// DELETE a festival by ID
router.delete("/festivals/:id", async (req, res) => {
  try {
    const deletedFestival = await Festival.findByIdAndDelete(req.params.id);
    if (!deletedFestival) return res.status(404).json({ message: "Festival not found" });

    res.json({ message: "Festival deleted successfully" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;


