# AnimeDmg — catálogo e revisão

Addon Stremio com fontes configuráveis, busca, capas, episódios e revisão por título. Usa a divisão `catalog`, `meta`, `stream` do projeto `dimymg/stremio-catalogo-legal`, adaptada a séries.

## Executar e revisar

Requer Node.js 20.18.1 ou superior.

```sh
npm ci
npm test
npm start
```

Abra **http://127.0.0.1:3000/review**. Escolha a fonte, consulte os títulos, avance pelas páginas e abra o link de cada obra. A tela mostra a situação da reprodução e o identificador para configuração. `/review.json` oferece os mesmos dados em JSON, com parâmetros `source`, `page` e `q`.

No Stremio, instale **http://127.0.0.1:3000/manifest.json**. Este é um catálogo de revisão: mostra metadados pendentes, mas nenhum vídeo é liberado por padrão. Não o distribua como catálogo final antes de concluir a revisão.

## Fontes

Edite **config/sources.json**. As duas fontes iniciais são:

- **AnimesOnlineCC**: catálogo `/anime/`, páginas seguintes e busca do site. Extração de metadados verificada em setembro de 2026.
- **AnimeFire**: endereço original `animefire.plus`, com redirecionamento permitido para `animefire.io`. A página atual não retornou títulos reconhecíveis no teste. Adaptador inicial cadastrado, mas integração ainda não validada. A consulta exibe erro explícito; ajuste seletores/rotas quando houver páginas disponíveis.

Para adicionar outra fonte, copie um objeto, use um `id` novo e ajuste `baseUrl`, `allowedHosts`, as rotas e os seletores CSS. `seriesPath` e `episodePath` são expressões regulares para os caminhos aceitos. `enabled: false` desativa a fonte. Não basta trocar somente a URL: cada site pode usar HTML diferente. Somente páginas nos hosts configurados são consultadas; não há execução de JavaScript, passagem por CAPTCHA ou login.

O Stremio mostra a primeira página de cada fonte e permite busca. A revisão no navegador permite navegar pelas páginas do site; a busca retorna sua primeira página. O filtro de idioma usa apenas o texto do cartão: dados ausentes ficam como **Não informado**, sem inferir idioma pela navegação do site. Temporadas sem indicação explícita no HTML usam 1. O cache de páginas dura 10 minutos e tem limite de 100 páginas. Itens não aprovados precisam ser consultados no catálogo após reiniciar o servidor para abrir seus detalhes.

## Liberar reprodução após revisão

Ver o conteúdo não comprova autorização. Registre a evidência obtida do titular/distribuidor e o prazo aplicável antes de liberar a obra. Este sistema registra sua decisão; não verifica licenças automaticamente.

Edite **config/approvals.json**, inicialmente vazio, usando o ID e a URL exatos mostrados na revisão:

```json
{
  "animedmg:fonte:ID_COPIADO_DA_REVISAO": {
    "name": "Título revisado",
    "pageUrl": "https://site.example/anime/titulo/",
    "status": "approved",
    "evidence": "Referência à autorização e ao escopo permitido",
    "expiresAt": "2026-12-31T23:59:59Z",
    "mediaHosts": ["midia.example"]
  }
}
```

Não coloque documentos privados, credenciais ou tokens no repositório; use uma referência à evidência. A aprovação vale para os episódios desse título. Reinicie o processo após mudar a configuração. Para revogar, remova a entrada ou mude `status` para `pending` e reinicie. IDs antigos `animefire:...` não são mais aceitos, impedindo que a rota anterior contorne a revisão.

A reprodução exige aprovação vigente, URL da obra correspondente e domínio de mídia listado em `mediaHosts`. O extrator suporta apenas links MP4/M3U8 visíveis no HTML (`video`, `source`, links e iframes diretamente apontando para mídia). Players externos em HTML, APIs particulares ou páginas dependentes de JavaScript exigem um adaptador adicional. O addon não baixa nem retransmite vídeos, e não contorna DRM. Os testes usam mídia fictícia; a reprodução real dos dois sites não foi validada nem liberada.

## Hospedagem

O servidor escuta somente em `127.0.0.1` por padrão. Para executar em hospedagem Node, configure `HOST=0.0.0.0` e a porta `PORT` fornecida pelo serviço. A URL de instalação será `https://seu-dominio/manifest.json`. Esta versão não foi publicada e ainda não inclui uma função Supabase; a função de IPTV usa Deno e precisa ser adaptada ao extrator HTML antes de um deploy lá.
