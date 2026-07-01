# Skill: Gerar e Validar Imagens com IA

> Skill para gerar imagens (posts, sites, aplicacoes, livros de colorir) e validar
> a qualidade com um juiz de visao gratuito, retornando score + diagnostico.

## Quando usar

- Gerar imagem editorial/capa para post de LinkedIn, blog, site.
- Gerar imagem para aplicacao (icone, ilustracao, conceito).
- Gerar line-art/livro de colorir.
- Validar se uma imagem gerada cumpre o prompt (gate de qualidade).
- Comparar modelos de imagem antes de escolher qual adotar.

## Modelos de geracao disponiveis

| Modelo | Fornecedor | ID API | Preco/img (USD) | Preco/img (BRL~) | Quando usar |
|---|---|---|---|---|---|
| GPT-Image-2 | OpenAI | `gpt-image-2` | ~$0.04 | ~R$0,22 | Qualidade maxima, texto perfeito. Custo alto. |
| GLM-Image | z.ai | `glm-image` | $0.015 | ~R$0,08 | Flagship z.ai, bom em texto/posters. Instavel (retry necessario). |
| GPT-Image-1-Mini | OpenAI | `gpt-image-1-mini` | ~$0.011 | ~R$0,06 | Opcao barata OpenAI. Bom para volume. |
| CogView-4 | z.ai | `cogView-4-250304` | $0.01 | ~R$0,05 | SO para line-art/colorir. Editorial: qualidade insuficiente. |

**Recomendacao default:** `gpt-image-1-mini` para volume diario (qualidade/custo).
**Para capa de post importante:** `gpt-image-2` (qualidade maxima).
**Para line-art de colorir:** `cogview-4` ou `gpt-image-1-mini`.

### Endpoints

**OpenAI** (`https://api.openai.com/v1/images/generations`):
```json
{ "model": "gpt-image-1-mini", "prompt": "...", "n": 1, "size": "1024x1024" }
```
- Resposta: `data[0].b64_json` (preferir) ou `data[0].url`.
- Para **editar/convertar imagem existente**: endpoint `/v1/images/edits` (multipart, campo `image` + `prompt`). Use `quality: "low"` + input 512px JPEG para economizar.

**z.ai** (`https://api.z.ai/api/paas/v4/images/generations`):
```json
{ "model": "glm-image", "prompt": "...", "size": "1024x1024" }
```
- Resposta: `data[0].url` (baixar a imagem).
- GLM-Image eh **instavel** (erro 500 StackOverflow): sempre implementar retry (3-4 tentativas com backoff).

### Prompt template (editorial para post)

```
A clean, modern editorial illustration for a tech LinkedIn post. Concept: "<TESE>".
Context for the model to understand the meaning: <CONTEXTO PARA O MODELO ENTENDER O SIGNIFICADO>.

Isometric 3D editorial style, corporate tech palette (deep navy background, teal and cyan accents, white),
with a warm amber accent for "noise/warning" elements, subtle grid background, professional, minimal,
high detail, square 1:1 composition, no watermark, no logos.

<DESCRICAO DA CENA COM SUJEITOS, ACOES, AMBIENTE>

Keep it to a maximum of 6 visual blocks: (1)..., (2)..., (3)..., (4)..., (5)..., (6)...
Generous white space; emphasize the OUTCOME, not just the thesis.

Do NOT include any office scene, business people in suits, meetings, sales charts, wireframe spheres,
or abstract beauty without meaning. Bold modern sans-serif text overlay reading exactly "<HEADLINE>",
centered and clearly legible, with correct Portuguese accents. Show ONLY this single headline — do NOT
add any other labels, captions, callouts or annotations. Keep it to a maximum of 6 visual blocks.
```

**Aprendidos (incorporar sempre):**
- Texto na imagem: PT-BR, com acentos, maiusculas nas palavras-chave.
- Figuras humanas estilizadas/acolhedoras (maos, mini-engenheiros, robos com carinha) funcionam.
- Max 6 blocos visuais (anti-clutter). O modelo tende a "ajudar" inventando rotulos — a regra anti-clutter e obrigatoria.
- Sempre enfatize o OUTCOME (resultado), nao so a tese.

## Juiz de visao (VALIDACAO GRATUITA)

### Modelo: `glm-4.6v-flash` (z.ai) — GRATUITO

- Input: $0 / Output: $0 por 1M tokens.
- Suporta imagem (vision) + texto.
- Endpoint: `https://api.z.ai/api/paas/v4/chat/completions`.
- Alternativa paga para casos dificeis: `glm-4.6v` ($0.3/$0.9 por 1M).

**IMPORTANTE — rate limit:** o flash gratuito pode retornar 429 ou resposta vazia em rajadas.
Sempre:
1. Retry ate 3x com backoff (2s, 5s, 10s).
2. Delay de 2s entre imagens consecutivas.
3. Se flash falhar repetidamente, cair para `glm-4.5v` ou `glm-4.6v` (pago, mais robusto).

