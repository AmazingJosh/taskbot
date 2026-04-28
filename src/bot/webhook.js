const express = require("express");
const router = express.Router();
const { getBot } = require("./botSetup");
const { handleUpdate } = require("./updateHandler");

router.post("/", async (req, res) => {
  // Immediately acknowledge Telegram (must respond fast)
  res.sendStatus(200);

  try {
    const update = req.body;
    const bot = getBot();
    await handleUpdate(bot, update);
  } catch (err) {
    console.error("❌ Webhook error:", err.message);
  }
});

module.exports = router;