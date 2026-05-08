const sharp = require('sharp');
const axios = require('axios');
const { uploadFileFromTelegram, deleteFromCloudinary } = require('../helpers/fileHelper');
const { setSession, getSession, clearSession } = require('../helpers/sessionStore');

const PRESETS = {
  'whatsapp dp':         { width: 500,  height: 500,  label: 'WhatsApp DP'         },
  'whatsapp':            { width: 500,  height: 500,  label: 'WhatsApp DP'         },
  'instagram post':      { width: 1080, height: 1080, label: 'Instagram Post'      },
  'instagram story':     { width: 1080, height: 1920, label: 'Instagram Story'     },
  'instagram landscape': { width: 1080, height: 566,  label: 'Instagram Landscape' },
  'facebook post':       { width: 1200, height: 630,  label: 'Facebook Post'       },
  'facebook cover':      { width: 851,  height: 315,  label: 'Facebook Cover'      },
  'twitter post':        { width: 1024, height: 512,  label: 'Twitter Post'        },
  'twitter header':      { width: 1500, height: 500,  label: 'Twitter Header'      },
  'linkedin post':       { width: 1200, height: 627,  label: 'LinkedIn Post'       },
  'linkedin banner':     { width: 1584, height: 396,  label: 'LinkedIn Banner'     },
  'youtube thumbnail':   { width: 1280, height: 720,  label: 'YouTube Thumbnail'   },
  'tiktok':              { width: 1080, height: 1920, label: 'TikTok'              },
  'passport':            { width: 413,  height: 531,  label: 'Passport Photo'      },
  'cv photo':            { width: 300,  height: 300,  label: 'CV Photo'            },
  'linkedin profile':    { width: 400,  height: 400,  label: 'LinkedIn Profile'    },
  'og image':            { width: 1200, height: 630,  label: 'OG Image'            },
  'banner':              { width: 1200, height: 400,  label: 'Web Banner'          },
};

const parseDimensions = (text = '') => {
  const match = text.match(/(\d+)\s*[xX×*]\s*(\d+)/);
  if (match) return { width: parseInt(match[1]), height: parseInt(match[2]) };
  return null;
};

const detectPreset = (text = '') => {
  const lower = text.toLowerCase();
  for (const [key, val] of Object.entries(PRESETS)) {
    if (lower.includes(key)) return { ...val };
  }
  return null;
};

/**
 * MODE 1: Scale to fit
 * Shrinks/enlarges entire image proportionally to fit within target.
 * Nothing cut. Nothing distorted.
 * Result may not be exact target size if aspect ratios differ.
 */
const scaleToFit = async (imageBuffer, targetWidth, targetHeight) => {
  return sharp(imageBuffer)
    .resize(targetWidth, targetHeight, {
      fit: 'inside',
      withoutEnlargement: false,
    })
    .jpeg({ quality: 95 })
    .toBuffer();
};

/**
 * MODE 2: Exact size with blur fill
 * 
 * The full image is ALWAYS visible — nothing cut.
 * The remaining space around it is filled with a blurred
 * version of the same photo. Result is exactly target size.
 * 
 * This is how Instagram handles portrait photos in square frames.
 */
const exactWithBlurFill = async (imageBuffer, targetWidth, targetHeight) => {
  // Step 1: Create blurred background — scaled to cover entire target
  const blurredBg = await sharp(imageBuffer)
    .resize(targetWidth, targetHeight, {
      fit: 'cover',
      position: 'center',
    })
    .blur(25)
    .modulate({ brightness: 0.6 })  // ← correct Sharp API for brightness
    .jpeg({ quality: 80 })
    .toBuffer();

  // Step 2: Scale original to fit inside target — entire image visible, nothing cut
  const scaledFg = await sharp(imageBuffer)
    .resize(targetWidth, targetHeight, {
      fit: 'inside',
      withoutEnlargement: false,
    })
    .png()  // keep as PNG for transparency-safe compositing
    .toBuffer();

  // Step 3: Composite — place full image centered on blurred background
  const result = await sharp(blurredBg)
    .composite([{
      input: scaledFg,
      gravity: 'center',
    }])
    .jpeg({ quality: 95 })
    .toBuffer();

  return result;
};

const MODE_KEYBOARD = (width, height) => ({
  reply_markup: {
    inline_keyboard: [
      [{
        text: '🔍 Scale to fit (nothing cut, may not be exact size)',
        callback_data: `resize_fit_${width}_${height}`,
      }],
      [{
        text: '🖼 Full image + blur fill (exact size, looks pro)',
        callback_data: `resize_blur_${width}_${height}`,
      }],
    ],
  },
});

