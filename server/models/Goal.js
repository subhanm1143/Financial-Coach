const mongoose = require("mongoose");

const goalSchema = new mongoose.Schema({
  name: { type: String, required: true },        // e.g., “Down Payment”
  targetAmount: { type: Number, required: true }, // 3000
  currentAmount: { type: Number, default: 0 },    // optional: manual or inferred
  deadline: { type: Date, required: true },
  createdAt: { type: Date, default: Date.now },

  // later: userId
});

module.exports = mongoose.model("Goal", goalSchema);
