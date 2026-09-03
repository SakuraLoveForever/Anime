const express = require('express');
const cors = require('cors');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const {
  normalizeDeepSeekModel,
  buildDeepSeekChatRequest,
} = require('./js/deepseek-model-core.js');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

const PORT = process.env.PORT || 3456;
const CUSTOM_SOURCES_FILE = path.join(__dirname, 'custom-sources.json');

// ========== Helpers ==========

async function fetchHTML(url) {
  const resp = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    },
    signal: AbortSignal.timeout(15000),
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  return await resp.text();
}

function detectSite(url) {
  try {
    const host = new URL(url).hostname.replace('www.', '').replace(/^m\./, '');
    if (host === 'bgm.tv' || host === 'bangumi.tv' || host === 'chii.in') return 'bgm';
    if (host === 'myanimelist.net') return 'mal';
    if (host === 'anilist.co') return 'anilist';
    return 'generic';
  } catch { return null; }
}

function resolveUrl(href, baseUrl) {
  if (!href) return '';
  if (href.startsWith('http')) return href;
  if (href.startsWith('//')) return 'https:' + href;
  try { return new URL(href, baseUrl).href; } catch(e) { return ''; }
}

// ========== Custom Sources Storage ==========

function loadCustomSources() {
  try {
    if (fs.existsSync(CUSTOM_SOURCES_FILE)) {
      return JSON.parse(fs.readFileSync(CUSTOM_SOURCES_FILE, 'utf-8'));
    }
  } catch(e) {}
  return [];
}

function saveCustomSources(sources) {
  fs.writeFileSync(CUSTOM_SOURCES_FILE, JSON.stringify(sources, null, 2), 'utf-8');
}

let customSources = loadCustomSources();

const VALID_CATEGORIES = new Set([
  'chinese_anime', 'japanese_anime', 'theatrical_anime', 'anime_movie',
  'movie', 'tv_drama', 'web_drama', 'documentary',
]);
const ANIME_SOURCE_CATEGORIES = new Set(['chinese_anime', 'japanese_anime', 'theatrical_anime', 'anime_movie', 'movie', 'tv_drama', 'web_drama', 'documentary']);
const CATEGORY_LABELS = {
  chinese_anime: '国漫/国产动画',
  japanese_anime: '日漫/TV番剧',
  theatrical_anime: '剧场版动画',
  anime_movie: '动画电影',
  movie: '真人电影',
  tv_drama: '电视剧',
  web_drama: '网剧',
  documentary: '纪录片',
};

function normalizeCategory(category) {
  return VALID_CATEGORIES.has(category) ? category : null;
}

function shouldUseAnimeSources(category) {
  return !category || ANIME_SOURCE_CATEGORIES.has(category);
}

// ========== bgm.tv Parser ==========

