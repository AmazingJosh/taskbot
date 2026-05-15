const ILovePDFApi = require('@ilovepdf/ilovepdf-nodejs');
const { uploadFileFromTelegram, deleteFromCloudinary } = require('../helpers/fileHelper');
const { setSession, getSession, clearSession } = require('../helpers/sessionStore');

/**
 * PDF Tools — powered by ilovepdf API
 * 
 * Verified supported tasks:
 * compress, merge, split, officepdf, pdfjpg, imagepdf, unlock, repair
 * 
 * NOT supported by API: pdf to word, pdf to excel, pdf to powerpoint
 */

const getInstance = () => new ILovePDFApi(
  process.env.ILOVEPDF_PUBLIC_KEY,
  process.env.ILOVEPDF_SECRET_KEY
);

/**
 * Core processor — runs any ilovepdf task on a single file URL
 */
const processFile = async (fileUrl, taskName, options = {}) => {
  const instance = getInstance();
  const task = instance.newTask(taskName);
  await task.start();
  await task.addFile(fileUrl);
  await task.process(options);
  return await task.download();
};

/**
 * Get file from Telegram message and upload to Cloudinary
 */
const getFileUrl = async (msg) => {
  const doc = msg.document || msg.photo?.[msg.photo.length - 1];
  if (!doc) return null;
  const upload = await uploadFileFromTelegram(doc.file_id, 'taskbot/pdfs');
  return { url: upload.url, publicId: upload.publicId, resourceType: upload.resourceType };
};

// ─────────────────────────────────────────────────────────────
// 1. COMPRESS PDF
// ─────────────────────────────────────────────────────────────
const compressPDF = async (bot, chatId, msg) => {
  if (!msg.document || msg.document.mime_type !== 'application/pdf') {
    await bot.sendMessage(chatId, '📄 Please send a PDF file to compress.');
    return { success: false, error: 'no_pdf' };
  }

  await bot.sendMessage(chatId, '📦 Compressing your PDF...');

  const file = await getFileUrl(msg);
  const result = await processFile(file.url, 'compress');

  await bot.sendDocument(chatId, Buffer.from(result), {
    caption: `✅ PDF compressed and ready!`,
  }, { filename: `compressed_${msg.document.file_name}`, contentType: 'application/pdf' });

  await deleteFromCloudinary(file.publicId, file.resourceType);
  return { success: true };
};

// ─────────────────────────────────────────────────────────────
// 2. PDF TO WORD — NOT SUPPORTED BY API
// ─────────────────────────────────────────────────────────────
const pdfToWord = async (bot, chatId, msg) => {
  await bot.sendMessage(
    chatId,
    "😕 PDF to Word isn't available yet — we're working on it! 🔜\n\nWhat I can do with PDFs right now:\n• Compress PDF\n• Convert Word/Excel/PPT to PDF\n• PDF to JPG images\n• Merge, Split, Unlock, Repair"
  );
  return { success: true, pending: true };
};

// ─────────────────────────────────────────────────────────────
// 3. OFFICE TO PDF (Word, Excel, PowerPoint → PDF)
// ─────────────────────────────────────────────────────────────
const officeToPDF = async (bot, chatId, msg) => {
  const doc = msg.document;
  if (!doc) {
    await bot.sendMessage(chatId, '📄 Please send a Word, Excel or PowerPoint file.');
    return { success: false, error: 'no_file' };
  }

  const supportedTypes = [
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/vnd.ms-powerpoint',
  ];

  if (!supportedTypes.includes(doc.mime_type)) {
    await bot.sendMessage(chatId, '📄 I can convert Word (.docx), Excel (.xlsx) and PowerPoint (.pptx) files to PDF.');
    return { success: false, error: 'unsupported_type' };
  }

  await bot.sendMessage(chatId, '📄 Converting to PDF...');

  const file = await getFileUrl(msg);
  const result = await processFile(file.url, 'officepdf');

  const originalName = doc.file_name.replace(/\.(docx|xlsx|pptx|doc|xls|ppt)$/i, '');
  await bot.sendDocument(chatId, Buffer.from(result), {
    caption: '✅ Converted to PDF!',
  }, { filename: `${originalName}.pdf`, contentType: 'application/pdf' });

  await deleteFromCloudinary(file.publicId, file.resourceType);
  return { success: true };
};

