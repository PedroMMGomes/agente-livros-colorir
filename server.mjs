#!/usr/bin/env node
// Agente Livros de Colorir
// Modo 1 (do zero):     GLM planeja cenas -> OpenAI gera line-art
// Modo 2 (de imagens):  usuario envia imagens/pasta -> OpenAI edits converte para line-art
// UI: http://localhost:4567 | Duplo-clique em iniciar.bat
import { createServer } from "node:http";
import { readFileSync, writeFileSync, mkdirSync, existsSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 4567;
const LIVROS_ROOT = join(__dirname, "livros");
const PUBLIC_DIR = join(__dirname, "public");

// ---------- carrega .env manualmente (zero dependencias) ----------
function loadEnv() {
  const envPath = join(__dirname, ".env");
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i < 1) continue;
    const k = t.slice(0, i).trim();
    const v = t.slice(i + 1).trim().replace(/^"|"$/g, "");
    if (!process.env[k]) process.env[k] = v;
  }
}
loadEnv();

const OPENAI_KEY = process.env.OPENAI_API_KEY;
const ZAI_KEY = process.env.ZAI_API_KEY;
const IMG_MODEL = process.env.OPENAI_IMAGE_MODEL || "gpt-image-1-mini";
const GLM_MODEL = process.env.GLM_MODEL || "glm-4.5-flash";
const CONCURRENCY = Math.min(Math.max(parseInt(process.env.CONCURRENCY || "10", 10), 1), 20);

if (!OPENAI_KEY || !ZAI_KEY) {
  console.error("\n[ERRO] Chaves faltando no .env:");
  if (!OPENAI_KEY) console.error("  - OPENAI_API_KEY");
  if (!ZAI_KEY) console.error("  - ZAI_API_KEY");
  console.error("Edite C:\\1Repos\\agente-livros-colorir\\.env e reinicie.\n");
  process.exit(1);
}

mkdirSync(LIVROS_ROOT, { recursive: true });

// ---------- prompts editaveis (plano + conversao) ----------
const DEFAULT_PROMPT_PLANO = `Voce e um diretor criativo de livros de colorir para criancas de 3 a 10 anos. Sua tarefa: dado um tema e uma quantidade, criar um plano de cenas variadas, criativas e divertidas para colorir. Cada cena deve ser unica (sem repetir conceitos), com elementos claros e reconhaveis que uma crianca possa colorir (animais, plantas, objetos, personagens simpaticos). Evite cenas muito complexas ou abstratas. Variar entre close-ups, cenas panoramicas, personagens interagindo, ambientes diferentes.

Responda APENAS com JSON valido, sem markdown, sem texto antes ou depois, no formato:
{"titulo":"nome bonito do livro em portugues","cenas":[{"nome":"nome-curto-da-cena","descricao":"descricao detalhada em INGLES da cena para um gerador de imagem, focando em elementos visuais concretos: sujeitos, acoes, ambiente, objetos. Estilo line-art para colorir."}]}`;

const DEFAULT_PROMPT_CONVERSAO = `Convert this image into a black and white coloring book page for a young child. Pure white background. Bold thick clean black outlines only, no color, no fill, no shading, no gradients, no gray tones. Simplify the details so a child can color it with crayons. Keep the main subjects and composition clearly recognizable. Clean and friendly. Square 1:1. No text, no watermark, no logos.`;

const PROMPTS = {
  plano: { file: join(__dirname, "prompt-plano.txt"), default: DEFAULT_PROMPT_PLANO, value: "" },
  conversao: { file: join(__dirname, "prompt-conversao.txt"), default: DEFAULT_PROMPT_CONVERSAO, value: "" },
};
for (const k of Object.keys(PROMPTS)) {
  const p = PROMPTS[k];
  if (existsSync(p.file)) { try { p.value = readFileSync(p.file, "utf8"); } catch { p.value = p.default; } }
  else p.value = p.default;
}
function getPrompt(tipo) { return PROMPTS[tipo] ? PROMPTS[tipo] : PROMPTS.plano; }

// ---------- utilidades ----------
function sanitize(name) {
  return String(name)
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9 _-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .toLowerCase()
    .slice(0, 50) || "livro";
}
function timestamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`;
}
function pad(n, len) { return String(n).padStart(len, "0"); }

// ---------- GLM: planeja as cenas (modo do zero) ----------
async function planejarCenas(tema, quantidade) {
  const user = `Tema do livro: "${tema}"
Quantidade de cenas: ${quantidade}

