require("dotenv").config();
const express = require("express");
const { connectDB } = require("./config/db");
const { initBot } = require("./bot/botSetup");
const webhookRouter = require("./bot/webhook");

const app = express();
app.use(express.json());

// ── Health check ──────────────────────────────────────
app.get("/", (req, res) => res.json({ status: "TaskBot is alive 🤖" }));

app.get("/test-pdf", async (req, res) => {
  try {
    const ILovePDFApi = require('@ilovepdf/ilovepdf-nodejs');
    const instance = new ILovePDFApi(
      process.env.ILOVEPDF_PUBLIC_KEY,
      process.env.ILOVEPDF_SECRET_KEY
    );
    const task = instance.newTask('compress');
    await task.start();
    await task.addFile('https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf');
    await task.process();
    const data = await task.download();
    res.json({ success: true, sizeBytes: data.length });
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