// ─────────────────────────────────────────────────────────────
// 4. PDF TO JPG
// ─────────────────────────────────────────────────────────────
const pdfToJPG = async (bot, chatId, msg) => {
  if (!msg.document || msg.document.mime_type !== 'application/pdf') {
    await bot.sendMessage(chatId, '📄 Please send a PDF file to convert to images.');
    return { success: false, error: 'no_pdf' };
  }

  await bot.sendMessage(chatId, '🖼 Converting PDF to JPG images...');

  const file = await getFileUrl(msg);
  const result = await processFile(file.url, 'pdfjpg', { pdfjpg_mode: 'pages' });

  await bot.sendDocument(chatId, Buffer.from(result), {
    caption: '✅ PDF converted to JPG images! (zip file with all pages)',
  }, { filename: `${msg.document.file_name.replace('.pdf', '')}_images.zip`, contentType: 'application/zip' });

  await deleteFromCloudinary(file.publicId, file.resourceType);
  return { success: true };
};

// ─────────────────────────────────────────────────────────────
// 5. IMAGE TO PDF
// ─────────────────────────────────────────────────────────────
const imageToPDF = async (bot, chatId, msg) => {
  const photo = msg.photo?.[msg.photo.length - 1] || msg.document;

  if (!photo) {
    await bot.sendMessage(chatId, '🖼 Please send an image to convert to PDF.');
    return { success: false, error: 'no_image' };
  }

  await bot.sendMessage(chatId, '📄 Converting image to PDF...');

  const upload = await uploadFileFromTelegram(photo.file_id, 'taskbot/pdfs');

  const instance = getInstance();
  const task = instance.newTask('imagepdf');
  await task.start();
  await task.addFile(upload.url);
  await task.process();
  const result = await task.download();

  await bot.sendDocument(chatId, Buffer.from(result), {
    caption: '✅ Image converted to PDF!',
  }, { filename: 'converted.pdf', contentType: 'application/pdf' });

  await deleteFromCloudinary(upload.publicId, upload.resourceType);
  return { success: true };
};

// ─────────────────────────────────────────────────────────────
// 6. MERGE PDFs — multi-step session flow
// ─────────────────────────────────────────────────────────────
const mergePDFs = async (bot, chatId, msg) => {
  const userId = msg.from.id;
  const doc = msg.document;

  // ── Step 1: Check if we're already collecting files ──────
  const session = await getSession(userId); // MUST await

  if (session?.step === 'waiting_for_merge_files') {

    // User sent another PDF — add it
    if (doc?.mime_type === 'application/pdf') {
      const updatedFiles = [...session.files, doc.file_id];
      await setSession(userId, { step: 'waiting_for_merge_files', files: updatedFiles });

      await bot.sendMessage(
        chatId,
        `✅ Got PDF ${updatedFiles.length}! Send more PDFs or type "merge now" to combine them.`
      );
      return { success: true, pending: true };
    }

    // User typed "merge now" — execute the merge
    if (msg.text?.toLowerCase().includes('merge')) {
      if (session.files.length < 2) {
        await bot.sendMessage(chatId, '📄 I need at least 2 PDFs to merge. Please send another PDF first.');
        return { success: true, pending: true };
      }

      await bot.sendMessage(chatId, `🔀 Merging ${session.files.length} PDFs... give me a moment!`);

      const instance = getInstance();
      const task = instance.newTask('merge');
      await task.start();

      // Upload and add all collected files
      const uploads = [];
      for (const fileId of session.files) {
        const upload = await uploadFileFromTelegram(fileId, 'taskbot/pdfs');
        await task.addFile(upload.url);
        uploads.push(upload);
      }

      await task.process();
      const result = await task.download();

      await bot.sendDocument(chatId, Buffer.from(result), {
        caption: `✅ ${session.files.length} PDFs merged into one!`,
      }, { filename: 'merged.pdf', contentType: 'application/pdf' });

      // Cleanup all uploaded files
      for (const upload of uploads) {
        await deleteFromCloudinary(upload.publicId, upload.resourceType);
      }

      await clearSession(userId);
      return { success: true };
    }

    // User sent something else — remind them what to do
    await bot.sendMessage(
      chatId,
      `📎 I'm collecting PDFs to merge. Send more PDFs or type "merge now" to combine the ${session.files.length} PDF(s) you've sent so far.`
    );
    return { success: true, pending: true };
  }

  // ── Step 0: Start merge flow — need first PDF ─────────────
  if (doc?.mime_type === 'application/pdf') {
    await setSession(userId, { step: 'waiting_for_merge_files', files: [doc.file_id] });
    await bot.sendMessage(
      chatId,
      '✅ Got PDF 1! Send the next PDF to merge.\n\nSend as many as you want, then type "merge now" when ready.'
    );
    return { success: true, pending: true };
  }

  // No PDF sent
  await bot.sendMessage(chatId, '📄 Send me the first PDF you want to merge!');
  return { success: true, pending: true };
};

