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
    const sharp = require('sharp');
    const axios = require('axios');

    // Download a test image
    const response = await axios.get(
      'https://upload.wikimedia.org/wikipedia/commons/thumb/4/47/PNG_transparency_demonstration_1.png/280px-PNG_transparency_demonstration_1.png',
      { responseType: 'arraybuffer' }
    );

    // Resize to exact 586x342 with smart crop
    const resized = await sharp(Buffer.from(response.data))
      .resize(586, 342, { fit: 'cover', position: 'center' })
      .jpeg({ quality: 95 })
      .toBuffer();

    res.json({
      success: true,
      originalSize: response.data.byteLength,
      resizedSize: resized.length,
      dimensions: '586x342',
    });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});
app.get("/test-sharp", async (req, res) => {
  try {
    const sharp = require('sharp');
    const axios = require('axios');

    const response = await axios.get(
      'https://picsum.photos/1200/800.jpg',
      { responseType: 'arraybuffer' }
    );

    const resized = await sharp(Buffer.from(response.data))
      .resize(586, 342, { fit: 'cover', position: 'center' })
      .jpeg({ quality: 95 })
      .toBuffer();

    // Get metadata to confirm dimensions
    const meta = await sharp(resized).metadata();

    res.json({
      success: true,
      originalSize: response.data.byteLength,
      resizedSize: resized.length,
      width: meta.width,
      height: meta.height,
    });
  } catch (err) {
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