Crie ${quantidade} cenas criativas e variadas sobre esse tema. Cada descricao em ingles deve ser especifica o suficiente para gerar uma imagem de colorir clara e amigavel para crianca.`;

  const r = await fetch("https://api.z.ai/api/paas/v4/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${ZAI_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: GLM_MODEL,
      thinking: { type: "disabled" },
      messages: [
        { role: "system", content: PROMPTS.plano.value },
        { role: "user", content: user },
      ],
      temperature: 0.9,
      max_tokens: 4096,
      response_format: { type: "json_object" },
    }),
  });
  if (!r.ok) { const t = await r.text().catch(() => ""); throw new Error(`GLM HTTP ${r.status}: ${t.slice(0, 300)}`); }
  const j = await r.json();
  const raw = j?.choices?.[0]?.message?.content || "";
  const m = raw.match(/\{[\s\S]*\}/);
  if (!m) throw new Error("GLM nao retornou JSON: " + raw.slice(0, 200));
  const plano = JSON.parse(m[0]);
  if (!plano.cenas || !Array.isArray(plano.cenas) || !plano.cenas.length) {
    throw new Error("GLM retornou JSON sem cenas: " + raw.slice(0, 200));
  }
  return plano;
}

// ---------- fetch com retry em 429 ----------
async function fetchWithRetry(url, opts, maxRetries = 3) {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const r = await fetch(url, opts);
    if (r.ok) return r;
    if (r.status === 429 && attempt < maxRetries) {
      await new Promise((res) => setTimeout(res, Math.min(1000 * 2 ** attempt, 8000)));
      continue;
    }
    return r;
  }
}

// ---------- OpenAI: gera line-art do zero (text -> image) ----------
async function gerarImagemDoZero(descricaoCena, outPath) {
  const prompt = `Black and white line art for a childrens coloring book. Pure white background. Bold thick clean black outlines only, no color, no fill, no shading, no gradients, no gray tones. Friendly simple composition suitable for a young child to color with crayons. ${descricaoCena}. Square 1:1. No text, no watermark, no logos.`;
  const r = await fetchWithRetry("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: { Authorization: `Bearer ${OPENAI_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: IMG_MODEL, prompt, n: 1, size: "1024x1024" }),
  });
  if (!r.ok) { const t = await r.text().catch(() => ""); throw new Error(`OpenAI HTTP ${r.status}: ${t.slice(0, 300)}`); }
  return salvarResposta(r, outPath);
}

// ---------- multipart builder (para /images/edits) ----------
function buildMultipart(fields, files) {
  const boundary = "----ColorirMagico" + Math.random().toString(16).slice(2);
  const parts = [];
  for (const [name, value] of Object.entries(fields)) {
    parts.push(Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`, "utf8"));
  }
  for (const [name, file] of Object.entries(files)) {
    parts.push(Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="${name}"; filename="${file.filename}"\r\nContent-Type: ${file.contentType}\r\n\r\n`, "utf8"));
    parts.push(file.data);
    parts.push(Buffer.from("\r\n", "utf8"));
  }
  parts.push(Buffer.from(`--${boundary}--\r\n`, "utf8"));
  return { body: Buffer.concat(parts), contentType: `multipart/form-data; boundary=${boundary}` };
}

// ---------- OpenAI: converte imagem existente em line-art (image edit) ----------
// quality: "low" | "medium" | "high" | "auto" (default "low" para economia)
async function gerarDeImagem(imageBuffer, mime, outPath, quality = "low") {
  const ext = mime.includes("png") ? "png" : (mime.includes("jpeg") || mime.includes("jpg")) ? "jpg" : "png";
  const ct = mime.includes("png") ? "image/png" : "image/jpeg";
  const { body, contentType } = buildMultipart(
    { model: IMG_MODEL, prompt: PROMPTS.conversao.value, n: "1", size: "1024x1024", quality },
    { image: { filename: `input.${ext}`, contentType: ct, data: imageBuffer } }
  );
  const r = await fetchWithRetry("https://api.openai.com/v1/images/edits", {
    method: "POST",
    headers: { Authorization: `Bearer ${OPENAI_KEY}`, "Content-Type": contentType },
    body,
  });
  if (!r.ok) { const t = await r.text().catch(() => ""); throw new Error(`OpenAI HTTP ${r.status}: ${t.slice(0, 300)}`); }
  return salvarResposta(r, outPath);
}

async function salvarResposta(r, outPath) {
  const j = await r.json();
  const it = j?.data?.[0];
  if (!it) throw new Error("OpenAI: resposta sem data");
  let buf;
  if (it.b64_json) buf = Buffer.from(it.b64_json, "base64");
  else if (it.url) { const d = await fetch(it.url); buf = Buffer.from(await d.arrayBuffer()); }
  else throw new Error("OpenAI: sem b64_json nem url");
  writeFileSync(outPath, buf);
  return Math.round(statSync(outPath).size / 1024);
}

