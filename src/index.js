require("dotenv").config();
const express = require("express");
const { connectDB } = require("./config/db");
const { initBot } = require("./bot/botSetup");
const webhookRouter = require("./bot/webhook");

const app = express();
app.use(express.json());

// ── Health check ──────────────────────────────────────
app.get("/", (req, res) => res.json({ status: "TaskBot is alive 🤖" }));

// ── Telegram webhook route ────────────────────────────
app.use("/webhook", webhookRouter);

// ── Boot ──────────────────────────────────────────────
const PORT = process.env.PORT || 3000;

(async () => {
  await connectDB();
  await initBot();
  app.listen(PORT, () => {
    console.log(`🚀 TaskBot server running on port ${PORT}`);
  });
})();