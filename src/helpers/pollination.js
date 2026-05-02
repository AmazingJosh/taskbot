const axios = require("axios");

const API_KEY = process.env.POLLINATIONS_API_KEY;

/**
 * Pollinations.ai utility — updated to use gen.pollinations.ai unified API
 * 
 * generateImage  → text to image via OpenAI-compatible endpoint (flux/gpt-image-2)
 * transformImage → image to image via seedream model (supports image param)
 */

/**
 * Generate an image from a text prompt.
 * Uses OpenAI-compatible POST endpoint at gen.pollinations.ai
 * Returns image as Buffer.
 */
const generateImage = async (prompt, opts = {}) => {
  const { width = 1024, height = 1024, model = "flux" } = opts;

  const response = await axios.post(
    "https://gen.pollinations.ai/v1/images/generations",
    {
      prompt,
      model,
      n: 1,
      size: `${width}x${height}`,
      response_format: "b64_json",
    },
    {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${API_KEY}`,
      },
      timeout: 120000,
    }
  );

  const b64 = response.data.data[0].b64_json;
  return Buffer.from(b64, "base64");
};

/**
 * Transform an existing image using a text instruction.
 * Uses seedream model which supports the `image` reference parameter.
 * Returns transformed image as Buffer.
 */
const transformImage = async (imageUrl, prompt, opts = {}) => {
  const { width = 1024, height = 1024 } = opts;
  const seed = Math.floor(Math.random() * 999999);

  // Use old endpoint with seedream model — confirmed to support image param
  const params = new URLSearchParams({
    model: "seedream",
    image: imageUrl,
    width: String(width),
    height: String(height),
    seed: String(seed),
    nologo: "true",
    private: "true",
    key: API_KEY || "",
  });

  const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?${params}`;

  console.log("🎨 Pollinations transformImage →", url.substring(0, 100) + "...");

  const response = await axios.get(url, {
    responseType: "arraybuffer",
    timeout: 120000,
    headers: API_KEY ? { Authorization: `Bearer ${API_KEY}` } : {},
  });

  return Buffer.from(response.data);
};

module.exports = { generateImage, transformImage };