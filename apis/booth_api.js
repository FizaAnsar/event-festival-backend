const express = require("express");
const Booth = require("../models/booth_model");
const mongoose = require("mongoose");
const BASE_URL = "http://localhost:3000";

module.exports = (io) => {
  const router = express.Router();

  // WebSocket Broadcast Function
  const broadcastBoothsUpdate = async () => {
    try {
      const booths = await Booth.find().populate("festivalId").sort({ id: 1 });
      io.emit("boothsUpdate", booths);
    } catch (err) {
      console.error("Error broadcasting booths update:", err);
    }
  };

  // GET all booths
  router.get("/booths", async (req, res) => {
    try {
      const booths = await Booth.find().populate("festivalId").sort({ id: 1 });
      res.json(booths);
    } catch (err) {
      res.status(500).json({ message: err.message });
    }
  });

  // GET a single booth by ID
  router.get("/booths/:id", async (req, res) => {
    try {
      const booth = await Booth.findById(req.params.id).populate("festivalId");
      if (!booth) return res.status(404).json({ message: "Booth not found" });
      res.json(booth);
    } catch (err) {
      res.status(500).json({ message: err.message });
    }
  });

  // POST - Create new booth
  router.post("/booths", async (req, res) => {
    try {
      const boothData = {
        festivalId: req.body.festivalId,
        boothNumber: req.body.boothNumber,
        amount:req.body.amount
      };

      console.log(boothData,"boothData")

      const booth = new Booth(boothData);
      const validationError = booth.validateSync();
      
      if (validationError) {
        const errors = parseValidationError(validationError);
        return res.status(400).json({
          success: false,
          errors
        });
      }

      const newBooth = await booth.save();
      res.status(201).json({
        success: true,
        data: newBooth
      });

      broadcastBoothsUpdate();

    } catch (err) {
      const errors = handleError(err);
      res.status(err instanceof mongoose.Error.ValidationError ? 400 : 500).json({
        success: false,
        errors
      });
    }
  });

  // PUT - Update booth
  router.put("/booths/:id", async (req, res) => {
    try {
      const updateData = { 
        festivalId: req.body.festivalId,
        boothNumber: req.body.boothNumber,
        amount:req.body.amount
      };

      const updatedBooth = await Booth.findByIdAndUpdate(
        req.params.id,
        updateData,
        { new: true, runValidators: true }
      );

      if (!updatedBooth) {
        return res.status(404).json({ message: "Booth not found" });
      }

      res.json(updatedBooth);
      broadcastBoothsUpdate();

    } catch (err) {
      const errors = handleError(err);
      res.status(err instanceof mongoose.Error.ValidationError ? 400 : 500).json({
        success: false,
        errors
      });
    }
  });

  // DELETE a booth by ID
  router.delete("/booths/:id", async (req, res) => {
    try {
      const deletedBooth = await Booth.findByIdAndDelete(req.params.id);
      if (!deletedBooth) {
        return res.status(404).json({ message: "Booth not found" });
      }

      res.json({ message: "Booth deleted successfully" });
      broadcastBoothsUpdate();

    } catch (err) {
      res.status(500).json({ message: err.message });
    }
  });

  // Validation error parser
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

  // Error handler
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