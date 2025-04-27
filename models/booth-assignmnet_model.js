// models/booth-assignment.model.js
const mongoose = require("mongoose");

const boothAssignmentSchema = new mongoose.Schema({
  id: {
    type: Number,
    unique: true,
    index: true
  },
  vendor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Vendor",
    required: [true, "Vendor reference is required"]
  },
  festival: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Festival",
    required: [true, "Festival reference is required"]
  },
  booth: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Booth",
    required: [true, "Booth reference is required"],
    unique: true
  },
  assignedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true,
  collection: 'booth_assignments',
  strict: true
});

// Auto-increment ID pre-save hook
boothAssignmentSchema.pre("save", async function (next) {
  if (!this.id) {
    const lastAssignment = await mongoose.model("BoothAssignment")
      .findOne()
      .sort({ id: -1 })
      .select("id")
      .lean();

    this.id = lastAssignment ? lastAssignment.id + 1 : 1;
  }
  next();
});

// Create index on the id field
boothAssignmentSchema.index({ id: 1 });

const BoothAssignment = mongoose.model("BoothAssignment", boothAssignmentSchema);
module.exports = BoothAssignment;