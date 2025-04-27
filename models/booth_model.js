const mongoose = require("mongoose");

const boothSchema = new mongoose.Schema({
  id: { 
    type: Number, 
    unique: true,
    index: true
  },
  festivalId: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: "Festival", 
      required: [true, "Festival reference is required"]
    },
  boothNumber: { 
    type: String, 
    required: [true, "Booth number is required"], 
    unique: true 
  },
  amount :{
    type: Number,
    required: [true, "Booth rent is required"],
    min: [0, "Booth rent cannot be negative"]
  }
}, { 
  timestamps: true, 
  collection: 'booths',
  strict: true 
});

// Auto-increment ID pre-save hook
// Modified pre-save hook ensures proper sequencing
boothSchema.pre("save", async function (next) {
  if (!this.id) {
    const lastBooth = await mongoose.model("Booth")
      .findOne() // Get the latest document
      .sort({ id: -1 }) // Sort by ID descending
      .select("id") // Only get the ID field
      .lean(); // Return plain JS object

    this.id = lastBooth ? lastBooth.id + 1 : 1;
  }
  next();
});

// Create index on the id field
boothSchema.index({ id: 1 });

const Booth = mongoose.model("Booth", boothSchema);
module.exports = Booth;