const imageResize = async (bot, chatId, msg, params = {}) => {
  const userId  = msg.from.id;
  const photo   = msg.photo?.[msg.photo.length - 1] ||
                  (msg.document?.mime_type?.startsWith('image/') ? msg.document : null);
  const caption = (msg.caption || msg.text || params.description || '').trim();

  if (!photo) {
    await bot.sendMessage(
      chatId,
      '🖼 *Image Resize*\n\nSend me the image with the target size in caption!\n\nExamples:\n• Photo + *"whatsapp dp"*\n• Photo + *"instagram post"*\n• Photo + *"1200x630"*',
      { parse_mode: 'Markdown' }
    );
    return { success: true };
  }

  let width, height, label;
  const dims = parseDimensions(caption);
  if (dims) {
    width = dims.width; height = dims.height; label = `${width}x${height}`;
  } else {
    const preset = detectPreset(caption);
    if (preset) { width = preset.width; height = preset.height; label = preset.label; }
  }

  // No size detected — save photo, ask for size
  if (!width || !height) {
    const upload = await uploadFileFromTelegram(photo.file_id, 'taskbot/resize');
    setSession(userId, {
      step: 'waiting_for_resize_dimensions',
      imageUrl: upload.url,
      publicId: upload.publicId,
      resourceType: upload.resourceType,
    });

    const presetList = Object.entries(PRESETS)
      .map(([key, val]) => `• *${key}* — ${val.width}×${val.height}`)
      .join('\n');

    await bot.sendMessage(
      chatId,
      `📐 *What size do you need?*\n\n*Presets:*\n${presetList}\n\n*Or type custom:* "1200x630"`,
      { parse_mode: 'Markdown' }
    );
    return { success: true };
  }

  // We have size — show options
  const upload = await uploadFileFromTelegram(photo.file_id, 'taskbot/resize');
  setSession(userId, {
    step: 'waiting_for_resize_mode',
    imageUrl: upload.url,
    publicId: upload.publicId,
    resourceType: upload.resourceType,
    width, height, label,
  });

  await bot.sendMessage(
    chatId,
    `📐 *${label}* — pick how you want it:\n\n🔍 *Scale to fit* — your whole image, just smaller/bigger. Nothing cut. Size may differ slightly if shapes don't match.\n\n🖼 *Full image + blur fill* — your whole image visible, remaining space filled with blurred version. Exactly ${width}×${height}. Looks professional.`,
    { parse_mode: 'Markdown', ...MODE_KEYBOARD(width, height) }
  );

  return { success: true };
};

const handleResizeCallback = async (bot, callbackQuery) => {
  const chatId = callbackQuery.message.chat.id;
  const userId = callbackQuery.from.id;
  const data   = callbackQuery.data;

  await bot.answerCallbackQuery(callbackQuery.id);

  const parts  = data.split('_');
  const mode   = parts[1];           // fit | blur
  const width  = parseInt(parts[2]);
  const height = parseInt(parts[3]);

  console.log(`📐 Resize callback: mode=${mode} ${width}x${height}`);

  const session = getSession(userId);
  if (!session?.imageUrl) {
    await bot.sendMessage(chatId, '⏰ Session expired. Please send the image again.');
    return;
  }

  await bot.sendMessage(chatId, `⚙️ Resizing... give me a second!`);

  try {
    const response = await axios.get(session.imageUrl, { responseType: 'arraybuffer' });
    const inputBuffer = Buffer.from(response.data);

    const original = await sharp(inputBuffer).metadata();
    console.log(`✅ Original: ${original.width}x${original.height}`);

    let resized;
    if (mode === 'fit') {
      resized = await scaleToFit(inputBuffer, width, height);
    } else {
      resized = await exactWithBlurFill(inputBuffer, width, height);
    }

    const meta = await sharp(resized).metadata();
    console.log(`✅ Result: ${meta.width}x${meta.height}`);

    const caption = mode === 'fit'
      ? `✅ Scaled from ${original.width}×${original.height} → ${meta.width}×${meta.height}\nYour full image — nothing cut! 🎯`
      : `✅ Exactly ${meta.width}×${meta.height} with blur fill\nYour full image — nothing cut! 🎯`;

    await bot.sendDocument(chatId, resized, { caption }, {
      filename: `resized_${meta.width}x${meta.height}.jpg`,
      contentType: 'image/jpeg',
    });

    await deleteFromCloudinary(session.publicId, session.resourceType);
    clearSession(userId);

  } catch (err) {
    console.error('❌ Resize failed:', err.message);
    await bot.sendMessage(chatId, `😕 Resize failed: ${err.message}`);
    clearSession(userId);
  }
};

const handleResizeDimensionsInput = async (bot, chatId, userId, text) => {
  const session = getSession(userId);
  if (!session?.imageUrl) {
    await bot.sendMessage(chatId, '⏰ Session expired. Please send the image again.');
    return;
  }

  let width, height, label;
  const dims = parseDimensions(text);
  if (dims) {
    width = dims.width; height = dims.height; label = `${width}x${height}`;
  } else {
    const preset = detectPreset(text);
    if (preset) { width = preset.width; height = preset.height; label = preset.label; }
  }

  if (!width || !height) {
    await bot.sendMessage(
      chatId,
      `❓ Didn't get that. Try *"whatsapp dp"*, *"instagram post"*, or *"500x500"*`,
      { parse_mode: 'Markdown' }
    );
    return;
  }

  setSession(userId, { ...session, step: 'waiting_for_resize_mode', width, height, label });

  await bot.sendMessage(
    chatId,
    `📐 *${label}* — pick how you want it:\n\n🔍 *Scale to fit* — your whole image, just smaller/bigger. Nothing cut.\n\n🖼 *Full image + blur fill* — your whole image visible, remaining space filled with blurred version. Exactly ${width}×${height}.`,
    { parse_mode: 'Markdown', ...MODE_KEYBOARD(width, height) }
  );
};

module.exports = { imageResize, handleResizeCallback, handleResizeDimensionsInput };