async function searchBgm(query) {
  const url = `https://bgm.tv/subject_search/${encodeURIComponent(query)}?cat=2`;
  const html = await fetchHTML(url);
  const $ = cheerio.load(html);
  const results = [];
  $('#browserItemList > li').each((i, el) => {
    if (results.length >= 6) return false;
    const $el = $(el);
    const $a = $el.find('h3 a.l').first();
    const title = $a.text().trim();
    const href = $a.attr('href') || '';
    const idMatch = href.match(/subject\/(\d+)/);
    const id = idMatch ? parseInt(idMatch[1]) : null;
    const $img = $el.find('img.cover').first();
    const cover = ($img.attr('src') || '').replace(/^\/\//, 'https://');
    const $info = $el.find('p.info, span.tip').first();
    const infoText = $info.text().trim();
    const epMatch = infoText.match(/(\d+)\s*话/);
    const episodes = epMatch ? parseInt(epMatch[1]) : 0;
    const $score = $el.find('.rateInfo .fade, .rate_text').first();
    const score = parseFloat($score.text().trim()) || null;
    if (title) results.push({ title, id, cover, episodes, score, source: 'bgm.tv', url: `https://bgm.tv${href}` });
  });
  return results;
}

async function parseBgmSubject(id) {
  const html = await fetchHTML(`https://bgm.tv/subject/${id}`);
  const $ = cheerio.load(html);
  const title = $('h1.nameSingle a').first().text().trim()
    || $('#headerSubject h1 a').first().text().trim()
    || $('meta[property="og:title"]').attr('content') || '';
  const cover = ($('img.cover').first().attr('src') || $('meta[property="og:image"]').attr('content') || '').replace(/^\/\//, 'https://');
  let episodes = 0;
  $('#infobox li').each((i, el) => {
    const text = $(el).text();
    const m = text.match(/话数[：:]\s*(\d+)/) || text.match(/(\d+)\s*话/);
    if (m) episodes = parseInt(m[1]);
  });
  const synopsis = $('#subject_summary').text().trim()
    || $('meta[property="og:description"]').attr('content') || '';
  const scoreText = $('.global_rating .number').first().text().trim()
    || $('.rateInfo .fade').first().text().trim();
  const score = parseFloat(scoreText) || null;
  const genres = [];
  $('.subject_tag_section a span, .subject_tag_section span a').each((i, el) => {
    const g = $(el).text().trim();
    if (g && genres.length < 8) genres.push(g);
  });
  // Detect anime type
  let animeType = null;
  $('#infobox li').each((i, el) => {
    const text = $(el).text().replace(/\s+/g, ' ');
    if (text.includes('类型:') || text.includes('類型:')) {
      const val = text.replace(/类型[：:]|類型[：:]/g, '').trim().toLowerCase();
      if (val.includes('tv') || val.includes('テレビ') || val.includes('tv动画')) animeType = 'tv';
      else if (val.includes('剧场') || val.includes('movie') || val.includes('映画') || val.includes('電影')) animeType = 'movie';
      else if (val.includes('ova') || val.includes('oad')) animeType = 'ova';
      else if (val.includes('web')) animeType = 'web';
      return false;
    }
  });
  return { title, id: parseInt(id), cover, episodes, synopsis: synopsis.substring(0, 2000), score, genres, animeType, source: 'bgm.tv', url: `https://bgm.tv/subject/${id}` };
}

// ========== MyAnimeList Parser (via Jikan) ==========

async function searchMal(query) {
  const resp = await fetch(
    `https://api.jikan.moe/v4/anime?q=${encodeURIComponent(query)}&limit=6&sfw=true`,
    { signal: AbortSignal.timeout(10000) }
  );
  const json = await resp.json();
  return (json.data || []).map(item => ({
    title: item.title, id: item.mal_id,
    episodes: item.episodes || 0,
    cover: item.images?.jpg?.large_image_url || '',
    score: item.score || null,
    synopsis: (item.synopsis || '').substring(0, 2000),
    genres: (item.genres || []).map(g => g.name),
    animeType: item.type ? item.type.toLowerCase() : null,
    source: 'myanimelist.net',
    url: item.url || `https://myanimelist.net/anime/${item.mal_id}/`,
  }));
}

async function fetchMalFull(id) {
  try {
    const resp = await fetch(
      `https://api.jikan.moe/v4/anime/${id}/full`,
      { signal: AbortSignal.timeout(10000) }
    );
    const json = await resp.json();
    const item = json.data;
    if (!item) return null;
    return {
      title: item.title,
      episodes: item.episodes || 0,
      cover: item.images?.jpg?.large_image_url || '',
      score: item.score || null,
      synopsis: (item.synopsis || '').substring(0, 2000),
      genres: (item.genres || []).map(g => g.name),
      category: item.type ? item.type.toLowerCase() : null,
      source: 'myanimelist.net',
      url: item.url || `https://myanimelist.net/anime/${item.mal_id}/`,
    };
  } catch(e) { return null; }
}

// ========== Generic Search (for custom sources) ==========

async function genericSearch(searchUrlTemplate, query) {
  const url = searchUrlTemplate.replace('{query}', encodeURIComponent(query));
  const html = await fetchHTML(url);
  const $ = cheerio.load(html);
  const results = [];
  const seenUrls = new Set();

  // Try common list-item selectors
  const listSelectors = [
    'li:has(a)', '.item:has(a)', '.result:has(a)', '.card:has(a)',
    'article:has(a)', '.video-item:has(a)', '.anime-item:has(a)',
    '.myui-vodlist__box', '.myui-vodlist__thumb',
    '.module-item', '.module-poster',
    '.stui-vodlist__box', '.stui-vodlist__thumb',
    '.hl-list-item', '.hl-item',
    '[class*="item"]:has(a img)', '[class*="card"]:has(a)',
    '[class*="list"] li:has(a)', '[class*="vod"]:has(a)',
    '.public-list-box .public-list-exp', '.video-block',
    '.search-result', '.result-item',
    'a:has(img):not(:has(a))',
  ];

  let found = false;
  for (const sel of listSelectors) {
    if (found) break;
    const items = $(sel);
    if (items.length === 0) continue;

    items.each((i, el) => {
      if (results.length >= 8) return false;
      const $el = $(el);

      // Find link
      let $a = $el.find('a').first();
      if (!$a.length && $el.is('a')) $a = $el;
      const href = $a.attr('href') || '';
      if (!href) return;

      // Find image
      const $img = $el.find('img').first();
      const cover = $img.attr('src') || $img.attr('data-src') || $img.attr('data-original') || '';

      // Find title: try various selectors
      let title = '';
      const titleSelectors = [
        '.title', '.name', 'h3', 'h4', 'h2', '.video-name',
        '.module-item-title', '.stui-vodlist__title',
        '.hl-item-title', '.myui-vodlist__title',
        '[class*="title"]', '[class*="name"]',
      ];
      for (const tSel of titleSelectors) {
        const $t = $el.find(tSel).first();
        if ($t.length) { title = $t.text().trim(); break; }
      }
      if (!title) title = $a.attr('title') || $a.text().trim() || $img.attr('alt') || '';
      // Clean up title
      title = title.replace(/\s+/g, ' ').substring(0, 100);

      const resolvedUrl = resolveUrl(href, url);
      const resolvedCover = resolveUrl(cover, url);

      if (title && resolvedUrl && !seenUrls.has(resolvedUrl)) {
        seenUrls.add(resolvedUrl);
        found = true;
        results.push({
          title,
          cover: resolvedCover,
          url: resolvedUrl,
          source: new URL(url).hostname,
          episodes: 0,
          id: null,
          score: null,
        });
      }
    });
  }

  return results;
}

// ========== Generic Detail Parser ==========

async function parseGeneric(url) {
  const html = await fetchHTML(url);
  const $ = cheerio.load(html);

  // Title
  let title = $('meta[property="og:title"]').attr('content')
    || $('title').text().trim() || '';
  if (!title) {
    title = $('h1').first().text().trim()
      || $('h2').first().text().trim()
      || $('.title').first().text().trim() || '';
  }
  title = title.replace(/\s+/g, ' ').substring(0, 200);

  // Cover
  let cover = ($('meta[property="og:image"]').attr('content') || '');
  if (!cover) {
    const $img = $('img.poster, img.cover, img.thumb, .detail-poster img, .video-cover img').first();
    cover = $img.attr('src') || $img.attr('data-src') || '';
  }
  cover = resolveUrl(cover, url);

  // Synopsis
  let synopsis = $('meta[property="og:description"]').attr('content')
    || $('meta[name="description"]').attr('content') || '';
  if (!synopsis) {
    synopsis = $('.desc, .description, .summary, .detail-desc, .video-desc, [class*="intro"], [class*="summary"]').first().text().trim() || '';
  }

  // Episodes: try many patterns
  let episodes = 0;
  const bodyText = $('body').text();
  const epPatterns = [
    /集\s*数[：:]\s*(\d+)/, /话\s*数[：:]\s*(\d+)/,
    /共\s*(\d+)\s*集/, /全\s*(\d+)\s*集/, /全\s*(\d+)\s*话/,
    /更新至\s*(\d+)\s*集/, /已更新\s*(\d+)\s*集/,
    /连载至\s*(\d+)\s*集/, /状态[：:][^共全]*(\d+)\s*[集话]/,
    /总共\s*(\d+)\s*[集话]/, /(\d+)\s*集全/,
    /episodes?[：:"\s]*(\d+)/i, /总集数[：:]\s*(\d+)/,
    /[集话]数[：:]\s*总共\s*(\d+)/,
  ];
  for (const pat of epPatterns) {
    const m = bodyText.match(pat);
    if (m) { episodes = parseInt(m[1]); break; }
  }

  // Score
  let score = null;
  const scoreMatch = bodyText.match(/(?:评分|分数|rating|score)[：:\s]*(\d+\.?\d*)/i);
  if (scoreMatch) score = parseFloat(scoreMatch[1]) || null;

  // Genres / tags
  const genres = [];
  $('a[href*="tag"], a[href*="genre"], a[href*="category"], .tags a, .genres a, [class*="tag"] a').each((i, el) => {
    const g = $(el).text().trim();
    if (g && g.length < 10 && genres.length < 8) genres.push(g);
  });

  return {
    title, id: null, episodes, cover,
    synopsis: synopsis.substring(0, 2000),
    score, genres,
    source: new URL(url).hostname, url,
  };
}

// ========== Built-in Sources ==========

const SOURCE_NAMES = {
  'bgm.tv': 'Bangumi 番组计划',
  'myanimelist.net': 'MyAnimeList',
  'anilist.co': 'AniList',
};

const SEARCH_FUNCTIONS = {
  'bgm.tv': searchBgm,
  'myanimelist.net': searchMal,
  'anilist.co': searchAniList,
};

// Detect if a source key or URL matches a built-in source
function matchBuiltInSource(key, url) {
  // Direct key match (e.g. "bgm.tv", "anilist.co")
  if (SEARCH_FUNCTIONS[key]) return key;
  if (!url) return null;
  // URL pattern match
  const patterns = {
    'bgm.tv': 'bgm.tv/subject_search',
    'myanimelist.net': 'myanimelist.net/anime',
    'anilist.co': 'anilist.co',
  };
  for (const [k, pat] of Object.entries(patterns)) {
    if (url.includes(pat)) return k;
  }
  return null;
}

const PARSE_FUNCTIONS = {
  'bgm': parseBgmSubject,
  'mal': async (id) => {
    const resp = await fetch(`https://api.jikan.moe/v4/anime/${id}/full`, { signal: AbortSignal.timeout(10000) });
    const json = await resp.json();
    const item = json.data;
    return {
      title: item.title, id: item.mal_id, episodes: item.episodes || 0,
      cover: item.images?.jpg?.large_image_url || '',
      score: item.score || null,
      synopsis: (item.synopsis || '').substring(0, 2000),
      genres: (item.genres || []).map(g => g.name),
      animeType: item.type ? item.type.toLowerCase() : null,
      source: 'myanimelist.net', url: item.url || `https://myanimelist.net/anime/${item.mal_id}/`,
    };
  },
};

// ========== API Routes ==========

// GET /api/ping — health check
app.get('/api/ping', (_req, res) => {
  res.json({ ok: true, uptime: process.uptime() });
});

// GET /api/sources — list all sources (built-in + custom)
const BUILTIN_DEFAULT_URLS = {
  'bgm.tv': 'https://bgm.tv/subject_search/{query}?cat=2',
  'myanimelist.net': 'https://myanimelist.net/anime.php?q={query}',
  'anilist.co': 'https://anilist.co/search/anime/{query}',
};

app.get('/api/sources', (_req, res) => {
  const builtIn = Object.keys(SOURCE_NAMES).map(key => ({
    key,
    name: SOURCE_NAMES[key],
    type: 'builtin',
    searchUrl: BUILTIN_DEFAULT_URLS[key] || '',
    supportsSearch: true,
    supportsParse: true,
  }));
  const custom = customSources.map(cs => ({
    key: cs.id,
    name: cs.name,
    type: 'custom',
    searchUrl: cs.searchUrl,
    supportsSearch: true,
    supportsParse: true,
  }));
  res.json({ builtIn, custom });
});

// GET /api/search?q=xxx&sources=a,b,c
app.get('/api/search', async (req, res) => {
  const q = (req.query.q || '').trim();
  const sourceKeys = (req.query.sources || '').split(',').filter(Boolean);
  const category = normalizeCategory(req.query.category || '');
  const allowAnimeSources = shouldUseAnimeSources(category);

  if (!q) return res.json({ results: [] });

  const allResults = [];
  const promises = [];

  // Built-in sources (use custom URL if provided, otherwise use built-in search)
  for (const key of sourceKeys) {
    const customUrl = req.query[`url_${key}`];
    // Detect built-in source by URL pattern or key match
    const builtInKey = matchBuiltInSource(key, customUrl);
    if (builtInKey && SEARCH_FUNCTIONS[builtInKey] && allowAnimeSources) {
      promises.push(
        SEARCH_FUNCTIONS[builtInKey](q).then(r => { allResults.push(...r); }).catch(e => console.error(`[${builtInKey}]`, e.message))
      );
    } else if (!builtInKey && customUrl && customUrl.includes('{query}')) {
      // Custom URL override → use generic search
      promises.push(
        genericSearch(customUrl, q).then(r => {
          allResults.push(...r.map(item => ({ ...item, source: SOURCE_NAMES[key] || key })));
        }).catch(e => console.error(`[${key}:custom]`, e.message))
      );
    }
  }

  // Custom sources
  for (const cs of customSources) {
    if (sourceKeys.includes(cs.id)) {
      if (!allowAnimeSources && matchBuiltInSource(cs.id, cs.searchUrl)) continue;
      promises.push(
        genericSearch(cs.searchUrl, q).then(r => {
          allResults.push(...r.map(item => ({ ...item, source: cs.name })));
        }).catch(e => console.error(`[${cs.name}]`, e.message))
      );
    }
  }

  await Promise.allSettled(promises);

  // Deduplicate
  const seen = new Set();
  const deduped = allResults.filter(r => {
    const key = r.title.toLowerCase().replace(/[^a-z0-9一-鿿ぁ-ゟァ-ヿ]/g, '');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 10);

  res.json({ results: deduped });
});

// POST /api/fetch-url — parse a single URL
app.post('/api/fetch-url', async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: 'URL required' });

  try {
    const site = detectSite(url);
    let data;

    if (site === 'bgm') {
      const m = url.match(/subject\/(\d+)/);
      if (m) data = await PARSE_FUNCTIONS['bgm'](parseInt(m[1]));
    } else if (site === 'mal') {
      const m = url.match(/anime\/(\d+)/);
      if (m) data = await PARSE_FUNCTIONS['mal'](parseInt(m[1]));
    } else {
      data = await parseGeneric(url);
    }

    res.json({ data: data || null });
  } catch (e) {
    console.error('Fetch URL error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// POST /api/fetch-urls — batch fetch
app.post('/api/fetch-urls', async (req, res) => {
  const { urls } = req.body;
  if (!urls || !Array.isArray(urls)) return res.status(400).json({ error: 'URLs array required' });

  const results = [];
  for (const url of urls) {
    try {
      const site = detectSite(url);
      let data;
      if (site === 'bgm') {
        const m = url.match(/subject\/(\d+)/);
        if (m) data = await PARSE_FUNCTIONS['bgm'](parseInt(m[1]));
      } else if (site === 'mal') {
        const m = url.match(/anime\/(\d+)/);
        if (m) data = await PARSE_FUNCTIONS['mal'](parseInt(m[1]));
      } else {
        data = await parseGeneric(url);
      }
      if (data) { data._url = url; results.push(data); }
    } catch (e) { results.push({ _url: url, _error: e.message }); }
  }
  res.json({ results });
});

// ========== Custom Sources CRUD ==========

app.get('/api/custom-sources', (_req, res) => {
  res.json(customSources);
});

app.post('/api/custom-sources', (req, res) => {
  const { name, searchUrl } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: '名称不能为空' });
  if (!searchUrl || !searchUrl.includes('{query}')) {
    return res.status(400).json({ error: '搜索链接必须包含 {query} 占位符' });
  }
  const source = {
    id: 'custom_' + Date.now(),
    name: name.trim(),
    searchUrl: searchUrl.trim(),
    createdAt: new Date().toISOString(),
  };
  customSources.push(source);
  saveCustomSources(customSources);
  res.json(source);
});

app.put('/api/custom-sources/:id', (req, res) => {
  const idx = customSources.findIndex(s => s.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: '来源不存在' });
  const { name, searchUrl } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: '名称不能为空' });
  if (!searchUrl || !searchUrl.includes('{query}')) {
    return res.status(400).json({ error: '搜索链接必须包含 {query} 占位符' });
  }
  customSources[idx] = {
    ...customSources[idx],
    name: name.trim(),
    searchUrl: searchUrl.trim(),
    updatedAt: new Date().toISOString(),
  };
  saveCustomSources(customSources);
  res.json(customSources[idx]);
});

