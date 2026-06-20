const { getLlmClient, hasLlmApiKey, resolveImageModel } = require("../llm/client");

function buildImageDataUrl({ imageBuffer, mimeType = "image/png" } = {}) {
  const buffer = Buffer.isBuffer(imageBuffer) ? imageBuffer : Buffer.from(imageBuffer || "");
  const normalizedMimeType = String(mimeType || "image/png").trim().toLowerCase() || "image/png";

  return `data:${normalizedMimeType};base64,${buffer.toString("base64")}`;
}

async function analyzeImageInput({ client, config, imageUrl, promptContext = "" }) {
  const response = await client.responses.create({
    model: resolveImageModel(config),
    input: [
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: [
              "Describe the attached image for downstream conversational context.",
              "Be concise but useful. Include visible text, the main subjects, composition, style, and any emotionally relevant details.",
              promptContext ? `Original generation prompt/context: ${promptContext}` : "",
            ].filter(Boolean).join(" "),
          },
          {
            type: "input_image",
            image_url: imageUrl,
            detail: "auto",
          },
        ],
      },
    ],
  });

  return response.output_text?.trim() || "";
}

async function analyzeImageAttachment({ client, config, attachment }) {
  return analyzeImageInput({
    client,
    config,
    imageUrl: attachment.url,
  });
}

async function analyzeGeneratedImageBuffer({
  client,
  config,
  imageBuffer,
  mimeType = "image/png",
  prompt = "",
  aspectRatio = "",
  model = "",
}) {
  const promptContext = [
    prompt ? `Prompt: ${prompt}` : "",
    aspectRatio ? `Aspect ratio: ${aspectRatio}` : "",
    model ? `Generation model: ${model}` : "",
  ].filter(Boolean).join(" ");

  return analyzeImageInput({
    client,
    config,
    imageUrl: buildImageDataUrl({ imageBuffer, mimeType }),
    promptContext,
  });
}

function createGeneratedImageAnalysisService({ config, logger } = {}) {
  return {
    canAnalyze() {
      return hasLlmApiKey(config, "image") && Boolean(resolveImageModel(config));
    },

    async analyze({ imageBuffer, mimeType, prompt, aspectRatio, model }) {
      if (!this.canAnalyze()) {
        return "";
      }

      const client = getLlmClient(config, "image");

      if (!client) {
        return "";
      }

      logger?.debug?.("[images] Analysing generated image", {
        imageModel: resolveImageModel(config),
        mimeType,
        byteLength: Buffer.isBuffer(imageBuffer) ? imageBuffer.length : 0,
      });

      return analyzeGeneratedImageBuffer({
        client,
        config,
        imageBuffer,
        mimeType,
        prompt,
        aspectRatio,
        model,
      });
    },
  };
}

module.exports = {
  analyzeImageAttachment,
  analyzeGeneratedImageBuffer,
  analyzeImageInput,
  buildImageDataUrl,
  createGeneratedImageAnalysisService,
};