// ─────────────────────────────────────────────────────────────
// 7. SPLIT PDF
// ─────────────────────────────────────────────────────────────
const splitPDF = async (bot, chatId, msg) => {
  if (!msg.document || msg.document.mime_type !== 'application/pdf') {
    await bot.sendMessage(chatId, '📄 Please send a PDF file to split.');
    return { success: false, error: 'no_pdf' };
  }

  await bot.sendMessage(chatId, '✂️ Splitting PDF into individual pages...');

  const file = await getFileUrl(msg);
  const result = await processFile(file.url, 'split', { split_mode: 'pages' });

  await bot.sendDocument(chatId, Buffer.from(result), {
    caption: '✅ PDF split! Each page is now a separate PDF (zip file).',
  }, { filename: `split_${msg.document.file_name}`, contentType: 'application/zip' });

  await deleteFromCloudinary(file.publicId, file.resourceType);
  return { success: true };
};

// ─────────────────────────────────────────────────────────────
// 8. UNLOCK PDF
// ─────────────────────────────────────────────────────────────
const unlockPDF = async (bot, chatId, msg) => {
  if (!msg.document || msg.document.mime_type !== 'application/pdf') {
    await bot.sendMessage(chatId, '📄 Please send the password-protected PDF to unlock.');
    return { success: false, error: 'no_pdf' };
  }

  await bot.sendMessage(chatId, '🔓 Unlocking PDF...');

  const file = await getFileUrl(msg);
  const result = await processFile(file.url, 'unlock');

  await bot.sendDocument(chatId, Buffer.from(result), {
    caption: '✅ PDF unlocked! No more password needed.',
  }, { filename: `unlocked_${msg.document.file_name}`, contentType: 'application/pdf' });

  await deleteFromCloudinary(file.publicId, file.resourceType);
  return { success: true };
};

// ─────────────────────────────────────────────────────────────
// 9. REPAIR PDF
// ─────────────────────────────────────────────────────────────
const repairPDF = async (bot, chatId, msg) => {
  if (!msg.document || msg.document.mime_type !== 'application/pdf') {
    await bot.sendMessage(chatId, '📄 Please send the damaged PDF to repair.');
    return { success: false, error: 'no_pdf' };
  }

  await bot.sendMessage(chatId, '🔧 Repairing PDF...');

  const file = await getFileUrl(msg);
  const result = await processFile(file.url, 'repair');

  await bot.sendDocument(chatId, Buffer.from(result), {
    caption: '✅ PDF repaired!',
  }, { filename: `repaired_${msg.document.file_name}`, contentType: 'application/pdf' });

  await deleteFromCloudinary(file.publicId, file.resourceType);
  return { success: true };
};

module.exports = {
  compressPDF,
  pdfToWord,
  officeToPDF,
  pdfToJPG,
  imageToPDF,
  mergePDFs,
  splitPDF,
  unlockPDF,
  repairPDF,
};