app.delete('/api/custom-sources/:id', (req, res) => {
  const idx = customSources.findIndex(s => s.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: '来源不存在' });
  customSources.splice(idx, 1);
  saveCustomSources(customSources);
  res.json({ ok: true });
});

// ========== Config Storage ==========
// Priority: environment variables > config.json file > defaults
const CONFIG_FILE = path.join(__dirname, 'config.json');

function loadConfig() {
  let cfg = {};
  try {
    if (fs.existsSync(CONFIG_FILE)) cfg = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
  } catch(e) {}

  // Merge environment variables (Render Dashboard, etc.)
  if (process.env.DEEPSEEK_API_KEY) cfg.deepseekApiKey = process.env.DEEPSEEK_API_KEY;

  if (process.env.SUPABASE_URL || process.env.SUPABASE_SERVICE_ROLE_KEY) {
    cfg.supabase = cfg.supabase || {};
    if (process.env.SUPABASE_URL) cfg.supabase.url = process.env.SUPABASE_URL;
    if (process.env.SUPABASE_ANON_KEY) cfg.supabase.anonKey = process.env.SUPABASE_ANON_KEY;
    if (process.env.SUPABASE_SERVICE_ROLE_KEY) cfg.supabase.serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  }

  return cfg;
}
function saveConfig(cfg) {
  try { fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2), 'utf-8'); } catch(e) {}
}