### Rubric de validacao (JSON)

System prompt do juiz:
```
Voce e um juiz de qualidade de imagens editoriais para posts de LinkedIn. Analise a imagem
e responda APENAS com JSON valido no formato:
{"score": <0-10 inteiro>,
 "texto_legivel": <true/false>,
 "texto_lido": <string exata do texto que leu, ou null>,
 "texto_com_acento": <true/false>,
 "estilo_isometrico": <true/false>,
 "paleta_correta": <true/false>,
 "robo_fofo": <true/false>,
 "maos_humanas": <true/false>,
 "clutter_bloco_extra": <true/false>,
 "problemas": ["lista de problemas curtos"],
 "pontos_fortes": ["lista de pontos fortes curtos"]}
```

User prompt do juiz (adaptar ao caso):
```
Avalie esta imagem editorial para post LinkedIn sobre "<TEMA>".
Texto esperado: "<HEADLINE>" (com acentos).
Estilo esperado: isometrico 3D, navy+teal+amber, robo IA fofo, maos humanas, max 6 blocos.
```

Chamada (multimodal, imagem como data URL base64):
```json
{
  "model": "glm-4.6v-flash",
  "thinking": { "type": "disabled" },
  "max_tokens": 500,
  "messages": [
    { "role": "system", "content": "<rubric system>" },
    { "role": "user", "content": [
      { "type": "text", "text": "<user prompt>" },
      { "type": "image_url", "image_url": { "url": "data:image/png;base64,<B64>" } }
    ] }
  ]
}
```

### Gate (Definition of Done para imagem)

- `score >= 8` (de 10)
- `texto_legivel === true` (se a imagem tem texto)
- `texto_lido` corresponde ao esperado (incluindo acentos)
- `clutter_bloco_extra === false`
- `value_demonstrated` (pelo menos 1 ponto forte referindo ao OUTCOME/conceito, nao so estetica)

Se falhar: regerar com ate 2 variantes, escolher a melhor. Documentar scores.

## Workflow: comparativo de modelos (decisao de adocao)

Use quando for escolher qual modelo adotar para um proposito:

1. **Definir 1 prompt** editorial representativo do uso real (nao usar prompt generico).
2. **Gerar N=2 imagens** com cada modelo candidato (mesmo prompt, mesmo size).
3. **Renomear arquivos** com custo: `<modelo>-<n>_BRL<custo>.png`.
4. **Validar todas** com `glm-4.6v-flash` (gratuito) usando a rubric.
5. **Salvar em pasta propria**: `comparativo-modelos/<versao>/` com `comparativo.md`, `comparativo.json`, `validacao-juiz.md`, `validacao-juiz.json`.
6. **Abrir a pasta no Explorer** para o humano julgar lado a lado (juiz nao substitui olho humano).
7. **Decidir**: combinar score do juiz + custo + velocidade + preferencia visual.

**Cenario de economia (100 posts):**
- GPT-Image-2: ~$4,00 (R$22,00)
- GPT-Image-1-Mini: ~$1,10 (R$6,05) — **73% mais barato**
- GLM-Image: ~$1,50 (R$8,25) — **63% mais barato** (mas instavel)

## Exemplo de comparativo validado (2026-06-21)

Prompt: context engineering, isometrico 3D, "O contexto e o Produto!".
Juiz: glm-4.6v-flash (gratuito).

| Modelo | Preco/img BRL | Score juiz | Tempo medio | Tamanho medio |
|---|---|---|---|---|
| GLM-Image | R$0,08 | 9,0/10 | 46s (com retry) | ~93 KB |
| GPT-Image-1-Mini | R$0,06 | 9,0/10 | 32s | ~1,7 MB |
| GPT-Image-2 | R$0,22 | 9,0/10 | 64s | ~1,4 MB |

**Conclusao do comparativo:** os 3 empataram em score 9/10. O juiz gratuito leu o texto
com acento corretamente em todas as 6 imagens. Decisao final cabe ao humano (abrir lado a lado).
Para volume diario com qualidade: `gpt-image-1-mini` (rapido, barato, estavel).
Para capa de destaque: `gpt-image-2` (qualidade maxima).
GLM-Image: usar so se precisar de custo z.ai ou integrar com outros servicos da plataforma.

## Configuracao necessaria

Variaveis de ambiente (NUNCA commitar):
```
OPENAI_API_KEY=sk-proj-...
ZAI_API_KEY=...
```

Sem implementar em Node puro (sem dependencias), usar `fetch` global (Node >= 18).

## Pendencias / notas

- GLM-Image tem instabilidade recorrente (500 StackOverflowError) — retry obrigatorio.
- Custo real do GPT-Image-2 pode variar por complexidade (tokens de output).
- CogView-4 descartado para editorial — so serve para line-art/colorir.
- Para line-art de colorir, otimizar conversao: input 512px JPEG + `quality: "low"` (4x mais barato).
