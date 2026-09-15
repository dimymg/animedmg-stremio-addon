const cheerio = require('cheerio');
const crypto = require('node:crypto');
const { isIP } = require('node:net');
const sources = require('../config/sources.json');
const approvals = require('../config/approvals.json');
const cache = new Map();
const PAGE_SIZE = 20;
const idFor = (source, url) => `animedmg:${source.id}:${crypto.createHash('sha256').update(url).digest('hex').slice(0, 24)}`;
function safeUrl(raw, base) {
  try {
    if (typeof raw !== 'string' || !raw.trim()) return null;
    const u = new URL(raw, base);
    if (u.protocol !== 'https:' || u.username || u.password || u.port || isIP(u.hostname) || u.hostname.includes(':') || !u.hostname.includes('.') || /\.(local|localhost|internal)$/.test(u.hostname)) return null;
    u.hash = '';
    return u.href;
  } catch { return null; }
}
function sourceUrl(raw, source, base = source.baseUrl) {
  const url = safeUrl(raw, base);
  return url && source.allowedHosts.includes(new URL(url).hostname) ? url : null;
}
async function fetchPage(raw, source, redirects = 0) {
  const url = sourceUrl(raw, source);
  if (!url) throw new Error('Domínio da página não está na configuração da fonte');
  const hit = cache.get(url);
  if (hit && hit.expires > Date.now()) return hit.value;
  const response = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(12000), headers: { 'User-Agent': 'AnimeDmg/2.0 (metadata review)' } });
  if (response.status >= 300 && response.status < 400) {
    const next = sourceUrl(response.headers.get('location'), source, url);
    if (!next || redirects >= 3) throw new Error('Redirecionamento fora dos domínios configurados');
    return fetchPage(next, source, redirects + 1);
  }
  if (!response.ok) throw new Error(`Fonte respondeu HTTP ${response.status}`);
  if (!response.headers.get('content-type')?.includes('text/html')) throw new Error('A fonte não retornou HTML');
  let size = 0; const chunks = [];
  for await (const chunk of response.body) {
    size += chunk.length;
    if (size > 3_000_000) throw new Error('Página excedeu 3 MB');
    chunks.push(chunk);
  }
  const value = { html: Buffer.concat(chunks).toString('utf8'), url };
  if (cache.size >= 100) cache.delete(cache.keys().next().value);
  cache.set(url, { value, expires: Date.now() + 600000 });
  return value;
}
function language(text) {
  const dub = /dublad[oa]|\bpt-br\b/i.test(text), sub = /legendad[oa]/i.test(text);
  return dub && sub ? 'Dublado e legendado' : dub ? 'Dublado' : sub ? 'Legendado' : 'Não informado';
}
function parseCatalog(html, source, pageUrl) {
  const $ = cheerio.load(html), items = new Map();
  $(source.cards).each((_, el) => {
    const card = $(el), anchor = card.find(source.link).first();
    const url = sourceUrl(anchor.attr('href'), source, pageUrl);
    if (!url || !new RegExp(source.seriesPath).test(new URL(url).pathname)) return;
    const name = (card.find(source.title).first().text() || card.find('img').attr('alt') || anchor.text()).replace(/\s+/g, ' ').replace(/\s*Todos os Epis[oó]dios Online.*$/i, '').trim();
    if (!name) return;
    const id = idFor(source, url);
    items.set(id, { id, type: 'series', name, pageUrl: url, source: source.id, language: language(card.text()), poster: safeUrl(card.find('img').attr('data-src') || card.find('img').attr('src'), pageUrl) || undefined });
  });
  return [...items.values()];
}
function approved(item, records = approvals) {
  const entry = records[item.id];
  return !!(entry && entry.status === 'approved' && entry.pageUrl === item.pageUrl && typeof entry.evidence === 'string' && entry.evidence.trim() && Date.parse(entry.expiresAt) > Date.now());
}
function asMeta(item) {
  return { id: item.id, type: 'series', name: item.name, poster: item.poster, posterShape: 'poster', genres: [item.language], description: `Fonte: ${item.source}. Idioma: ${item.language}. ${approved(item) ? 'Reprodução liberada pelo responsável.' : 'Em revisão — reprodução ainda não liberada.'}` };
}
function parseDetail(html, item, source, pageUrl) {
  const $ = cheerio.load(html), episodes = new Map();
  $(source.episodes).each((_, el) => {
    const a = $(el), url = sourceUrl(a.attr('href'), source, pageUrl);
    if (!url || !new RegExp(source.episodePath).test(new URL(url).pathname)) return;
    const text = a.text().trim();
    const episode = Number((text.match(/(?:epis[oó]dio|ep)\s*[-:]?\s*(\d+)/i) || text.match(/^(\d+)$/) || new URL(url).pathname.match(/(?:episodio-|\/)(\d+)\/?$/))?.[1]);
    if (!Number.isInteger(episode) || episode < 0) return;
    const season = Number(a.closest('[data-season]').attr('data-season')) || 1;
    episodes.set(url, { id: `${item.id}:ep:${crypto.createHash('sha256').update(url).digest('hex').slice(0, 16)}`, title: text || `Episódio ${episode}`, season, episode, pageUrl: url });
  });
  return { description: $(source.description).first().text().trim().slice(0, 2000), language: language(item.name + ' ' + $(source.genres).text()), episodes: [...episodes.values()].sort((a,b) => a.season - b.season || a.episode - b.episode) };
}
function parseStreams(html, base, hosts) {
  const $ = cheerio.load(html), urls = new Set();
  $('video[src], video source[src], a[href], iframe[src]').each((_, el) => {
    const url = safeUrl($(el).attr('src') || $(el).attr('href'), base);
    if (url && /\.(mp4|m3u8)(?:\?|$)/i.test(url) && hosts.includes(new URL(url).hostname)) urls.add(url);
  });
  return [...urls].map(url => ({ name: 'AnimeDmg', url, behaviorHints: { notWebReady: !/\.mp4(?:\?|$)/i.test(url) } }));
}
function createProvider({ getPage = fetchPage, configuredSources = sources, records = approvals } = {}) {
  const items = new Map();
  async function catalog(sourceId, page = 1, query = '') {
    const source = configuredSources.find(s => s.id === sourceId && s.enabled);
    if (!source) throw new Error('Fonte não encontrada ou desativada');
    const path = query ? source.searchPath.replace('{query}', encodeURIComponent(query)) : page === 1 ? source.catalogPath : source.pagePath.replace('{page}', page);
    const result = await getPage(new URL(path, source.baseUrl).href, source);
    const found = parseCatalog(result.html, source, result.url);
    if (!found.length) throw new Error('Nenhum título encontrado nesta página; verifique a fonte e os seletores');
    for (const item of found) items.set(item.id, item);
    while (items.size > 5000) items.delete(items.keys().next().value);
    return found;
  }
  function find(id) {
    if (items.has(id)) return items.get(id);
    const entry = records[id];
    const source = configuredSources.find(s => s.enabled && s.id === id.split(':')[1]);
    if (entry && source && sourceUrl(entry.pageUrl, source) && idFor(source, entry.pageUrl) === id) return { id, pageUrl: entry.pageUrl, source: source.id, name: entry.name || id, language: 'Não informado' };
    return null;
  }
  async function detail(id) {
    const item = find(id);
    if (!item) return null;
    const source = configuredSources.find(s => s.enabled && s.id === item.source);
    if (!source) return null;
    const result = await getPage(item.pageUrl, source);
    return { item, source, ...parseDetail(result.html, item, source, result.url) };
  }
  async function streams(id) {
    const parentId = id.split(':ep:')[0], item = find(parentId);
    // Check approval before any episode request. No source-wide approval switch.
    if (!item || !approved(item, records)) return [];
    const info = await detail(parentId), ep = info?.episodes.find(e => e.id === id);
    if (!ep) return [];
    const result = await getPage(ep.pageUrl, info.source);
    const hosts = records[parentId].mediaHosts || [];
    return parseStreams(result.html, result.url, hosts);
  }
  return { catalog, detail, streams };
}
module.exports = { sources, PAGE_SIZE, safeUrl, sourceUrl, fetchPage, language, idFor, parseCatalog, parseDetail, parseStreams, approved, asMeta, createProvider };