// GET /api/config — get public config
app.get('/api/config', (_req, res) => {
  const cfg = loadConfig();
  const sb = cfg.supabase || {};
  res.json({
    supabaseUrl: sb.url || '',
    supabaseAnonKey: sb.anonKey || '',
  });
});

// POST /api/config — set config
app.post('/api/config', (req, res) => {
  const { deepseekApiKey, supabase } = req.body;
  const cfg = loadConfig();
  if (deepseekApiKey && deepseekApiKey.trim()) {
    cfg.deepseekApiKey = deepseekApiKey.trim();
  }
  if (supabase) {
    cfg.supabase = cfg.supabase || {};
    if (supabase.url) cfg.supabase.url = supabase.url;
    if (supabase.anonKey) cfg.supabase.anonKey = supabase.anonKey;
    if (supabase.serviceRoleKey) cfg.supabase.serviceRoleKey = supabase.serviceRoleKey;
  }
  saveConfig(cfg);
  res.json({ ok: true });
});

// ========== AniList Cover Search ==========
async function searchAniList(title) {
  const query = `
    query ($search: String) {
      Page(perPage: 5) {
        media(search: $search, type: ANIME) {
          id
          title { romaji english native }
          coverImage { extraLarge large medium }
          siteUrl
        }
      }
    }`;
  try {
    const resp = await fetch('https://graphql.anilist.co', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({ query, variables: { search: title } }),
      signal: AbortSignal.timeout(8000),
    });
    if (!resp.ok) return [];
    const json = await resp.json();
    return (json.data?.Page?.media || []).map(m => ({
      title: m.title?.romaji || m.title?.english || m.title?.native || '',
      cover: m.coverImage?.extraLarge || m.coverImage?.large || m.coverImage?.medium || '',
      url: m.siteUrl || `https://anilist.co/anime/${m.id}`,
      source: 'anilist.co',
    }));
  } catch(e) { return []; }
}

