function classifyAttachmentType(url = "", mimeType = "") {
  const urlLower = String(url || "").toLowerCase();
  const mimeLower = String(mimeType || "").toLowerCase();

  // Check URL patterns first
  if (
    urlLower.includes("tiktok.com") ||
    urlLower.includes("vt.tiktok.com")
  ) {
    return "tiktok_video";
  }
  if (
    urlLower.includes("youtube.com") ||
    urlLower.includes("youtu.be") ||
    urlLower.includes("youtube-nocookie.com")
  ) {
    return "youtube_video";
  }
  if (
    urlLower.includes("instagram.com") ||
    urlLower.includes("instagr.am")
  ) {
    return "instagram_post";
  }
  if (
    urlLower.includes("twitter.com") ||
    urlLower.includes("x.com")
  ) {
    return "twitter_post";
  }

  // Check MIME type
  if (mimeLower.startsWith("image/")) {
    return "image";
  }
  if (mimeLower.startsWith("video/")) {
    return "video";
  }
  if (mimeLower.startsWith("audio/")) {
    return "audio";
  }
  if (
    mimeLower.includes("pdf") ||
    mimeLower.includes("document") ||
    mimeLower.includes("word")
  ) {
    return "document";
  }

  // Check file extension
  const ext = urlLower.split(".").pop().split("?")[0];
  if (["jpg", "jpeg", "png", "webp", "gif"].includes(ext)) return "image";
  if (["mp4", "mov", "webm", "avi"].includes(ext)) return "video";
  if (["mp3", "wav", "m4a", "ogg", "aac"].includes(ext)) return "audio";
  if (["pdf", "txt", "md", "docx"].includes(ext)) return "document";

  // Check if it's a generic URL
  if (urlLower.startsWith("http")) {
    return "webpage";
  }

  return "unknown";
}

function buildAttachmentUnderstanding(attachment = {}) {
  const {
    url = "",
    mimeType = "",
    filename = "",
    size = 0,
    visionAnalysis = null,
    transcript = null,
    videoMetadata = null,
    webMetadata = null,
    kind = null, // 'image_analysis', 'audio_transcription', etc.
  } = attachment;

  const type = classifyAttachmentType(url, mimeType);

  const understanding = {
    type,
    source: {
      url,
      filename,
      mimeType,
      sizeBytes: size,
    },
    analysis: null,
  };

  if (visionAnalysis) {
    understanding.analysis = {
      kind: "vision",
      description: visionAnalysis.description || "",
      visibleText: visionAnalysis.visibleText || "",
      subjects: visionAnalysis.subjects || [],
      composition: visionAnalysis.composition || "",
      emotionalContext: visionAnalysis.emotionalContext || "",
    };
  }

  if (transcript) {
    understanding.analysis = {
      kind: "audio_transcript",
      transcript,
      duration: visionAnalysis?.duration || null,
    };
  }

  if (videoMetadata) {
    understanding.analysis = {
      kind: "video_metadata",
      duration: videoMetadata.duration || null,
      width: videoMetadata.width || null,
      height: videoMetadata.height || null,
      codec: videoMetadata.codec || null,
      fileSize: videoMetadata.fileSize || null,
      representativeFrames: videoMetadata.frames || [],
      audioTranscript: videoMetadata.transcript || null,
      summary: videoMetadata.summary || null,
    };
  }

  if (webMetadata) {
    understanding.analysis = {
      kind: "web_content",
      title: webMetadata.title || "",
      description: webMetadata.description || "",
      readableText: webMetadata.readableText || "",
      canonical: webMetadata.canonical || url,
      ogImage: webMetadata.ogImage || "",
      status: webMetadata.status || 200,
      blocked: webMetadata.blocked || false,
      blockReason: webMetadata.blockReason || null,
    };
  }

  return understanding;
}

function formatAttachmentUnderstandingForPrompt(understanding = null) {
  if (!understanding) {
    return null;
  }

  const { type, source, analysis } = understanding;

  const lines = ["## ATTACHMENT"];
  lines.push(`Type: ${type}`);
  lines.push("");

  if (analysis) {
    if (analysis.kind === "vision") {
      lines.push("### Visual Analysis");
      if (analysis.description) {
        lines.push(`Description: ${analysis.description}`);
      }
      if (analysis.visibleText) {
        lines.push(`Text in image: ${analysis.visibleText}`);
      }
      if (analysis.subjects && analysis.subjects.length > 0) {
        lines.push(`Subjects: ${analysis.subjects.join(", ")}`);
      }
      if (analysis.emotionalContext) {
        lines.push(`Mood/Context: ${analysis.emotionalContext}`);
      }
    } else if (analysis.kind === "audio_transcript") {
      lines.push("### Audio Transcript");
      lines.push(analysis.transcript);
      if (analysis.duration) {
        lines.push(`Duration: ${analysis.duration}s`);
      }
    } else if (analysis.kind === "video_metadata") {
      lines.push("### Video Information");
      if (analysis.duration) {
        lines.push(`Duration: ${analysis.duration}s`);
      }
      if (analysis.width && analysis.height) {
        lines.push(`Resolution: ${analysis.width}x${analysis.height}`);
      }
      if (analysis.audioTranscript) {
        lines.push(`Audio: ${analysis.audioTranscript}`);
      }
      if (analysis.summary) {
        lines.push(`Summary: ${analysis.summary}`);
      }
    } else if (analysis.kind === "web_content") {
      lines.push("### Web Content");
      if (analysis.title) {
        lines.push(`Title: ${analysis.title}`);
      }
      if (analysis.description) {
        lines.push(`Description: ${analysis.description}`);
      }
      if (analysis.blocked) {
        lines.push(`Status: Content blocked (${analysis.blockReason})`);
      } else if (analysis.readableText) {
        lines.push(`Content Preview: ${analysis.readableText.slice(0, 500)}${analysis.readableText.length > 500 ? "..." : ""}`);
      }
    }
  }

  lines.push("");
  return lines.join("\n");
}

module.exports = {
  classifyAttachmentType,
  buildAttachmentUnderstanding,
  formatAttachmentUnderstandingForPrompt,
};
