const express = require('express');
const cors = require('cors');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = 3456;
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
  return { title, id: parseInt(id), cover, episodes, synopsis: synopsis.substring(0, 2000), score, genres, source: 'bgm.tv', url: `https://bgm.tv/subject/${id}` };
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
    source: 'myanimelist.net',
    url: item.url || `https://myanimelist.net/anime/${item.mal_id}/`,
  }));
}

// ========== AniList Parser ==========

async function searchAnilist(query) {
  const gql = `query($q:String){Page(perPage:6){media(search:$q,type:ANIME){id title{romaji english native}episodes description genres coverImage{large}siteUrl averageScore}}}`;
  const resp = await fetch('https://graphql.anilist.co', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: gql, variables: { q: query } }),
    signal: AbortSignal.timeout(10000),
  });
  const json = await resp.json();
  return ((json.data?.Page?.media) || []).map(m => ({
    title: m.title.english || m.title.romaji || m.title.native || '',
    id: m.id, episodes: m.episodes || 0,
    cover: m.coverImage?.large || '',
    score: m.averageScore ? m.averageScore / 10 : null,
    synopsis: (m.description || '').replace(/<[^>]*>/g, '').substring(0, 2000),
    genres: m.genres || [], source: 'anilist.co',
    url: m.siteUrl || `https://anilist.co/anime/${m.id}/`,
  }));
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
  'anilist.co': searchAnilist,
};

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
      source: 'myanimelist.net', url: item.url || `https://myanimelist.net/anime/${item.mal_id}/`,
    };
  },
  'anilist': async (id) => {
    const gql = `query($id:Int){Media(id:$id,type:ANIME){id title{romaji english native}episodes description genres coverImage{large}siteUrl averageScore}}`;
    const resp = await fetch('https://graphql.anilist.co', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: gql, variables: { id } }),
      signal: AbortSignal.timeout(10000),
    });
    const json = await resp.json();
    const m = json.data?.Media;
    if (!m) return null;
    return {
      title: m.title.english || m.title.romaji || m.title.native || '',
      id: m.id, episodes: m.episodes || 0,
      cover: m.coverImage?.large || '',
      score: m.averageScore ? m.averageScore / 10 : null,
      synopsis: (m.description || '').replace(/<[^>]*>/g, '').substring(0, 2000),
      genres: m.genres || [], source: 'anilist.co',
      url: m.siteUrl || `https://anilist.co/anime/${m.id}/`,
    };
  },
};

// ========== API Routes ==========

// GET /api/sources — list all sources (built-in + custom)
app.get('/api/sources', (_req, res) => {
  const builtIn = Object.keys(SOURCE_NAMES).map(key => ({
    key,
    name: SOURCE_NAMES[key],
    type: 'builtin',
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

  if (!q) return res.json({ results: [] });

  const allResults = [];
  const promises = [];

  // Built-in sources
  for (const key of sourceKeys) {
    if (SEARCH_FUNCTIONS[key]) {
      promises.push(
        SEARCH_FUNCTIONS[key](q).then(r => { allResults.push(...r); }).catch(e => console.error(`[${key}]`, e.message))
      );
    }
  }

  // Custom sources
  for (const cs of customSources) {
    if (sourceKeys.includes(cs.id)) {
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
    } else if (site === 'anilist') {
      const m = url.match(/anime\/(\d+)/);
      if (m) data = await PARSE_FUNCTIONS['anilist'](parseInt(m[1]));
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
      } else if (site === 'anilist') {
        const m = url.match(/anime\/(\d+)/);
        if (m) data = await PARSE_FUNCTIONS['anilist'](parseInt(m[1]));
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

app.delete('/api/custom-sources/:id', (req, res) => {
  const idx = customSources.findIndex(s => s.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: '来源不存在' });
  customSources.splice(idx, 1);
  saveCustomSources(customSources);
  res.json({ ok: true });
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

app.listen(PORT, () => {
  console.log(`Anime tracker backend running at http://localhost:${PORT}`);
  console.log(`Built-in sources: ${Object.keys(SOURCE_NAMES).join(', ')}`);
  console.log(`Custom sources loaded: ${customSources.length}`);
});
