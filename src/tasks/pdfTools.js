const ILovePDFApi = require('@ilovepdf/ilovepdf-nodejs');
const { uploadFileFromTelegram, deleteFromCloudinary } = require('../helpers/fileHelper');
const { setSession, getSession, clearSession } = require('../helpers/sessionStore');

/**
 * PDF & Document Tools — powered by ilovepdf API
 */
const getInstance = () => new ILovePDFApi(
  process.env.ILOVEPDF_PUBLIC_KEY,
  process.env.ILOVEPDF_SECRET_KEY
);

/**
 * Core processor
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
 * Get file URL from Telegram
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
    caption: '✅ PDF compressed! File size reduced.',
    parse_mode: 'MarkdownV2'
  }, { 
    filename: `compressed_${msg.document.file_name}`, 
    contentType: 'application/pdf' 
  });

  await deleteFromCloudinary(file.publicId, file.resourceType);
  return { success: true };
};

// ─────────────────────────────────────────────────────────────
// 2. PDF TO WORD
// ─────────────────────────────────────────────────────────────
const pdfToWord = async (bot, chatId, msg) => {
  if (!msg.document || msg.document.mime_type !== 'application/pdf') {
    await bot.sendMessage(chatId, '📄 Please send a PDF file to convert to Word.');
    return { success: false, error: 'no_pdf' };
  }

  await bot.sendMessage(chatId, '📝 Converting PDF to Word...');
  
  const file = await getFileUrl(msg);
  const result = await processFile(file.url, 'officepdf', { output_format: 'docx' });

  await bot.sendDocument(chatId, Buffer.from(result), {
    caption: '✅ Converted to Word! Ready to edit.',
    parse_mode: 'MarkdownV2'
  }, { 
    filename: `${msg.document.file_name.replace('.pdf', '')}.docx`, 
    contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' 
  });

  await deleteFromCloudinary(file.publicId, file.resourceType);
  return { success: true };
};

// ─────────────────────────────────────────────────────────────
// 3. WORD / EXCEL / PPT TO PDF
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
    await bot.sendMessage(chatId, '📄 I can convert Word \\(.docx\\), Excel \\(.xlsx\\) and PowerPoint \\(.pptx\\) files to PDF.');
    return { success: false, error: 'unsupported_type' };
  }

  await bot.sendMessage(chatId, '📄 Converting to PDF...');
  
  const file = await getFileUrl(msg);
  const result = await processFile(file.url, 'officepdf');

  const originalName = doc.file_name.replace(/\.(docx|xlsx|pptx|doc|xls|ppt)$/i, '');

  await bot.sendDocument(chatId, Buffer.from(result), {
    caption: '✅ Converted to PDF!',
    parse_mode: 'MarkdownV2'
  }, { 
    filename: `${originalName}.pdf`, 
    contentType: 'application/pdf' 
  });

  await deleteFromCloudinary(file.publicId, file.resourceType);
  return { success: true };
};

// ─────────────────────────────────────────────────────────────
// 4. PDF TO JPG
// ─────────────────────────────────────────────────────────────
const pdfToJPG = async (bot, chatId, msg) => {
  if (!msg.document || msg.document.mime_type !== 'application/pdf') {
    await bot.sendMessage(chatId, '📄 Please send a PDF file to convert to JPG.');
    return { success: false, error: 'no_pdf' };
  }

  await bot.sendMessage(chatId, '🖼 Converting PDF pages to JPG images...');
  
  const file = await getFileUrl(msg);
  const result = await processFile(file.url, 'pdfjpg', { pdfjpg_mode: 'pages' });

  await bot.sendDocument(chatId, Buffer.from(result), {
    caption: '✅ PDF converted to JPG images \\(zip file containing all pages\\)',
    parse_mode: 'MarkdownV2'
  }, { 
    filename: `${msg.document.file_name.replace('.pdf', '')}_images.zip`, 
    contentType: 'application/zip' 
  });

  await deleteFromCloudinary(file.publicId, file.resourceType);
  return { success: true };
};

// ─────────────────────────────────────────────────────────────
// 5. JPG / IMAGE TO PDF
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
    parse_mode: 'MarkdownV2'
  }, { 
    filename: 'converted.pdf', 
    contentType: 'application/pdf' 
  });

  await deleteFromCloudinary(upload.publicId, upload.resourceType);
  return { success: true };
};

// ─────────────────────────────────────────────────────────────
// 6. MERGE PDFs
// ─────────────────────────────────────────────────────────────
const mergePDFs = async (bot, chatId, msg, params = {}) => {
  const userId = msg.from.id;
  const doc = msg.document;
  const session = getSession(userId);

  // Adding more files
  if (session?.step === 'waiting_for_merge_files') {
    if (doc?.mime_type === 'application/pdf') {
      const files = [...session.files, doc.file_id];
      setSession(userId, { ...session, files });

      await bot.sendMessage(chatId, 
        `✅ Got PDF ${files.length}! Send more PDFs or type *merge now* to combine them.`,
        { parse_mode: 'MarkdownV2' }
      );
      return { success: true, pending: true };
    }

    // User says merge now
    if (msg.text?.toLowerCase().includes('merge')) {
      if (session.files.length < 2) {
        await bot.sendMessage(chatId, '📄 I need at least 2 PDFs to merge. Send another PDF first.');
        return { success: true, pending: true };
      }

      await bot.sendMessage(chatId, `🔀 Merging ${session.files.length} PDFs...`);
      
      const instance = getInstance();
      const task = instance.newTask('merge');
      await task.start();

      for (const fileId of session.files) {
        const upload = await uploadFileFromTelegram(fileId, 'taskbot/pdfs');
        await task.addFile(upload.url);
        await deleteFromCloudinary(upload.publicId, upload.resourceType);
      }

      await task.process();
      const result = await task.download();

      await bot.sendDocument(chatId, Buffer.from(result), {
        caption: `✅ ${session.files.length} PDFs merged into one!`,
        parse_mode: 'MarkdownV2'
      }, { 
        filename: 'merged.pdf', 
        contentType: 'application/pdf' 
      });

      clearSession(userId);
      return { success: true };
    }
  }

  // Start new merge flow
  if (doc?.mime_type === 'application/pdf') {
    setSession(userId, { step: 'waiting_for_merge_files', files: [doc.file_id] });
    await bot.sendMessage(chatId, 
      '✅ Got PDF 1! Send the next PDF to merge.\n\nSend as many as you want, then type *merge now* when ready.',
      { parse_mode: 'MarkdownV2' }
    );
    return { success: true, pending: true };
  }

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
    caption: '✅ PDF split! Each page is now a separate PDF \\(zip file\\).',
    parse_mode: 'MarkdownV2'
  }, { 
    filename: `split_${msg.document.file_name}`, 
    contentType: 'application/zip' 
  });

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
    parse_mode: 'MarkdownV2'
  }, { 
    filename: `unlocked_${msg.document.file_name}`, 
    contentType: 'application/pdf' 
  });

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
    parse_mode: 'MarkdownV2'
  }, { 
    filename: `repaired_${msg.document.file_name}`, 
    contentType: 'application/pdf' 
  });

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