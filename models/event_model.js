const mongoose = require("mongoose");

const eventSchema = new mongoose.Schema({
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
  title: {
    type: String,
    required: [true, "Event title is required"]
  },
  eventType: {
    type: String,
    required: [true, "Event type is required"]
  },
  startTime: {
    type: Date,
    required: [true, "Start time is required"]
  },
  endTime: {
    type: Date,
    required: [true, "End time is required"]
  },
  location: {
    type: String,
    required: [true, "Location is required"]
  },
  description: String,
  status: {
    type: String,
    enum: ["draft", "published", "cancelled"],
    default: "draft"
  }
}, { 
  timestamps: true, 
  collection: 'events',
  strict: true 
});

// Auto-increment ID pre-save hook
eventSchema.pre("save", async function (next) {
  if (!this.id) {
    const lastEvent = await mongoose.model("Event")
      .findOne()
      .sort({ id: -1 })
      .select("id")
      .lean();

    this.id = lastEvent ? lastEvent.id + 1 : 1;
  }
  next();
});

// Create indexes
eventSchema.index({ id: 1 });
eventSchema.index({ festivalId: 1 });

const Event = mongoose.model("Event", eventSchema);
module.exports = Event;