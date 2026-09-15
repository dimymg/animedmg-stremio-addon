const express = require('express');
const { sources, createProvider, asMeta, approved } = require('./src/provider');
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
function createApp(provider = createProvider()) {
  const app = express();
  app.use((req,res,next) => { res.set('Access-Control-Allow-Origin','*'); res.set('Cache-Control','no-store'); if(req.method === 'OPTIONS') return res.sendStatus(204); next(); });
  app.get('/manifest.json', (_,res) => res.json({ id:'org.stremio.animedmg', version:'2.0.0', name:'AnimeDmg — revisão', description:'Catálogos de anime para revisão. Vídeos somente após liberação por título.', types:['series'], resources:['catalog','meta','stream'], idPrefixes:['animedmg:'], catalogs:sources.filter(s=>s.enabled).map(s=>({type:'series',id:s.id,name:s.name,extra:[{name:'search'},{name:'genre',options:['Dublado','Legendado','Dublado e legendado','Não informado']}] })) }));
  app.get(['/catalog/series/:source.json','/catalog/series/:source/:extra.json'], async(req,res,next) => {
    try { const extra = new URLSearchParams(req.params.extra || ''); const items = await provider.catalog(req.params.source,1,extra.get('search') || ''); res.json({metas:items.filter(i=>!extra.get('genre') || i.language === extra.get('genre')).map(asMeta)}); } catch(e){next(e);}
  });
  app.get('/meta/series/:id.json', async(req,res,next) => {
    try { const detail = await provider.detail(req.params.id); if(!detail) return res.status(404).json({meta:null}); const meta = asMeta(detail.item); res.json({meta:{...meta,description:[meta.description,detail.description].filter(Boolean).join('\n\n'),videos:detail.episodes.map(({pageUrl,...ep})=>ep)}}); } catch(e){next(e);}
  });
  app.get('/stream/series/:id.json', async(req,res,next) => { try {res.json({streams:await provider.streams(req.params.id)});}catch(e){next(e);} });
  app.get(['/', '/review', '/review.json'], async(req,res,next) => {
    try {
      const source = String(req.query.source || sources.find(s=>s.enabled)?.id || '');
      const page = Math.min(1000,Math.max(1,Number.parseInt(req.query.page,10)||1));
      const query = String(req.query.q || '').slice(0,200);
      const found = await provider.catalog(source,page,query);
      const items = found.map(i=>({...i,status:approved(i)?'Liberado':'Pendente'}));
      if(req.path === '/review.json') return res.json({source,page,items});
      res.set('Content-Security-Policy', "default-src 'none'; img-src https:; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'");
      res.send(`<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Revisão AnimeDmg</title><style>body{font:16px system-ui;max-width:1100px;margin:30px auto;padding:16px;color:#172330;background:#fafafa}td,th{padding:12px;border-bottom:1px solid #ddd;text-align:left}img{width:65px}code{overflow-wrap:anywhere}table{width:100%}input,select,button{padding:10px;margin:5px}a{color:#0659a5}</style><h1>Revisão de conteúdos</h1><p>Consulte os títulos e suas páginas. A reprodução fica bloqueada até você registrar a autorização de cada título. A presença no site não comprova direitos de uso.</p><form><select name="source">${sources.filter(s=>s.enabled).map(s=>`<option value="${escape(s.id)}" ${s.id===source?'selected':''}>${escape(s.name)}</option>`).join('')}</select><input name="q" placeholder="Buscar título" value="${escape(query)}"><button>Consultar</button></form><p>Fonte: ${escape(source)} · Página ${page}${query?' · Busca (primeira página)':''}</p><table><thead><tr><th>Capa</th><th>Título e identificador</th><th>Idioma</th><th>Reprodução</th></tr></thead><tbody>${items.map(i=>`<tr><td>${i.poster?`<img loading="lazy" src="${escape(i.poster)}" alt="">`:''}</td><td><a href="${escape(i.pageUrl)}" target="_blank" rel="noopener noreferrer">${escape(i.name)}</a><br><code>${escape(i.id)}</code></td><td>${escape(i.language)}</td><td>${i.status}</td></tr>`).join('')}</tbody></table>${!query?`<p><a href="?source=${encodeURIComponent(source)}&page=${Math.max(1,page-1)}">Anterior</a> · <a href="?source=${encodeURIComponent(source)}&page=${page+1}">Próxima página</a></p>`:''}<p><a href="/review.json?source=${encodeURIComponent(source)}&page=${page}&q=${encodeURIComponent(query)}">Ver dados JSON</a> · <a href="/manifest.json">Manifesto Stremio</a></p></html>`);
    } catch(e){next(e);}
  });
  app.use((err,req,res,next)=>res.status(502).json({error:'Falha ao consultar a fonte',detail:err.message}));
  return app;
}
if(require.main === module) createApp().listen(process.env.PORT || 3000, process.env.HOST || '127.0.0.1',()=>console.log(`Revisão: http://127.0.0.1:${process.env.PORT||3000}/review`));
module.exports = {createApp};
