import { AppError } from './services';
const BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
const key = () => { if (!process.env.GEMINI_API_KEY) throw new AppError(503, 'GEMINI_API_KEY is not configured'); return process.env.GEMINI_API_KEY; };
export const textModels = () => [process.env.GEMINI_MODEL || 'gemini-2.5-flash', ...(process.env.GEMINI_FALLBACK_MODELS || '').split(',')].map((s) => s.trim()).filter(Boolean);

async function call(model, body) {
  const res = await fetch(`${BASE}/${model}:generateContent`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key() }, body: JSON.stringify(body), signal: AbortSignal.timeout(55000) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) { const e = new Error(json?.error?.message || `Gemini error ${res.status}`); e.status = res.status; throw e; }
  return json;
}
// Tries the primary model, then each fallback, on model-not-found / quota / server errors.
export async function generate(body, models = textModels()) {
  let last;
  for (const m of models) {
    try { return await call(m, body); } catch (e) {
      last = e;
      if (![400, 404, 429, 500, 502, 503, 504].includes(e.status) && e.name !== 'TimeoutError') break;
      if (e.status === 400 && !/model|not found|not supported/i.test(e.message)) break;
    }
  }
  throw new AppError(502, `AI service unavailable: ${last?.message || 'unknown error'}`);
}
export async function generateImageBytes(prompt) {
  const model = process.env.GEMINI_IMAGE_MODEL || 'gemini-2.5-flash-image';
  const json = await generate({ contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: { responseModalities: ['TEXT', 'IMAGE'] } }, [model]);
  const part = json.candidates?.[0]?.content?.parts?.find((p) => p.inlineData || p.inline_data);
  const d = part?.inlineData || part?.inline_data;
  if (!d) throw new AppError(502, 'Image model returned no image');
  return { buffer: Buffer.from(d.data, 'base64'), mime: d.mimeType || d.mime_type || 'image/png' };
}
