const express = require('express');
const axios   = require('axios');
const cheerio = require('cheerio');

const app  = express();
const PORT = process.env.PORT || 3000;

app.get('/manifest.json', (_, res) => {
  res.json({
    id            : 'org.stremio.animefireplus',
    version       : '1.0.0',
    name          : 'AnimeFire+ PT-BR',
    description   : 'Episódios dublados/legendados PT-BR via animefire.plus',
    types         : ['series', 'movie'],
    catalogs      : [],
    resources     : ['stream'],
    idPrefixes    : ['animefire'],
    behaviorHints : { configRequired: false, configurable: false }
  });
});

app.get('/stream/:type/:id.json', async (req, res) => {
  const id   = req.params.id.replace('animefire:', '');
  const [slug, ep] = id.split('-ep-');
  const url  = `https://animefire.plus/animes/${slug}/episodio-${ep}`;

  try {
    const { data } = await axios.get(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    const $ = cheerio.load(data);
    const streams = [];

    // players internos do próprio AnimeFire
    $('video source').each((_, el) => {
      let src = $(el).attr('src');
      if (src && (src.includes('.m3u8') || src.includes('.mp4'))) {
        if (src.startsWith('//')) src = 'https:' + src;
        streams.push({
          name : 'AnimeFire+ (DUB/Leg PT-BR)',
          type : 'series',
          url  : src,
          title: `Ep ${ep} – player 1`
        });
      }
    });

    // links externos que contenham dublado / pt-br
    $('a[href*=".m3u8"], a[href*=".mp4"], iframe[src*=".m3u8"], iframe[src*=".mp4"]').each((_, el) => {
      let src = $(el).attr('href') || $(el).attr('src');
      if (!src) return;
      if (src.startsWith('//')) src = 'https:' + src;
      if (!src.startsWith('http')) return;

      // filtro simples de linguagem
      const pageText = $('body').text().toLowerCase();
      const langOk   = pageText.includes('dublado') || pageText.includes('pt-br') || pageText.includes('ptbr');

      if (langOk || true) { // retire o "|| true" se quiser filtro mais agressivo
        streams.push({
          name : 'AnimeFire+ (DUB/Leg PT-BR)',
          type : 'series',
          url  : src,
          title: `Ep ${ep} – player ${streams.length + 1}`
        });
      }
    });

    res.json({ streams });
  } catch (_) {
    res.json({ streams: [] });
  }
});

app.listen(PORT, () => console.log(`AnimeFire+ rodando na porta ${PORT}`));
