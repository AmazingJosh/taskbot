const mongoose = require("mongoose");

const taskSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true },
    platform: { type: String, enum: ["telegram", "whatsapp"], default: "telegram" },
    task: { type: String, required: true },
    status: { type: String, enum: ["success", "failed"], required: true },
    errorMessage: { type: String, default: null },
  },
  { timestamps: true }
);

const Task = mongoose.model("Task", taskSchema);

const logTask = async ({ userId, platform, task, status, errorMessage }) => {
  return Task.create({ userId, platform, task, status, errorMessage });
};

module.exports = { Task, logTask };