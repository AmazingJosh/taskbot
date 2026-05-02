const axios = require("axios");

const API_KEY = process.env.POLLINATIONS_API_KEY;
const BASE_URL = "https://image.pollinations.ai/prompt";

/**
 * Pollinations.ai utility — confirmed from official docs
 * 
 * generateImage  → text to image (FLUX model)
 * transformImage → image to image (Kontext model, Seed tier required)
 * 
 * Key fix: build URL with URLSearchParams exactly as docs show,
 * not axios params object which can mangle the image URL param.
 */

/**
 * Generate an image from a text prompt.
 * Returns image as Buffer.
 */
const generateImage = async (prompt, opts = {}) => {
  const {
    width = 1024,
    height = 1024,
    model = "flux",
    enhance = false,
    seed = Math.floor(Math.random() * 999999),
  } = opts;

  const params = new URLSearchParams({
    width,
    height,
    model,
    seed,
    nologo: true,
    private: true,
    ...(enhance && { enhance: true }),
    ...(API_KEY && { key: API_KEY }),
  });

  const url = `${BASE_URL}/${encodeURIComponent(prompt)}?${params}`;

  console.log("🎨 Pollinations generateImage URL:", url);

  const response = await axios.get(url, {
    responseType: "arraybuffer",
    timeout: 120000,
    headers: API_KEY ? { Authorization: `Bearer ${API_KEY}` } : {},
  });

  return Buffer.from(response.data);
};

/**
 * Transform an existing image using a text instruction.
 * Uses Kontext model — requires Seed tier (registered account).
 * Returns transformed image as Buffer.
 */
const transformImage = async (imageUrl, prompt, opts = {}) => {
  const {
    width = 1024,
    height = 1024,
    seed = Math.floor(Math.random() * 999999),
  } = opts;

  // Build URL exactly as Pollinations docs show
  const params = new URLSearchParams({
    model: "kontext",
    image: imageUrl,
    width,
    height,
    seed,
    nologo: true,
    private: true,
    ...(API_KEY && { key: API_KEY }),
  });

  const url = `${BASE_URL}/${encodeURIComponent(prompt)}?${params}`;

  console.log("🎨 Pollinations transformImage URL:", url.substring(0, 120) + "...");

  const response = await axios.get(url, {
    responseType: "arraybuffer",
    timeout: 120000,
    headers: API_KEY ? { Authorization: `Bearer ${API_KEY}` } : {},
  });

  return Buffer.from(response.data);
};

module.exports = { generateImage, transformImage };