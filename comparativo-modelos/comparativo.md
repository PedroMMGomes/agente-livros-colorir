# Comparativo EDITORIAL — modelos de imagem para post LinkedIn (nivel agente-postagens-2)

**Data:** 2026-06-21T15:47:42.481Z
**Imagens por modelo:** 2
**Pasta:** `comparativo-modelos/`

## Conceito testado

Context Engineering — mesmo prompt do post #02 do agente-postagens-2.
Isometric 3D, deep navy + teal/cyan + amber, robo IA fofo, maos humanas, texto "O CONTEXTO E O PRODUTO".

## Resultados

| Modelo | Fornecedor | Preco/img (USD) | Arquivo | Tamanho | Tempo | Status |
|---|---|---|---|---|---|---|
| GLM-Image | z.ai | $0.015 | glm-image-1.png | 0 KB | 1.2s | ERRO: z.ai: sem url: {"error":{"message":"Handler dispatch failed; |
| GLM-Image | z.ai | $0.015 | glm-image-2.png | 88 KB | 36s | OK |
| CogView-4 | z.ai | $0.010 | cogView-4-250304-1.png | 105 KB | 14.1s | OK |
| CogView-4 | z.ai | $0.010 | cogView-4-250304-2.png | 104 KB | 14.2s | OK |
| GPT-Image-1-Mini | openai | $0.011 | gpt-image-1-mini-1.png | 1827 KB | 33.3s | OK |
| GPT-Image-1-Mini | openai | $0.011 | gpt-image-1-mini-2.png | 1638 KB | 31.8s | OK |
| GPT-Image-2 (referencia cara) | openai | $0.040 | gpt-image-2-1.png | 1363 KB | 64.1s | OK |
| GPT-Image-2 (referencia cara) | openai | $0.040 | gpt-image-2-2.png | 1345 KB | 64.7s | OK |

## Resumo de custos (estimado)

| Modelo | Preco por imagem | Custo total (x2) | Relativo ao GPT-Image-2 |
|---|---|---|---|
| GLM-Image | $0.015 | $0.0150 (1 ok) | 38% |
| CogView-4 | $0.010 | $0.0200 (2 ok) | 25% |
| GPT-Image-1-Mini | $0.011 | $0.0220 (2 ok) | 27% |
| GPT-Image-2 (referencia cara) | $0.040 | $0.0800 (2 ok) | 100% |

## Critérios de avaliacao (abra as imagens lado a lado)

1. **Fidelidade ao prompt isometrico 3D** — manteve o estilo isometrico? Navy + teal + amber?
2. **Qualidade do robo IA fofo** — esfera ciano com carinha sorridente?
3. **Texto na imagem** — "O CONTEXTO E O PRODUTO" legivel e correto?
4. **Maos humanas acolhedoras** — estilizadas, nao corporate?
5. **Anti-clutter** — max 6 blocos visuais, sem rotulos extras?
6. **Nivel de detalhe/qualidade** — comparavel ao GPT-Image-2 (referencia)?

## Cenarios de uso

- **Se GLM-Image ou CogView-4 ficarem bons**: usar como Tier 0 do agente-postagens-2, economizando 75-90% vs GPT-Image-2.
- **GPT-Image-1-Mini**: opcao barata da OpenAI (~$0.011), ja testada.
- **GPT-Image-2**: referencia de qualidade maxima ($0.04), o que o agente usa hoje.