// ========== AI Enrich ==========
async function callAI(query, userId, category, fallbackApiKey, requestedModel) {
  const apiKey = await resolveApiKey(userId) || fallbackApiKey;
  if (!apiKey) throw new Error('未配置 DeepSeek API Key');
  const model = normalizeDeepSeekModel(requestedModel);
  const categoryHint = normalizeCategory(category);
  const categoryLabel = categoryHint ? CATEGORY_LABELS[categoryHint] : '未指定';

  const prompt = `请识别这部影视/动画作品：「${query}」，返回严格JSON（不要markdown代码块）：
{
  "title": "必须原样返回用户输入的名称：${query}",
  "titleEn": "英文/罗马字名称（日漫用罗马字，国产用拼音）",
  "titleJa": "日文原名（不是日漫则填空字符串）",
  "episodes": 集数/总篇数(电影通常填1，TV动画/电视剧填实际集数，不确定填0)，
  "category": "必须从以下8个分类中严格选择最合适的一个：",
  "synopsis": "中文剧情简介，必须是中文，200-400字，介绍故事背景和主要内容。禁止英文简介！",
  "score": 评分(1-10的数字，参考豆瓣/Bangumi/MAL综合评分，不确定填null)，
  "genres": ["中文标签1", "中文标签2", "中文标签3"],
  "year": 首播年份(如2023)
}

【8大分类 · 严格判定规则】
1. chinese_anime（国漫/国产动画）→ 中国出品的动画，TV连载或网络播出。例：一人之下、狐妖小红娘、时光代理人、伍六七
2. japanese_anime（日漫/TV番剧）→ 日本出品的TV/网络连载动画（含OVA/ONA）。例：鬼灭之刃、进击的巨人、葬送的芙莉莲
3. theatrical_anime（剧场版动画）→ 日本出品的动画电影（在影院上映的独立作品或TV续篇剧场版）。例：你的名字。、千与千寻、鬼灭之刃 无限列车篇
4. anime_movie（动画电影）→ 非日本的动画电影（中国/欧美/其他国家出品的动画电影）。例：哪吒之魔童降世、疯狂动物城、蜘蛛侠：纵横宇宙
5. movie（真人电影）→ 真人出演的电影（非动画）。例：流浪地球、肖申克的救赎、你的婚礼
6. tv_drama（电视剧）→ 真人出演的电视剧（电视台播出）。例：庆余年、甄嬛传、权力的游戏
7. web_drama（网剧）→ 真人出演的网络剧（网络平台首发，不上电视台）。例：隐秘的角落、沉默的真相、开端
8. documentary（纪录片）→ 纪录片（任何题材/形式）。例：地球脉动、舌尖上的中国

【判定优先级】先看形式（动画 vs 真人）→ 再看产地（日本 vs 其他）→ 最后看播出渠道（TV vs 网播 vs 影院）

【用户当前添加分类】${categoryHint || '未指定'}（${categoryLabel}）
如果用户当前添加分类已指定，请优先按这个分类理解作品；例如分类为 movie 时，「黑客帝国」应按真人电影理解，不能改成《黑客帝国动画版》或其他衍生作品。

注意：title必须严格等于用户输入「${query}」，不能改名、不能翻译、不能替换成别名或衍生作品名。synopsis和genres都必须是中文！禁止英文标签！category必须从给定的8个选项中选择！如果完全找不到则返回：{"title":"${query}","titleEn":"","titleJa":"","episodes":0,"category":"${categoryHint || 'japanese_anime'}","synopsis":"","score":null,"genres":[],"year":null}`;

  const resp = await fetch('https://api.deepseek.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
    body: JSON.stringify(buildDeepSeekChatRequest({
      model,
      messages: [
        { role: 'system', content: '你是一个专业的影视/动画信息助手。必须尊重用户选择的分类上下文；用户输入的标题是主键，不能替换成别名、翻译名或衍生作品名。所有文本内容（剧情简介、标签/类型）都必须使用中文。只返回JSON，不要额外解释。' },
        { role: 'user', content: prompt },
      ],
      temperature: 0.3,
      maxTokens: 2000,
    })),
    signal: AbortSignal.timeout(25000),
  });

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(err.error?.message || `DeepSeek API ${resp.status}`);
  }

  const json = await resp.json();
  const content = json.choices?.[0]?.message?.content || '';
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('AI 返回格式异常');
  return JSON.parse(jsonMatch[0]);
}

function fuzzyMatchScore(a, b) {
  // Simple fuzzy matching: how many characters overlap
  const clean = s => (s || '').toLowerCase().replace(/[^a-z0-9一-鿿぀-ゟ゠-ヿ]/g, '');
  const ca = clean(a);
  const cb = clean(b);
  if (!ca || !cb) return 0;
  if (ca === cb) return 100;
  if (ca.includes(cb) || cb.includes(ca)) return 80;
  let overlap = 0;
  for (const ch of ca) { if (cb.includes(ch)) overlap++; }
  return Math.round((overlap / Math.max(ca.length, cb.length)) * 60);
}

