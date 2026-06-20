const { getLlmClient, hasLlmApiKey, resolveImageModel, resolveTranscriptionModel } = require("../../llm/client");
const { analyzeImageAttachment } = require("../../images/analyzeImage");

const DOCUMENT_TEXT_LIMIT = 20000;

function inferAudioFormat(attachment = {}, blob = null) {
  const contentType = String(attachment.contentType || blob?.type || "").toLowerCase();
  const name = String(attachment.name || "").toLowerCase();

  if (contentType.includes("ogg") || name.endsWith(".ogg")) {
    return "ogg";
  }

  if (contentType.includes("wav") || name.endsWith(".wav")) {
    return "wav";
  }

  if (contentType.includes("mpeg") || contentType.includes("mp3") || name.endsWith(".mp3")) {
    return "mp3";
  }

  if (contentType.includes("webm") || name.endsWith(".webm")) {
    return "webm";
  }

  return "ogg";
}

async function transcribeViaChatCompletions({ client, config, attachment, blob }) {
  const bytes = Buffer.from(await blob.arrayBuffer());
  const response = await client.chat.completions.create({
    model: resolveTranscriptionModel(config),
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: "Transcribe this audio faithfully. Return only the transcription text.",
          },
          {
            type: "input_audio",
            input_audio: {
              data: bytes.toString("base64"),
              format: inferAudioFormat(attachment, blob),
            },
          },
        ],
      },
    ],
  });

  return response.choices?.[0]?.message?.content?.trim() || "";
}

async function transcribeAudioAttachment({ client, config, attachment }) {
  const response = await fetch(attachment.url);

  if (!response.ok) {
    throw new Error(`Failed to fetch audio attachment (${response.status})`);
  }

  const blob = await response.blob();
  return transcribeViaChatCompletions({ client, config, attachment, blob });
}

function truncateDocumentText(text, limit = DOCUMENT_TEXT_LIMIT) {
  const normalized = String(text || "");

  if (normalized.length <= limit) {
    return {
      text: normalized,
      truncated: false,
    };
  }

  return {
    text: `${normalized.slice(0, Math.max(limit - 3, 0))}...`,
    truncated: true,
  };
}

async function readTextDocumentAttachment({ attachment }) {
  const response = await fetch(attachment.url);

  if (!response.ok) {
    throw new Error(`Failed to fetch text attachment (${response.status})`);
  }

  const rawText = await response.text();
  const { text, truncated } = truncateDocumentText(rawText, DOCUMENT_TEXT_LIMIT);

  return {
    text,
    truncated,
  };
}

function buildDerivedAttachmentText(derivedAttachments) {
  if (!derivedAttachments.length) {
    return "";
  }

  return derivedAttachments
    .map((item) => {
      if (item.kind === "audio_transcription") {
        return `[Transcribed from voice note:]\n${item.text}`;
      }

      if (item.kind === "image_analysis") {
        return `[${item.authorName} attached an image. Description follows:]\n${item.text}`;
      }

      if (item.kind === "document_text") {
        const label = item.attachment.name || "text attachment";
        const suffix = item.truncated ? "\n[Truncated to first 20000 characters.]" : "";
        return `[Attached text file: ${label}]\n${item.text}${suffix}`;
      }

      const label = item.attachment.name || `${item.kind} attachment`;
      return `${label}\n${item.text}`;
    })
    .join("\n\n");
}

async function enrichInput({ config, logger, input }) {
  if (!input.attachments.length) {
    return {
      ...input,
      derivedAttachments: [],
    };
  }

  const imageClient = hasLlmApiKey(config, "image") ? getLlmClient(config, "image") : null;
  const audioClient = hasLlmApiKey(config, "transcription") ? getLlmClient(config, "transcription") : null;
  const derivedAttachments = [];

  for (const attachment of input.attachments) {
    try {
      if (attachment.kind === "audio") {
        if (!audioClient) {
          logger.warn("[chat] Skipping audio transcription because no transcription-capable LLM API key is configured", {
            name: attachment.name,
          });
          continue;
        }

        logger.debug?.("[chat] Transcribing audio attachment", {
          name: attachment.name,
          transcriptionModel: resolveTranscriptionModel(config),
        });

        const text = await transcribeAudioAttachment({ client: audioClient, config, attachment });

        if (text) {
          logger.debug("[chat] Audio transcription completed", {
            name: attachment.name,
            transcriptLength: text.length,
            transcriptPreview: text.slice(0, 160),
          });

          derivedAttachments.push({
            kind: "audio_transcription",
            attachment,
            authorName: input.authorName,
            text,
          });
        } else {
          logger.warn("[chat] Audio transcription returned empty text", {
            name: attachment.name,
          });
        }
      }

      if (attachment.kind === "image") {
        if (!imageClient) {
          logger.warn("[chat] Skipping image analysis because no LLM API key is configured", {
            name: attachment.name,
          });
          continue;
        }

        logger.debug?.("[chat] Analysing image attachment", {
          name: attachment.name,
          imageModel: resolveImageModel(config),
        });

        let text = "";
        try {
          text = await analyzeImageAttachment({ client: imageClient, config, attachment });
        } catch (error) {
          if (error && error.contentFiltered) {
            logger.warn("[chat] Image analysis declined by content filter; using neutral placeholder", {
              name: attachment.name,
            });
            derivedAttachments.push({
              kind: "image_analysis",
              attachment,
              authorName: input.authorName,
              text: "(The attached image could not be described automatically.)",
            });
            continue;
          }
          throw error;
        }

        if (text) {
          derivedAttachments.push({
            kind: "image_analysis",
            attachment,
            authorName: input.authorName,
            text,
          });
        }
      }

      if (attachment.kind === "document") {
        const lowerName = String(attachment.name || "").toLowerCase();
        const contentType = String(attachment.contentType || "").toLowerCase();
        const isPlainTextLike = contentType.startsWith("text/")
          || lowerName.endsWith(".txt")
          || lowerName.endsWith(".md");

        if (!isPlainTextLike) {
          continue;
        }

        logger.debug?.("[chat] Reading text attachment", {
          name: attachment.name,
          contentType: attachment.contentType || "",
        });

        const { text, truncated } = await readTextDocumentAttachment({ attachment });

        if (text.trim()) {
          derivedAttachments.push({
            kind: "document_text",
            attachment,
            authorName: input.authorName,
            text,
            truncated,
          });
        } else {
          logger.warn("[chat] Text attachment returned empty text", {
            name: attachment.name,
          });
        }
      }
    } catch (error) {
      logger.error("[chat] Failed to enrich attachment", {
        name: attachment.name,
        kind: attachment.kind,
        error: error.message,
      }, error);
    }
  }

  const derivedText = buildDerivedAttachmentText(derivedAttachments);
  const content = [input.content, derivedText].filter(Boolean).join("\n\n");
  const inputTypes = Array.from(
    new Set([
      ...input.inputTypes,
      ...derivedAttachments.map((item) => item.kind),
    ]),
  );

  return {
    ...input,
    content,
    inputTypes,
    derivedAttachments,
  };
}

module.exports = {
  analyzeImageAttachment,
  transcribeAudioAttachment,
  readTextDocumentAttachment,
  enrichInput,
};
