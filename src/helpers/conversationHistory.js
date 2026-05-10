const mongoose = require('mongoose');

/**
 * Conversation History — stores last 5 messages per user in MongoDB.
 * Survives Render restarts. Powers Taskify's conversational intelligence.
 */

const messageSchema = new mongoose.Schema({
  role:    { type: String, enum: ['user', 'assistant'], required: true },
  content: { type: String, required: true },
  type:    { type: String, default: 'text' }, // text, photo, audio, document
});

const historySchema = new mongoose.Schema({
  userId:   { type: String, required: true, unique: true },
  messages: { type: [messageSchema], default: [] },
  updatedAt: { type: Date, default: Date.now },
});

historySchema.index({ updatedAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 }); // auto-delete after 24hrs

const History = mongoose.models.History || mongoose.model('History', historySchema);

const MAX_MESSAGES = 5;

/**
 * Add a message to user's conversation history.
 * Keeps only last MAX_MESSAGES messages.
 */
const addMessage = async (userId, role, content, type = 'text') => {
  const doc = await History.findOneAndUpdate(
    { userId: String(userId) },
    {
      $push: {
        messages: {
          $each: [{ role, content, type }],
          $slice: -MAX_MESSAGES, // keep only last 5
        },
      },
      updatedAt: new Date(),
    },
    { upsert: true, new: true }
  );
  return doc;
};

/**
 * Get conversation history for a user.
 * Returns array of { role, content, type }
 */
const getHistory = async (userId) => {
  const doc = await History.findOne({ userId: String(userId) });
  return doc?.messages || [];
};

/**
 * Clear conversation history for a user.
 */
const clearHistory = async (userId) => {
  await History.deleteOne({ userId: String(userId) });
};

module.exports = { addMessage, getHistory, clearHistory };