app.post('/api/ai-enrich', optionalAuth, async (req, res) => {
  const q = (req.body.query || req.body.title || '').trim();
  const requestedCategory = normalizeCategory(req.body.category || '');
  const allowAnimeSources = shouldUseAnimeSources(requestedCategory);
  if (!q) return res.status(400).json({ error: '需要作品名称' });
  try {
    // Step 1: Get AI identification
    let aiData = { title: '', titleEn: '', titleJa: '', episodes: 0, category: null, synopsis: '', score: null, genres: [], year: null };
    try {
      aiData = await callAI(q, req.user?.id, requestedCategory, req.body.apiKey, req.body.model);
    } catch(e) { console.error('AI call failed:', e.message); }

    // Step 2: Search real sources with multiple title variants
    const searchTitles = [...new Set([
      aiData.title, aiData.titleEn, aiData.titleJa, q
    ].filter(Boolean))];

    const allSearchResults = [];
    if (allowAnimeSources) {
      const tasks = [];
      for (const title of searchTitles.slice(0, 3)) {
        tasks.push(
          searchMal(title).then(r => r.map(x => ({ ...x, _src: 'mal' }))).catch(() => []),
          searchBgm(title).then(r => r.map(x => ({ ...x, _src: 'bgm' }))).catch(() => [])
        );
      }
      const settled = await Promise.allSettled(tasks);
      for (const r of settled) {
        if (r.status === 'fulfilled') allSearchResults.push(...r.value);
      }
    }

    // Step 3: Find best real source match
    let bestReal = null;
    let bestScore = 0;
    const seen = new Set();
    for (const r of allSearchResults) {
      const key = (r.title || '').toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      let score = 0;
      for (const t of searchTitles.slice(0, 4)) {
        score = Math.max(score, fuzzyMatchScore(r.title, t));
      }
      if (score > bestScore) { bestScore = score; bestReal = r; }
    }

    // Step 4: If good real match found (score >= 30), fetch full details
    let realDetail = null;
    if (bestReal && bestReal.id && bestScore >= 30) {
      try {
        if (bestReal._src === 'bgm') {
          realDetail = await parseBgmSubject(bestReal.id);
        } else if (bestReal._src === 'mal') {
          realDetail = await fetchMalFull(bestReal.id);
        }
      } catch(e) {}
    }

    // Map raw animeType to category values matching frontend <select>
    const mapCategory = (raw) => {
      const m = { tv: 'japanese_anime', movie: 'anime_movie', ova: 'japanese_anime', ona: 'japanese_anime', web: 'japanese_anime', special: 'japanese_anime', music: 'anime_movie' };
      return m[raw] || raw || null;
    };

    // Step 5: Build merged result — real data preferred
    const merged = {
      title: q,
      episodes: bestReal?.episodes || parseInt(aiData.episodes) || 0,
      category: requestedCategory || mapCategory(bestReal?.category || bestReal?.animeType) || aiData.category || null,
      synopsis: realDetail?.synopsis || bestReal?.synopsis || aiData.synopsis || '',
      score: bestReal?.score || aiData.score || null,
      genres: (realDetail?.genres && realDetail.genres.length > 0)
        ? realDetail.genres
        : ((bestReal?.genres && bestReal.genres.length > 0) ? bestReal.genres : (aiData.genres || [])),
      sourceUrl: bestReal?.url || aiData.sourceUrl || '',
      source: bestReal ? (bestReal.source || bestReal._src) : 'DeepSeek AI',
    };

    // Helper to check if a result is a reasonable match for the query
    const isRelevantMatch = (r, minScore) => {
      let score = 0;
      for (const t of searchTitles.slice(0, 3)) {
        score = Math.max(score, fuzzyMatchScore(r.title, t));
      }
      score = Math.max(score, fuzzyMatchScore(r.title, q));
      return score >= minScore;
    };

    // Step 6: Collect covers from matching real sources only
    const covers = [];
    const coverSeen = new Set();
    const addCover = (url, src, title) => {
      if (url && !coverSeen.has(url)) {
        coverSeen.add(url);
        covers.push({ url, source: src, title: title || '' });
      }
    };
    if (realDetail?.cover) addCover(realDetail.cover, realDetail._src === 'bgm' ? 'Bangumi' : 'MyAnimeList', realDetail.title);
    for (const r of allSearchResults) {
      if (r.cover && isRelevantMatch(r, 30)) addCover(r.cover, r.source || r._src, r.title);
    }

    // Step 7: Also search AniList for additional covers, but only for animation/anime categories.
    if (allowAnimeSources) {
      for (const title of searchTitles.slice(0, 2)) {
        try {
          const anilistResults = await searchAniList(title);
          for (const r of anilistResults) {
            if (r.cover && isRelevantMatch(r, 30)) addCover(r.cover, 'AniList', r.title);
          }
        } catch(e) {}
      }
    }

    res.json({
      data: {
        ...merged,
        cover: covers.length > 0 ? covers[0].url : '',
        covers: covers,
      },
    });
  } catch (e) {
    console.error('AI enrich error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ========== Test endpoint ==========
app.post('/api/test-search', async (req, res) => {
  const { searchUrl, query } = req.body;
  if (!searchUrl || !query) return res.status(400).json({ error: '需要 searchUrl 和 query' });
  try {
    const results = await genericSearch(searchUrl, query);
    res.json({ results });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ========== Recommend (Content-Based) ==========
// POST /api/recommend — takes user's anime list, returns recommendations
app.post('/api/recommend', async (req, res) => {
  const { animeList, limit } = req.body;
  if (!Array.isArray(animeList) || animeList.length === 0) {
    return res.json({ recommendations: [] });
  }
  const n = Math.min(limit || 10, 20);

  try {
    // 1. Build genre profile from user's highly-rated anime
    var genreWeights = {};
    var totalWeight = 0;
    for (var i = 0; i < animeList.length; i++) {
      var a = animeList[i];
      var score = a.score || 5;
      var weight = score >= 7 ? 2 : score >= 5 ? 1 : 0;
      if (weight === 0) continue;
      var genres = a.genres || [];
      for (var g = 0; g < genres.length; g++) {
        var genre = genres[g].trim().toLowerCase();
        genreWeights[genre] = (genreWeights[genre] || 0) + weight;
        totalWeight += weight;
      }
    }

    // Normalize
    var topGenres = Object.entries(genreWeights)
      .sort(function(a, b) { return b[1] - a[1]; })
      .slice(0, 5)
      .map(function(e) { return e[0]; });

    if (topGenres.length === 0) {
      return res.json({ recommendations: [], profile: { topGenres: [] } });
    }

    // 2. Search external sources for each top genre
    var allCandidates = [];
    var seenIds = new Set();
    // Track what user already has (by title lowercase)
    var ownedTitles = new Set();
    for (var oi = 0; oi < animeList.length; oi++) {
      ownedTitles.add(animeList[oi].title.toLowerCase().replace(/[^a-z0-9一-鿿]/g, ''));
    }

    for (var tg = 0; tg < Math.min(topGenres.length, 3); tg++) {
      try {
        // Use MAL API to search by genre (via Jikan genre search)
        var genreQuery = topGenres[tg];
        // Jikan doesn't have direct genre search, so use general search with genre keyword
        var resp = await fetch(
          'https://api.jikan.moe/v4/anime?q=' + encodeURIComponent(genreQuery) + '&limit=8&sfw=true&order_by=score&sort=desc',
          { signal: AbortSignal.timeout(8000) }
        );
        if (resp.ok) {
          var json = await resp.json();
          var items = json.data || [];
          for (var j = 0; j < items.length; j++) {
            var item = items[j];
            var key = 'mal_' + item.mal_id;
            if (seenIds.has(key)) continue;
            seenIds.add(key);
            var titleKey = (item.title || '').toLowerCase().replace(/[^a-z0-9一-鿿]/g, '');
            if (ownedTitles.has(titleKey)) continue;
            var itemGenres = (item.genres || []).map(function(g) { return g.name ? g.name.trim().toLowerCase() : ''; });
            var matchCount = 0;
            for (var mg = 0; mg < itemGenres.length; mg++) {
              if (topGenres.indexOf(itemGenres[mg]) !== -1) matchCount++;
            }
            allCandidates.push({
              title: item.title || item.title_english || '',
              titleEn: item.title_english || '',
              cover: item.images?.jpg?.large_image_url || '',
              url: item.url || 'https://myanimelist.net/anime/' + item.mal_id,
              score: item.score || null,
              episodes: item.episodes || 0,
              genres: (item.genres || []).map(function(g) { return g.name || ''; }),
              synopsis: (item.synopsis || '').substring(0, 300),
              source: 'myanimelist.net',
              matchScore: matchCount,
            });
          }
        }
      } catch(e) { /* skip failed source */ }
    }

    // 3. Sort by match score (genre overlap) then by rating
    allCandidates.sort(function(a, b) {
      if (b.matchScore !== a.matchScore) return b.matchScore - a.matchScore;
      return (b.score || 0) - (a.score || 0);
    });

    res.json({
      profile: { topGenres: topGenres },
      recommendations: allCandidates.slice(0, n),
    });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// ========== Semantic Search (Plot/Description Search) ==========
// POST /api/semantic-search — search anime by plot description or story keywords
app.post('/api/semantic-search', async (req, res) => {
  var query = (req.body.query || '').trim();
  if (!query) return res.json({ results: [] });

  try {
    // 1. Extract keywords from the query
    var keywords = query
      .replace(/[，。！？、；：""''【】《》（）\s]+/g, ' ')
      .split(' ')
      .filter(function(w) { return w.length >= 2; });

    if (keywords.length === 0) keywords = [query];

    var allResults = [];
    var seenUrls = new Set();

    // 2. Search MAL for each keyword and collect descriptions
    for (var k = 0; k < Math.min(keywords.length, 2); k++) {
      try {
        var resp = await fetch(
          'https://api.jikan.moe/v4/anime?q=' + encodeURIComponent(keywords[k]) + '&limit=8&sfw=true',
          { signal: AbortSignal.timeout(8000) }
        );
        if (!resp.ok) continue;
        var json = await resp.json();
        var items = json.data || [];
        for (var j = 0; j < items.length; j++) {
          var item = items[j];
          var key = item.url || ('mal_' + item.mal_id);
          if (seenUrls.has(key)) continue;
          seenUrls.add(key);

          // Calculate relevance score: keyword match in title + synopsis
          var title = (item.title || '').toLowerCase();
          var synopsis = (item.synopsis || '').toLowerCase();
          var relevance = 0;
          for (var kw = 0; kw < keywords.length; kw++) {
            var kwLower = keywords[kw].toLowerCase();
            if (title.indexOf(kwLower) !== -1) relevance += 3;
            if (synopsis.indexOf(kwLower) !== -1) relevance += 1;
          }

          if (relevance > 0 || k === 0) {
            allResults.push({
              title: item.title || item.title_english || '',
              titleEn: item.title_english || '',
              cover: item.images?.jpg?.large_image_url || '',
              url: key,
              score: item.score || null,
              episodes: item.episodes || 0,
              genres: (item.genres || []).map(function(g) { return g.name || ''; }),
              synopsis: (item.synopsis || '').substring(0, 400),
              source: 'myanimelist.net',
              relevance: relevance,
              year: item.year || null,
            });
          }
        }
      } catch(e) { /* skip */ }
    }

    // 3. Also try generic search on Bangumi for Chinese queries
    if (/[一-鿿]/.test(query)) {
      try {
        var bgmResults = await searchBgm(query);
        for (var bi = 0; bi < bgmResults.length; bi++) {
          var br = bgmResults[bi];
          if (!seenUrls.has(br.url)) {
            seenUrls.add(br.url);
            allResults.push({
              title: br.title,
              titleEn: '',
              cover: br.cover || '',
              url: br.url,
              score: br.score || null,
              episodes: br.episodes || 0,
              genres: [],
              synopsis: '',
              source: 'bgm.tv',
              relevance: 5,
              year: null,
            });
          }
        }
      } catch(e) { /* skip */ }
    }

    // 4. Sort by relevance
    allResults.sort(function(a, b) { return b.relevance - a.relevance; });

    res.json({ results: allResults.slice(0, 15) });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// ========== Test AI API ==========
app.post('/api/test-ai', optionalAuth, async (req, res) => {
  const apiKey = await resolveApiKey(req.user?.id) || req.body.apiKey;
  if (!apiKey) return res.status(400).json({ error: '请先在设置中配置你的 DeepSeek API Key' });
  const model = normalizeDeepSeekModel(req.body.model);
  try {
    const resp = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: 'Hi' }],
        max_tokens: 10,
      }),
      signal: AbortSignal.timeout(10000),
    });
    if (resp.ok) {
      const data = await resp.json();
      res.json({ ok: true, model: data.model || model, usage: data.usage });
    } else {
      const err = await resp.text();
      let msg = `HTTP ${resp.status}`;
      try { const j = JSON.parse(err); msg = j.error?.message || msg; } catch(_) {}
      res.status(502).json({ error: msg });
    }
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ========== Reclassify ==========
app.post('/api/reclassify', optionalAuth, async (req, res) => {
  const titles = (req.body.titles || []).map(t => (t || '').trim()).filter(Boolean);
  if (titles.length === 0) return res.status(400).json({ error: '需要至少一个番剧名称' });
  const apiKey = await resolveApiKey(req.user?.id) || req.body.apiKey;
  if (!apiKey) return res.status(400).json({ error: '请先在设置中配置你的 DeepSeek API Key' });
  const model = normalizeDeepSeekModel(req.body.model);

  const rules = `【8大分类 · 严格判定规则】
1. chinese_anime（国漫/国产动画）→ 中国出品的动画，TV连载或网络播出。例：一人之下、狐妖小红娘、时光代理人、伍六七
2. japanese_anime（日漫/TV番剧）→ 日本出品的TV/网络连载动画（含OVA/ONA）。例：鬼灭之刃、进击的巨人、葬送的芙莉莲
3. theatrical_anime（剧场版动画）→ 日本出品的动画电影（在影院上映的独立作品或TV续篇剧场版）。例：你的名字。、千与千寻、鬼灭之刃 无限列车篇
4. anime_movie（动画电影）→ 非日本的动画电影（中国/欧美/其他国家出品的动画电影）。例：哪吒之魔童降世、疯狂动物城、蜘蛛侠：纵横宇宙
5. movie（真人电影）→ 真人出演的电影（非动画）。例：流浪地球、肖申克的救赎、你的婚礼
6. tv_drama（电视剧）→ 真人出演的电视剧（电视台播出）。例：庆余年、甄嬛传、权力的游戏
7. web_drama（网剧）→ 真人出演的网络剧（网络平台首发，不上电视台）。例：隐秘的角落、沉默的真相、开端
8. documentary（纪录片）→ 纪录片（任何题材/形式）。例：地球脉动、舌尖上的中国
【判定优先级】先看形式（动画 vs 真人）→ 再看产地（日本 vs 其他）→ 最后看播出渠道（TV vs 网播 vs 影院）`;

  const titleList = titles.map((t, i) => `${i + 1}. ${t}`).join('\n');

  try {
    const resp = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify(buildDeepSeekChatRequest({
        model,
        messages: [
          { role: 'system', content: `你是一个专业的作品分类助手。根据以下分类规则对每部作品进行分类，只返回JSON。\n\n${rules}` },
          { role: 'user', content: `请为以下作品逐一分类，返回JSON数组（不要markdown）：\n${titleList}\n\n返回格式：[{"index": 1, "category": "japanese_anime"}, ...]\nindex对应序号，category必须是8个分类值之一。不确定时归类为japanese_anime。` },
        ],
        temperature: 0.1,
        maxTokens: 2000,
      })),
      signal: AbortSignal.timeout(30000),
    });

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      return res.status(502).json({ error: err.error?.message || `API ${resp.status}` });
    }

    const json = await resp.json();
    const content = json.choices?.[0]?.message?.content || '';
    const match = content.match(/\[[\s\S]*\]/);
    if (!match) return res.status(500).json({ error: 'AI 返回格式异常' });

    const results = JSON.parse(match[0]);
    const mapped = results.map(r => {
      const idx = (typeof r.index === 'number' ? r.index : parseInt(r.index) || 0) - 1;
      return {
        title: titles[idx] || '',
        category: r.category || 'japanese_anime',
      };
    });

    res.json({ results: mapped });
  } catch (e) {
    console.error('Reclassify error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ========== Image Proxy ==========
app.get('/api/proxy-image', async (req, res) => {
  const url = req.query.url;
  if (!url) return res.status(400).send('url required');
  try {
    const resp = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
      signal: AbortSignal.timeout(8000),
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const contentType = resp.headers.get('content-type') || 'image/jpeg';
    res.set('Content-Type', contentType);
    res.set('Cache-Control', 'public, max-age=86400');
    const buf = await resp.arrayBuffer();
    res.send(Buffer.from(buf));
  } catch(e) {
    res.status(500).send(e.message);
  }
});

// ========== Supabase Client ==========

function getSupabaseAdmin() {
  const cfg = loadConfig();
  const sb = cfg.supabase || {};
  if (!sb.url || !sb.serviceRoleKey) {
    console.error('[supabase] Missing url or serviceRoleKey in config');
    return null;
  }
  return createClient(sb.url, sb.serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

// ========== User Data (Supabase DB) ==========

// Ensure user_settings row exists for a user
async function ensureUserSettings(supabase, userId) {
  if (!supabase || !userId) return;
  const { data } = await supabase.from('user_settings').select('user_id').eq('user_id', userId).maybeSingle();
  if (!data) {
    await supabase.from('user_settings').insert({
      user_id: userId,
      api_key: '',
      api_provider: 'deepseek',
      api_url: 'https://api.deepseek.com',
      api_model: 'deepseek-v4-flash',
    });
  }
}

// Helper: resolve API key — user's key from Supabase first, then server default
async function resolveApiKey(userId) {
  if (userId) {
    const supabase = getSupabaseAdmin();
    if (supabase) {
      try {
        const { data } = await supabase.from('user_settings').select('api_key').eq('user_id', userId).maybeSingle();
        if (data && data.api_key) return data.api_key;
      } catch(e) { console.error('resolveApiKey error:', e.message); }
    }
  }
  return '';
}

// ========== Auth Middleware ==========

// Verify Supabase JWT and attach user
async function authMiddleware(req, res, next) {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) return res.status(401).json({ error: '未登录' });

  const supabase = getSupabaseAdmin();
  if (!supabase) return res.status(500).json({ error: '认证服务不可用' });

  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return res.status(401).json({ error: '登录已过期，请重新登录' });

  req.user = { id: user.id, email: user.email, username: user.user_metadata?.username || user.email };
  next();
}

// Optional auth — attaches user if JWT valid, otherwise continues
async function optionalAuth(req, res, next) {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (token) {
    const supabase = getSupabaseAdmin();
    if (supabase) {
      try {
        const { data: { user } } = await supabase.auth.getUser(token);
        if (user) req.user = { id: user.id, email: user.email, username: user.user_metadata?.username || user.email };
      } catch(e) {}
    }
  }
  next();
}

// ========== Auth Endpoints ==========

// GET /api/auth/me — verify current session
app.get('/api/auth/me', authMiddleware, (req, res) => {
  res.json({ username: req.user.username, email: req.user.email });
});

// POST /api/auth/logout — notify server (client handles actual Supabase signOut)
app.post('/api/auth/logout', authMiddleware, (_req, res) => {
  res.json({ ok: true });
});

// GET /api/auth/api-key — get current user's API key (masked)
app.get('/api/auth/api-key', authMiddleware, async (req, res) => {
  const supabase = getSupabaseAdmin();
  if (!supabase) return res.status(500).json({ error: '数据库不可用' });

  await ensureUserSettings(supabase, req.user.id);
  const { data } = await supabase.from('user_settings').select('api_key,api_provider,api_url,api_model').eq('user_id', req.user.id).single();

  const key = (data && data.api_key) || '';
  const provider = (data && data.api_provider) || 'deepseek';
  res.json({
    apiKeySet: !!key,
    apiKeyMasked: key ? key.slice(0, 6) + '****' + key.slice(-4) : '',
    apiProvider: provider,
    apiUrl: (data && data.api_url) || 'https://api.deepseek.com',
    apiModel: provider === 'deepseek' ? normalizeDeepSeekModel(data && data.api_model) : ((data && data.api_model) || 'deepseek-v4-flash'),
  });
});

// POST /api/auth/api-key — save user's own API key
app.post('/api/auth/api-key', authMiddleware, async (req, res) => {
  const { apiKey, apiUrl, apiProvider, apiModel } = req.body;
  const supabase = getSupabaseAdmin();
  if (!supabase) return res.status(500).json({ error: '数据库不可用' });

  await ensureUserSettings(supabase, req.user.id);
  const updates = {};
  if (apiKey !== undefined) updates.api_key = (apiKey || '').trim();
  if (apiUrl !== undefined) updates.api_url = (apiUrl || '').trim();
  if (apiProvider !== undefined) updates.api_provider = apiProvider;
  if (apiModel !== undefined) {
    updates.api_model = apiProvider === 'deepseek'
      ? normalizeDeepSeekModel(apiModel)
      : String(apiModel || '').trim() || 'deepseek-v4-flash';
  }
  updates.updated_at = new Date().toISOString();

  const { error } = await supabase.from('user_settings').update(updates).eq('user_id', req.user.id);
  if (error) return res.status(500).json({ error: '保存失败' });
  res.json({ ok: true });
});

// Health check for Render
app.get('/health', (_req, res) => res.json({ status: 'ok' }));

app.listen(PORT, () => {
  console.log(`Anime tracker backend running at http://localhost:${PORT}`);
  console.log(`Open http://localhost:${PORT} in your browser`);
  console.log(`Built-in sources: ${Object.keys(SOURCE_NAMES).join(', ')}`);
  console.log(`Custom sources loaded: ${customSources.length}`);
});
