const mongoose = require("mongoose");

// ✅ Define User Schema
const userSchema = new mongoose.Schema(
  {
    id: { type: Number, unique: true }, // Auto-incrementing ID
    name: { type: String, required: true },
    phone: { type: String, required: true },
    email: { type: String, unique: true, required: true },
    password: { type: String, required: true },
    status: { type: String, default: "Pending" }, // Default status
    paymentProof: { type: String }, // Path of the uploaded file
    registrationDate: { type: Date, default: Date.now }, // Default current date
    festival_id: { type: mongoose.Schema.Types.ObjectId, ref: "Festival", required: true },
  },
  { collection: "users", timestamps: true }
);

userSchema.pre("save", async function (next) {
  if (!this.id) {
    const lastUser = await mongoose.model("User").findOne().sort({ id: -1 }); // Get last user's id
    this.id = lastUser ? lastUser.id + 1 : 1; // Increment or start from 1
  }
  next();
});

const User = mongoose.model("User", userSchema);

module.exports = User;
