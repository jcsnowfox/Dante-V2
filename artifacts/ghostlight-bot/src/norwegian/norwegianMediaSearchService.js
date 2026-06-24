const { getLlmClient } = require('../llm/client');

async function searchNorwegianMedia({
  query = '',
  mediaType = 'general',
  language = 'no',
  config = {},
  logger = console,
} = {}) {
  if (!query || query.trim().length === 0) {
    return { results: [], error: 'No search query provided' };
  }

  try {
    const client = getLlmClient(config, 'chat');
    if (!client) {
      logger.warn('[norwegian-media] LLM client not available for web search');
      return { results: [], error: 'Web search not available' };
    }

    // Build search-focused prompt
    const searchQuery = `Find Norwegian-language ${mediaType} media about: ${query}`;

    logger.info('[norwegian-media] search started', {
      query: query.slice(0, 50),
      mediaType,
      userScope: 'search',
    });

    const response = await client.chat.completions.create({
      model: config.llm?.chat?.model || 'openai/gpt-4o-mini',
      max_tokens: 800,
      messages: [
        {
          role: 'system',
          content: 'You find real Norwegian-language media resources. Return only real URLs from: nrk.no, aftenposten.no, vg.no, dagbladet.no, youtube.com, spotify.com, or similar verified Norwegian sources. Never invent URLs.',
        },
        {
          role: 'user',
          content: `List 3-5 real Norwegian-language ${mediaType} resources about "${query}". Format each as: Title: [title]\nURL: [full url]\nSource: [source name]`,
        },
      ],
    });

    const results = extractMediaResults(response, mediaType, logger);

    logger.info('[norwegian-media] search completed', {
      resultCount: results.length,
      mediaType,
    });

    return { results };
  } catch (error) {
    logger.error('[norwegian-media] Search failed', {
      error: error.message,
      query: query.slice(0, 50),
    });
    return { results: [], error: error.message };
  }
}

function extractMediaResults(response, mediaType, logger) {
  const results = [];

  // Handle OpenAI chat completions response format
  const text = response?.choices?.[0]?.message?.content
    || (response?.content?.[0]?.type === 'text' ? response.content[0].text : null);

  if (!text) {
    return results;
  }

  // Parse text for URLs
  const urlMatches = text.match(/https?:\/\/[^\s\]<>"{}|\\^`]+/g) || [];

  for (const url of urlMatches) {
    const result = parseMediaUrl(url, mediaType);
    if (result && result.url) {
      results.push(result);
    }
  }

  // Ensure we only return unique results by URL
  const seen = new Set();
  return results.filter((r) => {
    if (seen.has(r.url)) return false;
    seen.add(r.url);
    return true;
  }).slice(0, 5);
}

function parseMediaUrl(url, mediaType) {
  // Validate URL structure
  try {
    const urlObj = new URL(url);
    if (!urlObj.hostname) return null;

    // Validate it's a Norwegian source or major platform
    const hostname = urlObj.hostname.toLowerCase();
    const isNorwegian =
      hostname.includes('nrk.no') ||
      hostname.includes('aftenposten.no') ||
      hostname.includes('vg.no') ||
      hostname.includes('dagbladet.no') ||
      hostname.includes('e24.no') ||
      hostname.includes('youtube.com') ||
      hostname.includes('youtu.be') ||
      hostname.includes('podbean.com') ||
      hostname.includes('spotify.com') ||
      hostname.includes('podcasts.apple.com') ||
      hostname.includes('bbc.co.uk') ||
      hostname.includes('wikipedia.org') ||
      hostname.includes('reddit.com');

    if (!isNorwegian) return null;

    const title = extractTitleFromUrl(urlObj);
    const source = extractSourceName(urlObj);
    const detectedType = detectMediaType(hostname, urlObj.pathname);

    return {
      title,
      url: url.split('?')[0], // Remove query params
      source,
      mediaType: detectedType,
      sourceStatus: 'partial', // URLs from search results are not fully verified
    };
  } catch (error) {
    return null;
  }
}

function extractTitleFromUrl(urlObj) {
  const pathSegments = urlObj.pathname.split('/').filter((s) => s);
  if (pathSegments.length > 0) {
    const lastSegment = pathSegments[pathSegments.length - 1];
    if (lastSegment && !lastSegment.includes('.')) {
      return decodeURIComponent(lastSegment)
        .replace(/[-_]/g, ' ')
        .replace(/\b\w/g, (c) => c.toUpperCase())
        .slice(0, 100);
    }
  }
  return urlObj.hostname;
}

function extractSourceName(urlObj) {
  const hostname = urlObj.hostname.toLowerCase();

  const sourceMap = {
    'nrk.no': 'NRK',
    'aftenposten.no': 'Aftenposten',
    'vg.no': 'VG',
    'dagbladet.no': 'Dagbladet',
    'e24.no': 'E24',
    'youtube.com': 'YouTube',
    'youtu.be': 'YouTube',
    'podbean.com': 'Podbean',
    'spotify.com': 'Spotify',
    'podcasts.apple.com': 'Apple Podcasts',
    'bbc.co.uk': 'BBC',
    'wikipedia.org': 'Wikipedia',
    'reddit.com': 'Reddit',
  };

  for (const [domain, name] of Object.entries(sourceMap)) {
    if (hostname.includes(domain)) {
      return name;
    }
  }

  return hostname;
}

function detectMediaType(hostname, pathname) {
  const h = hostname.toLowerCase();
  const p = pathname.toLowerCase();

  if (h.includes('youtube.com') || h.includes('youtu.be')) {
    return 'youtube';
  }
  if (h.includes('nrk.no') && p.includes('tv')) {
    return 'tv';
  }
  if (h.includes('podbean.com') || h.includes('spotify.com') || h.includes('podcasts.apple.com')) {
    return 'podcast';
  }
  if (h.includes('nrk.no') && (p.includes('nyheter') || p.includes('news'))) {
    return 'news';
  }
  if (p.includes('article') || p.includes('post') || p.includes('story')) {
    return 'article';
  }

  return 'other';
}

// Validate URL is accessible and real
function validateUrl(url) {
  try {
    const urlObj = new URL(url);
    // Basic validation: hostname exists and is not localhost
    return urlObj.hostname && !urlObj.hostname.includes('localhost') && urlObj.hostname.includes('.');
  } catch (error) {
    return false;
  }
}

module.exports = {
  searchNorwegianMedia,
  validateUrl,
  parseMediaUrl,
};
