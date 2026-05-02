const axios = require("axios");
const { encodeURIComponent: encode } = global;

const API_KEY = process.env.POLLINATIONS_API_KEY;
const BASE_IMAGE = "https://image.pollinations.ai/prompt";

/**
 * Pollinations.ai utility
 * Registered Seed tier — no watermarks, 1 req/5s rate limit
 * 
 * Two modes:
 * 1. generateImage(prompt, opts) — text to image (FLUX model)
 * 2. transformImage(imageUrl, prompt, opts) — image to image (Kontext model)
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
    enhance = true,
    seed = Math.floor(Math.random() * 999999),
  } = opts;

  const encodedPrompt = encodeURIComponent(prompt);
  const url = `${BASE_IMAGE}/${encodedPrompt}`;

  const params = {
    width,
    height,
    model,
    enhance,
    seed,
    nologo: true,
    private: true,
    ...(API_KEY && { key: API_KEY }),
  };

  const response = await axios.get(url, {
    params,
    responseType: "arraybuffer",
    timeout: 60000,
  });

  return Buffer.from(response.data);
};

/**
 * Transform an existing image using a text instruction.
 * Uses the Kontext model (image-to-image).
 * Returns transformed image as Buffer.
 */
const transformImage = async (imageUrl, prompt, opts = {}) => {
  const {
    width = 1024,
    height = 1024,
    seed = Math.floor(Math.random() * 999999),
  } = opts;

  const encodedPrompt = encodeURIComponent(prompt);
  const url = `${BASE_IMAGE}/${encodedPrompt}`;

  const params = {
    width,
    height,
    model: "kontext",           // image-to-image model
    image: imageUrl,            // source image URL
    nologo: true,
    private: true,
    seed,
    ...(API_KEY && { key: API_KEY }),
  };

  const response = await axios.get(url, {
    params,
    responseType: "arraybuffer",
    timeout: 90000,             // Kontext can take longer
  });

  return Buffer.from(response.data);
};

module.exports = { generateImage, transformImage };