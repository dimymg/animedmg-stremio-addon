const {test} = require('node:test');
const assert = require('node:assert/strict');
const {sources,parseCatalog,parseDetail,parseStreams,approved,createProvider,sourceUrl,language} = require('../src/provider');
const {createApp} = require('../index');
const source = sources[0];
const html = `<nav>Dublado Legendado</nav><article class="tvshows"><a href="/anime/exemplo/"><img src="/cover.jpg"></a><h3>Exemplo Legendado</h3></article><article class="tvshows"><a href="https://evil.example/anime/x/">Externo</a></article>`;
const item = parseCatalog(html,source,source.baseUrl)[0];
const detail = '<div class="episodiotitle"><a href="/episodio/exemplo-episodio-2/">Episodio 2</a><a href="/episodio/exemplo-episodio-1/">Episodio 1</a></div>';
test('catalog normalizes images, ignores external pages and navigation language',()=>{
 assert.equal(parseCatalog(html,source,source.baseUrl).length,1);
 assert.equal(item.language,'Legendado'); assert.equal(item.poster,'https://animesonlinecc.to/cover.jpg');
 assert.equal(language('Sem indicação'),'Não informado'); assert.equal(sourceUrl('http://127.0.0.1',source),null);
});
test('episodes are sorted and IDs remain stable',()=>{
 const found=parseDetail(detail,item,source,item.pageUrl).episodes;
 assert.deepEqual(found.map(e=>e.episode),[1,2]);
 assert.deepEqual(found,parseDetail(detail,item,source,item.pageUrl).episodes);
});
test('approval requires exact page, evidence and a future expiry',()=>{
 const entry={status:'approved',pageUrl:item.pageUrl,evidence:'Autorização registrada',expiresAt:'2099-01-01'};
 assert.equal(approved(item,{[item.id]:entry}),true);
 for(const change of [{evidence:''},{pageUrl:'https://other.example/'},{expiresAt:'2000-01-01'},{status:'pending'}]) assert.equal(approved(item,{[item.id]:{...entry,...change}}),false);
});
test('unapproved stream makes no network requests even with crafted episode ID',async()=>{
 let calls=0;const provider=createProvider({getPage:async url=>{calls++;return {html,url}},records:{}});
 await provider.catalog(source.id);const before=calls;
 assert.deepEqual(await provider.streams(item.id+':ep:invented'),[]);assert.equal(calls,before);
});
test('approved title resolves only its own episode and allowed direct media',async()=>{
 const records={[item.id]:{status:'approved',pageUrl:item.pageUrl,evidence:'Teste',expiresAt:'2099-01-01',mediaHosts:['media.example']}};
 const provider=createProvider({records,getPage:async url=>({url,html:url.includes('/episodio/')?'<video src="https://media.example/a.mp4"></video>':detail})});
 const info=await provider.detail(item.id);
 assert.equal((await provider.streams(info.episodes[0].id))[0].url,'https://media.example/a.mp4');
 assert.deepEqual(await provider.streams(item.id+':ep:invented'),[]);
});
test('media parsing deduplicates and refuses unlisted hosts and HTML players',()=>{
 const streams=parseStreams('<video src="//media.example/a.m3u8"></video><source src="https://bad.example/a.mp4"><iframe src="https://media.example/player"></iframe><a href="https://media.example/a.m3u8">x</a>',source.baseUrl,['media.example']);
 assert.equal(streams.length,1);assert.equal(streams[0].behaviorHints.notWebReady,true);
});
test('HTTP manifest, catalog, encoded IDs, review and blocked playback',async t=>{
 const provider=createProvider({getPage:async url=>({url,html:url.includes('/anime/exemplo/')?detail:html})});
 const server=createApp(provider).listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(()=>server.close());
 const base=`http://127.0.0.1:${server.address().port}`;
 assert.equal((await (await fetch(base+'/manifest.json')).json()).resources.length,3);
 const catalog=await (await fetch(base+'/catalog/series/animesonlinecc.json')).json(); assert.equal(catalog.metas.length,1);
 const meta=await (await fetch(base+'/meta/series/'+encodeURIComponent(item.id)+'.json')).json();assert.equal(meta.meta.videos.length,2);
 assert.deepEqual(await (await fetch(base+'/stream/series/'+encodeURIComponent(meta.meta.videos[0].id)+'.json')).json(),{streams:[]});
 assert.match(await (await fetch(base+'/review')).text(),/Pendente/);
});
