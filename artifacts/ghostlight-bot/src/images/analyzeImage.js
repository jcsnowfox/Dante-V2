const { getLlmClient, hasLlmApiKey, resolveImageModel } = require("../llm/client");

// Local content-filter detector (kept self-contained to avoid a require cycle
// with the chat pipeline). When the vision provider declines an image — most
// commonly realistic human-face photos flagged "high risk" — its refusal text
// must never be relayed as the image description, or it surfaces verbatim as the
// companion's reply and poisons every later turn that re-sends the image.
const CONTENT_FILTER_PATTERN =
  /high risk|safety system|safety filter|content policy|content filter|rejected because|cannot be (processed|completed)|unable to (process|assist)|can'?t (assist|help) with (that|this|identifying|describing)/i;

function isImageAnalysisRefusal(text) {
  return typeof text === "string" && CONTENT_FILTER_PATTERN.test(text);
}

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

  const text = response.output_text?.trim() || "";
  const errorMessage = response.error?.message || response.error || "";

  if ((errorMessage && isImageAnalysisRefusal(String(errorMessage))) || isImageAnalysisRefusal(text)) {
    const rejection = new Error("Image analysis declined by content filter.");
    rejection.contentFiltered = true;
    throw rejection;
  }

  return text;
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

      try {
        return await analyzeGeneratedImageBuffer({
          client,
          config,
          imageBuffer,
          mimeType,
          prompt,
          aspectRatio,
          model,
        });
      } catch (error) {
        if (error && error.contentFiltered) {
          logger?.warn?.("[images] Generated image analysis declined by content filter", {
            imageModel: resolveImageModel(config),
          });
          return "";
        }
        throw error;
      }
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
