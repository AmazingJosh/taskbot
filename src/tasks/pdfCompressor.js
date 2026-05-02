const axios = require("axios");
const { uploadFileFromTelegram, deleteFromCloudinary } = require("../utils/fileHelper");

/**
 * PDF compression via ilovepdf API.
 * Docs: https://developer.ilovepdf.com
 */
const compressPDF = async (bot, chatId, msg) => {
  const doc = msg.document;

  if (!doc || doc.mime_type !== "application/pdf") {
    await bot.sendMessage(chatId, "📄 Please send a PDF file to compress.");
    return { success: false, error: "no_pdf" };
  }

  await bot.sendMessage(chatId, "📄 Compressing your PDF...");

  // Upload to Cloudinary to get public URL
  const { url, publicId, resourceType } = await uploadFileFromTelegram(doc.file_id, "taskbot/pdfs");

  // ── ilovepdf flow ────────────────────────────────────
  // Step 1: Start a task
  const authRes = await axios.post(
    "https://api.ilovepdf.com/v1/auth",
    { public_key: process.env.ILOVEPDF_PUBLIC_KEY }
  );
  const token = authRes.data.token;

  const taskRes = await axios.get("https://api.ilovepdf.com/v1/start/compress", {
    headers: { Authorization: `Bearer ${token}` },
  });
  const { server, task } = taskRes.data;

  // Step 2: Upload the PDF
  const uploadRes = await axios.post(
    `https://${server}/v1/upload`,
    { task, cloud_file: url },
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const serverFilename = uploadRes.data.server_filename;

  // Step 3: Process
  await axios.post(
    `https://${server}/v1/process`,
    {
      task,
      tool: "compress",
      files: [{ server_filename: serverFilename, filename: doc.file_name }],
    },
    { headers: { Authorization: `Bearer ${token}` } }
  );

  // Step 4: Download result
  const downloadRes = await axios.get(`https://${server}/v1/download/${task}`, {
    headers: { Authorization: `Bearer ${token}` },
    responseType: "arraybuffer",
  });

  // Send compressed PDF back
  await bot.sendDocument(chatId, Buffer.from(downloadRes.data), {
    caption: "✅ PDF compressed! Ready to download.",
  }, {
    filename: `compressed_${doc.file_name}`,
    contentType: "application/pdf",
  });

  await deleteFromCloudinary(publicId, resourceType);

  return { success: true };
};

module.exports = { compressPDF };