const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    telegramId: { type: String, required: true, unique: true },
    username: { type: String },
    platform: { type: String, enum: ["telegram", "whatsapp"], default: "telegram" },
    taskCount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

const User = mongoose.model("User", userSchema);

const findOrCreateUser = async ({ telegramId, username, platform }) => {
  let user = await User.findOne({ telegramId });
  if (!user) {
    user = await User.create({ telegramId, username, platform });
  }
  return user;
};

module.exports = { User, findOrCreateUser };