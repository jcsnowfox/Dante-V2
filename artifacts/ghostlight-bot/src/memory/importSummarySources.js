const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");
const { splitFrontmatter, parseSimpleFrontmatter } = require("./importNotes");

function deriveLabelFromFilename(filePath) {
  return path.basename(filePath, path.extname(filePath)).trim();
}

function parseSummarySourceNote(text, filePath) {
  if (!text.startsWith("---\n")) {
    return {
      sourceId: crypto.randomUUID(),
      label: deriveLabelFromFilename(filePath),
      text: text.trim(),
      date: "",
      metadata: {},
      sourcePath: filePath,
    };
  }

  const { frontmatter, body } = splitFrontmatter(text);
  const metadata = parseSimpleFrontmatter(frontmatter);

  return {
    sourceId: metadata.id || crypto.randomUUID(),
    label: metadata.source_label || metadata.conversation_label || metadata.title || deriveLabelFromFilename(filePath),
    text: metadata.content || metadata.text || body.trim(),
    date: metadata.summary_date || metadata.date || "",
    metadata: {
      participants: metadata.participants || "",
      channelName: metadata.channel_name || "",
      conversationLabel: metadata.conversation_label || "",
      sourceLabel: metadata.source_label || "",
    },
    sourcePath: filePath,
  };
}

async function listImportFiles(targetPath) {
  const stat = await fs.stat(targetPath);

  if (stat.isFile()) {
    return [targetPath];
  }

  const entries = await fs.readdir(targetPath, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const resolvedPath = path.join(targetPath, entry.name);

    if (entry.isDirectory()) {
      files.push(...await listImportFiles(resolvedPath));
      continue;
    }

    if (entry.isFile() && [".md", ".txt"].includes(path.extname(entry.name))) {
      files.push(resolvedPath);
    }
  }

  return files;
}

async function loadSummarySourcesFromPath(targetPath) {
  const files = await listImportFiles(targetPath);
  const records = [];

  for (const filePath of files) {
    const text = await fs.readFile(filePath, "utf8");
    records.push(parseSummarySourceNote(text, filePath));
  }

  return records;
}

module.exports = {
  parseSummarySourceNote,
  loadSummarySourcesFromPath,
};
