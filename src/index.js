require("dotenv").config();
const express = require("express");
const { connectDB } = require("./config/db");
const { initBot } = require("./bot/botSetup");
const webhookRouter = require("./bot/webhook");

const app = express();
app.use(express.json());

// ── Health check ──────────────────────────────────────
app.get("/", (req, res) => res.json({ status: "TaskBot is alive 🤖" }));

app.get("/test-sharp", async (req, res) => {
  try {
    console.log("🔧 Sharp test starting...");
    const sharp = require('sharp');
    const axios = require('axios');

    console.log("📥 Downloading image...");
    const response = await axios.get(
      'https://res.cloudinary.com/dd0jpkzai/image/upload/v1777744581/taskbot/transform/file_3_ewniqo.jpg',
      { responseType: 'arraybuffer' }
    );
    console.log("✅ Image downloaded, size:", response.data.byteLength);

    console.log("✂️ Resizing with Sharp...");
    const resized = await sharp(Buffer.from(response.data))
      .resize(586, 342, { fit: 'cover', position: 'center' })
      .jpeg({ quality: 95 })
      .toBuffer();
    console.log("✅ Resized successfully");

    const meta = await sharp(resized).metadata();
    console.log("📐 Final dimensions:", meta.width, "x", meta.height);

    res.json({
      success: true,
      originalSize: response.data.byteLength,
      resizedSize: resized.length,
      width: meta.width,
      height: meta.height,
    });
  } catch (err) {
    console.error("❌ Sharp test error:", err.message);
    res.json({ success: false, error: err.message });
  }
});



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