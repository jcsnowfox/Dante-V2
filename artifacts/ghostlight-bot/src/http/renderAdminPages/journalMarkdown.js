function renderInlineJournalMarkdown(value, { escapeHtml, allowLinks = true }) {
  const codeSegments = [];
  const tokenized = String(value || "").replace(/`([^`\n]+)`/g, (_, code) => {
    const token = `@@GHOSTLIGHTCODE${codeSegments.length}@@`;
    codeSegments.push(code);
    return token;
  });
  let rendered = escapeHtml(tokenized);

  rendered = rendered.replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>");
  rendered = rendered.replace(/__([^_\n]+)__/g, "<strong>$1</strong>");
  rendered = rendered.replace(/(^|[^\*])\*([^*\n]+)\*(?!\*)/g, "$1<em>$2</em>");
  rendered = rendered.replace(/(^|[^_])_([^_\n]+)_(?!_)/g, "$1<em>$2</em>");
  rendered = rendered.replace(
    /\[([^\]\n]+)\]\((https?:\/\/[^)\s<]+)\)/g,
    allowLinks
      ? '<a href="$2" target="_blank" rel="noreferrer">$1</a>'
      : '<span class="journal-preview-link">$1</span>',
  );

  codeSegments.forEach((code, index) => {
    rendered = rendered.replace(`@@GHOSTLIGHTCODE${index}@@`, `<code>${escapeHtml(code)}</code>`);
  });

  return rendered;
}

function renderListBlock(lines, pattern, { escapeHtml, allowLinks = true }) {
  return [
    pattern === "ordered" ? "<ol>" : "<ul>",
    ...lines.map((line) => {
      const text = pattern === "ordered"
        ? line.trim().replace(/^\d+\.\s+/, "")
        : line.trim().replace(/^[-*]\s+/, "");
      return `<li>${renderInlineJournalMarkdown(text, { escapeHtml, allowLinks })}</li>`;
    }),
    pattern === "ordered" ? "</ol>" : "</ul>",
  ].join("");
}

function renderJournalMarkdown(content, { escapeHtml, emptyText = "No journal text recorded.", allowLinks = true } = {}) {
  const blocks = String(content || "")
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => {
      const lines = block.split(/\r?\n/).map((line) => line.trimEnd());
      const nonEmptyLines = lines.filter((line) => line.trim());

      if (!nonEmptyLines.length) {
        return "";
      }

      if (nonEmptyLines.every((line) => /^[-*]\s+/.test(line.trim()))) {
        return renderListBlock(nonEmptyLines, "unordered", { escapeHtml, allowLinks });
      }

      if (nonEmptyLines.every((line) => /^\d+\.\s+/.test(line.trim()))) {
        return renderListBlock(nonEmptyLines, "ordered", { escapeHtml, allowLinks });
      }

      if (nonEmptyLines.every((line) => /^>\s?/.test(line.trim()))) {
        const quote = nonEmptyLines.map((line) => line.trim().replace(/^>\s?/, "")).join("\n");
        return `<blockquote><p>${renderInlineJournalMarkdown(quote, { escapeHtml, allowLinks }).replace(/\n/g, "<br>")}</p></blockquote>`;
      }

      const headingMatch = nonEmptyLines[0].trim().match(/^(#{1,3})\s+(.+)$/);
      if (headingMatch) {
        const level = Math.min(headingMatch[1].length + 1, 4);
        const heading = `<h${level}>${renderInlineJournalMarkdown(headingMatch[2], { escapeHtml, allowLinks })}</h${level}>`;
        const remainingLines = nonEmptyLines.slice(1);

        if (!remainingLines.length) {
          return heading;
        }

        return [
          heading,
          `<p>${renderInlineJournalMarkdown(remainingLines.join("\n"), { escapeHtml, allowLinks }).replace(/\n/g, "<br>")}</p>`,
        ].join("");
      }

      return `<p>${renderInlineJournalMarkdown(nonEmptyLines.join("\n"), { escapeHtml, allowLinks }).replace(/\n/g, "<br>")}</p>`;
    })
    .join("");

  return blocks || `<p>${escapeHtml(emptyText)}</p>`;
}

function buildJournalPreviewMarkdown(content, { maxLines = 3, maxLength = 220 } = {}) {
  const lines = String(content || "")
    .split(/\r?\n/)
    .map((line) => line.trimEnd());
  const selectedLines = [];
  let selectedTextLines = 0;

  for (const line of lines) {
    const hasText = Boolean(line.trim());

    if (!hasText && !selectedLines.length) {
      continue;
    }

    if (hasText) {
      selectedTextLines += 1;
    }

    if (selectedTextLines > maxLines) {
      break;
    }

    selectedLines.push(line);
  }

  let preview = selectedLines.join("\n").trim();

  if (!preview) {
    return "";
  }

  if (preview.length > maxLength) {
    preview = `${preview.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`;
  }

  return preview;
}

function renderJournalMarkdownPreview(content, { escapeHtml, maxLines = 3, maxLength = 220, emptyText = "No journal text recorded.", allowLinks = true } = {}) {
  return renderJournalMarkdown(
    buildJournalPreviewMarkdown(content, { maxLines, maxLength }),
    { escapeHtml, emptyText, allowLinks },
  );
}

module.exports = {
  buildJournalPreviewMarkdown,
  renderInlineJournalMarkdown,
  renderJournalMarkdown,
  renderJournalMarkdownPreview,
};
