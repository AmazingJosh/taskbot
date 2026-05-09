const sharp = require('sharp');
const axios = require('axios');
const { uploadFileFromTelegram, deleteFromCloudinary } = require('../helpers/fileHelper');
const { setSession, getSession, clearSession } = require('../helpers/sessionStore');

/**
 * Image Resize — powered by Sharp.js
 * One smart mode: full image visible + blur fill for exact size.
 */

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
 * Core resize — full image visible, exact target size.
 * Step 1: blurred background at exact target size
 * Step 2: scale full original to fit inside target (nothing cut)
 * Step 3: composite full image centered on blurred background
 */
const resizeWithBlurFill = async (imageBuffer, targetWidth, targetHeight) => {
  const blurredBg = await sharp(imageBuffer)
    .resize(targetWidth, targetHeight, { fit: 'cover', position: 'center' })
    .blur(25)
    .modulate({ brightness: 0.6 })
    .jpeg({ quality: 80 })
    .toBuffer();

  const scaledFg = await sharp(imageBuffer)
    .resize(targetWidth, targetHeight, { fit: 'inside', withoutEnlargement: false })
    .png()
    .toBuffer();

  return sharp(blurredBg)
    .composite([{ input: scaledFg, gravity: 'center' }])
    .jpeg({ quality: 95 })
    .toBuffer();
};

/**
 * Execute resize and send result to user
 */
const executeResize = async (bot, chatId, userId, imageUrl, publicId, resourceType, width, height, label) => {
  await bot.sendMessage(chatId, `⚙️ Resizing to ${label}...`);

  const response = await axios.get(imageUrl, { responseType: 'arraybuffer' });
  const inputBuffer = Buffer.from(response.data);
  const original = await sharp(inputBuffer).metadata();

  const resized = await resizeWithBlurFill(inputBuffer, width, height);
  const meta    = await sharp(resized).metadata();

  await bot.sendDocument(chatId, resized, {
    caption: `✅ Done! ${original.width}×${original.height} → ${meta.width}×${meta.height}\nYour full image — nothing cut! 🎯`,
  }, { filename: `resized_${width}x${height}.jpg`, contentType: 'image/jpeg' });

  await deleteFromCloudinary(publicId, resourceType);
  await clearSession(userId);
};

/**
 * Main handler
 */
const imageResize = async (bot, chatId, msg, params = {}) => {
  const userId  = msg.from.id;
  const photo   = msg.photo?.[msg.photo.length - 1] ||
                  (msg.document?.mime_type?.startsWith('image/') ? msg.document : null);
  const caption = (msg.caption || msg.text || params.description || '').trim();

  if (!photo) {
    await bot.sendMessage(
      chatId,
      '🖼 *Image Resize*\n\nSend me the image with the size in caption!\n\nExamples:\n• Photo + *"whatsapp dp"*\n• Photo + *"instagram post"*\n• Photo + *"1200x630"*',
      { parse_mode: 'Markdown' }
    );
    return { success: true };
  }

  // Detect size from caption
  let width, height, label;
  const dims = parseDimensions(caption);
  if (dims) {
    width = dims.width; height = dims.height; label = `${width}×${height}`;
  } else {
    const preset = detectPreset(caption);
    if (preset) { width = preset.width; height = preset.height; label = preset.label; }
  }

  // Upload photo first
  const upload = await uploadFileFromTelegram(photo.file_id, 'taskbot/resize');

  // Size detected — resize immediately, no questions asked
  if (width && height) {
    try {
      await executeResize(bot, chatId, userId, upload.url, upload.publicId, upload.resourceType, width, height, label);
    } catch (err) {
      console.error('❌ Resize failed:', err.message);
      await bot.sendMessage(chatId, `😕 Resize failed: ${err.message}`);
    }
    return { success: true };
  }

  // No size detected — save photo in session and ask
  await setSession(userId, {
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
    `📐 *Image received!*\n\nWhat size do you need? Just type it:\n\n*Presets:*\n${presetList}\n\n*Or custom:* "1200x630"`,
    { parse_mode: 'Markdown' }
  );
  return { success: true };
};

/**
 * Handle resize callback from inline keyboard (kept for backwards compat)
 */
const handleResizeCallback = async (bot, callbackQuery) => {
  const chatId = callbackQuery.message.chat.id;
  const userId = callbackQuery.from.id;
  const data   = callbackQuery.data;

  await bot.answerCallbackQuery(callbackQuery.id);

  const parts  = data.split('_');
  const width  = parseInt(parts[2]);
  const height = parseInt(parts[3]);

  const session = await getSession(userId);
  if (!session?.imageUrl) {
    await bot.sendMessage(chatId, '⏰ Session expired. Please send the image again.');
    return;
  }

  try {
    await executeResize(bot, chatId, userId, session.imageUrl, session.publicId, session.resourceType, width, height, `${width}×${height}`);
  } catch (err) {
    console.error('❌ Resize failed:', err.message);
    await bot.sendMessage(chatId, `😕 Resize failed: ${err.message}`);
    await clearSession(userId);
  }
};

/**
 * Handle text input for dimensions
 */
const handleResizeDimensionsInput = async (bot, chatId, userId, text) => {
  const session = await getSession(userId);
  if (!session?.imageUrl) {
    await bot.sendMessage(chatId, '⏰ Session expired. Please send the image again.');
    return;
  }

  let width, height, label;
  const dims = parseDimensions(text);
  if (dims) {
    width = dims.width; height = dims.height; label = `${width}×${height}`;
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

  try {
    await executeResize(bot, chatId, userId, session.imageUrl, session.publicId, session.resourceType, width, height, label);
  } catch (err) {
    console.error('❌ Resize failed:', err.message);
    await bot.sendMessage(chatId, `😕 Resize failed: ${err.message}`);
    await clearSession(userId);
  }
};

module.exports = { imageResize, handleResizeCallback, handleResizeDimensionsInput };