// ---------- pool de paralelismo ----------
async function runPool(items, concurrency, worker) {
  let idx = 0;
  async function next() { while (idx < items.length) { const i = idx++; await worker(items[i], i); } }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => next()));
}

function abrirPasta(pasta) {
  try { spawn("explorer.exe", [pasta], { detached: true, stdio: "ignore" }).unref(); }
  catch (e) { console.error("nao abriu explorer:", e.message); }
}
function sseSend(res, obj) { res.write(`data: ${JSON.stringify(obj)}\n\n`); }
async function readJsonBody(req) {
  let body = ""; for await (const chunk of req) body += chunk;
  try { return JSON.parse(body); } catch { return null; }
}

// ---------- HTTP ----------
const server = createServer(async (req, res) => {
  const url = req.url || "";

  if (req.method === "GET" && (url === "/" || url === "/index.html")) {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(readFileSync(join(PUBLIC_DIR, "index.html"), "utf8"));
    return;
  }

  // prompt: GET /api/prompt?tipo=plano|conversao
  if (req.method === "GET" && url.startsWith("/api/prompt")) {
    const u = new URL(url, "http://x");
    const tipo = u.searchParams.get("tipo") === "conversao" ? "conversao" : "plano";
    const p = getPrompt(tipo);
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ prompt: p.value, default: p.default }));
    return;
  }
  // prompt: POST salvar
  if (req.method === "POST" && url.startsWith("/api/prompt") && !url.includes("restaurar")) {
    const u = new URL(url, "http://x");
    const tipo = u.searchParams.get("tipo") === "conversao" ? "conversao" : "plano";
    const parsed = await readJsonBody(req);
    if (!parsed || typeof parsed.prompt !== "string") { res.writeHead(400); res.end("json invalido"); return; }
    const txt = parsed.prompt.trim();
    if (!txt) { res.writeHead(400); res.end("prompt vazio"); return; }
    const p = getPrompt(tipo);
    p.value = txt;
    try { writeFileSync(p.file, txt, "utf8"); } catch {}
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
    return;
  }
  // prompt: restaurar padrao
  if (req.method === "POST" && url.startsWith("/api/prompt/restaurar")) {
    const u = new URL(url, "http://x");
    const tipo = u.searchParams.get("tipo") === "conversao" ? "conversao" : "plano";
    const p = getPrompt(tipo);
    p.value = p.default;
    try { writeFileSync(p.file, p.default, "utf8"); } catch {}
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, prompt: p.default }));
    return;
  }

  // MODO 1: gerar do zero (POST -> SSE)
  if (req.method === "POST" && url === "/api/gerar") {
    const parsed = await readJsonBody(req);
    if (!parsed) { res.writeHead(400); res.end("json invalido"); return; }
    const tema = (parsed.tema || "").trim();
    const qtd = Math.min(Math.max(parseInt(parsed.quantidade, 10) || 5, 1), 30);
    if (!tema) { res.writeHead(400); res.end("tema vazio"); return; }

    res.writeHead(200, { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache", Connection: "keep-alive" });
    const send = (o) => sseSend(res, o);
    const pasta = join(LIVROS_ROOT, `${timestamp()}_${sanitize(tema)}`);

    try {
      send({ tipo: "status", msg: `Pedindo ao GLM para planejar ${qtd} cenas sobre "${tema}"...` });
      const t0 = Date.now();
      const plano = await planejarCenas(tema, qtd);
      send({ tipo: "plano", titulo: plano.titulo, cenas: plano.cenas.map((c) => c.nome) });
      send({ tipo: "status", msg: `Plano pronto em ${(((Date.now() - t0) / 1000)).toFixed(1)}s. Gerando ${plano.cenas.length} imagens em paralelo (${CONCURRENCY} por vez)...` });

      mkdirSync(pasta, { recursive: true });
      writeFileSync(join(pasta, "plano.json"), JSON.stringify({ tema, titulo: plano.titulo, cenas: plano.cenas, modelo: IMG_MODEL, data: new Date().toISOString() }, null, 2));

      const total = plano.cenas.length, len = String(total).length;
      let ok = 0, falhas = 0, concluidas = 0;
      await runPool(plano.cenas, CONCURRENCY, async (cena, i) => {
        const nomeArq = `${pad(i + 1, len)}-${sanitize(cena.nome)}.png`;
        const outPath = join(pasta, nomeArq);
        send({ tipo: "progresso", idx: i, total, nome: cena.nome, status: "gerando", concluidas });
        try {
          const kb = await gerarImagemDoZero(cena.descricao, outPath);
          ok++; concluidas++;
          send({ tipo: "progresso", idx: i, total, nome: cena.nome, status: "ok", arquivo: nomeArq, kb, concluidas });
        } catch (e) {
          falhas++; concluidas++;
          send({ tipo: "progresso", idx: i, total, nome: cena.nome, status: "erro", erro: e.message, concluidas });
        }
      });

      writeFileSync(join(pasta, "relatorio.txt"),
        `Livro de Colorir - ${plano.titulo}\nTema: ${tema}\nData: ${new Date().toISOString()}\nModelo: ${IMG_MODEL}\nImagens: ${ok} ok, ${falhas} falhas de ${total}\n\nCenas:\n` +
        plano.cenas.map((c, i) => `${pad(i + 1, len)}. ${c.nome}`).join("\n"), "utf8");
      send({ tipo: "fim", pasta, ok, falhas, total, titulo: plano.titulo });
      abrirPasta(pasta);
    } catch (e) {
      console.error("erro fatal:", e);
      send({ tipo: "erro", msg: e.message });
    } finally { res.end(); }
    return;
  }

  // MODO 2: gerar de imagens enviadas (POST -> SSE)
  if (req.method === "POST" && url === "/api/gerar-de-imagens") {
    const parsed = await readJsonBody(req);
    if (!parsed || !Array.isArray(parsed.imagens) || !parsed.imagens.length) {
      res.writeHead(400); res.end("sem imagens"); return;
    }
    const quality = ["low", "medium", "high", "auto"].includes(parsed.quality) ? parsed.quality : "low";

    res.writeHead(200, { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache", Connection: "keep-alive" });
    const send = (o) => sseSend(res, o);
    const pasta = join(LIVROS_ROOT, `${timestamp()}_de-imagens`);

    // parseia cada data URL -> buffer
    const items = [];
    for (let i = 0; i < parsed.imagens.length; i++) {
      const d = parsed.imagens[i];
      const m = String(d).match(/^data:(image\/[a-zA-Z+.-]+);base64,(.+)$/);
      if (!m) continue;
      items.push({ idx: i, mime: m[1], buf: Buffer.from(m[2], "base64") });
    }
    if (!items.length) { send({ tipo: "erro", msg: "Nenhuma imagem valida." }); res.end(); return; }

    mkdirSync(pasta, { recursive: true });
    const total = items.length, len = String(total).length;
    send({ tipo: "plano-imagens", total });
    send({ tipo: "status", msg: `Convertendo ${total} imagens em paralelo (qualidade: ${quality}, ${CONCURRENCY} por vez)...` });

    let ok = 0, falhas = 0, concluidas = 0;
    await runPool(items, CONCURRENCY, async (it, i) => {
      const nomeArq = `${pad(i + 1, len)}-colorir.png`;
      const outPath = join(pasta, nomeArq);
      const nome = `imagem ${i + 1}`;
      send({ tipo: "progresso", idx: i, total, nome, status: "gerando", concluidas });
      try {
        const kb = await gerarDeImagem(it.buf, it.mime, outPath, quality);
        ok++; concluidas++;
        send({ tipo: "progresso", idx: i, total, nome, status: "ok", arquivo: nomeArq, kb, concluidas });
      } catch (e) {
        falhas++; concluidas++;
        send({ tipo: "progresso", idx: i, total, nome, status: "erro", erro: e.message, concluidas });
      }
    });

    writeFileSync(join(pasta, "relatorio.txt"),
      `Livro de Colorir (de suas imagens)\nData: ${new Date().toISOString()}\nModelo: ${IMG_MODEL}\nQualidade: ${quality}\nImagens: ${ok} ok, ${falhas} falhas de ${total}\n`, "utf8");
    send({ tipo: "fim", pasta, ok, falhas, total, titulo: "Livro de Colorir (de suas imagens)" });
    abrirPasta(pasta);
    res.end();
    return;
  }

  res.writeHead(404); res.end("404");
});

server.listen(PORT, () => {
  console.log(`\n  Agente Livros de Colorir rodando em:  http://localhost:${PORT}`);
  console.log(`  Modelo imagem: ${IMG_MODEL} | GLM plano: ${GLM_MODEL}`);
  console.log(`  Paralelismo: ${CONCURRENCY} por vez | Livros em: ${LIVROS_ROOT}`);
  console.log(`  Ctrl+C para parar.\n`);
});
