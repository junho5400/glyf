# Glyf

A text-to-SVG glyph generator. You give it a vibe and a letter; it streams a glyph token-by-token from a fine-tuned model, draws it like a pen on paper, and lets you edit the resulting path by hand. Save up a library and download it as a TTF.

Built as a demo of model-aware UX: making a generative model's output feel like a draft you can refine, not a black-box result you keep regenerating until it's right.

## Stack

Next.js 16 (App Router) · TypeScript · Tailwind v4 · Modal (serverless GPU) · Qwen2.5-Coder-7B + private LoRA · opentype.js

## Architecture

```
browser ── /api/generate ── Modal router ── GPU container ── Qwen2.5-Coder-7B + LoRA
   │                          (tiny image)      (L4 GPU,        (HF Hub, private)
   │                                             warm pool)
   ▼
SSE → progressive sanitizer → pen-stroke render → editable path
```

The frontend always works against an SSE contract — `data: {"text": "<chunk>"}` for tokens, `data: {"done": true}` to finish. With `MODAL_URL` unset, the API route serves a mock stream; with it set, the route proxies to the deployed Modal endpoint. Same UI, swappable backend.

The path editor is a from-scratch Bezier surface — drag anchors, move/scale/rotate selections, simplify, fit to typographic ratios (cap-height for caps and ascenders, x-height for x-height letters).

## Run locally (mock backend, no GPU needed)

```bash
npm install
npm run dev
```

The mock returns a hard-coded SVG via streaming SSE so you can develop the UI without spending GPU minutes.

## Run with the real model

You need a Modal account and a Hugging Face token with read access to the (private) LoRA adapter. Then:

```bash
pip install modal
modal serve backend/modal_app.py    # dev mode — re-deploys on save
# or
modal deploy backend/modal_app.py   # persistent endpoint
```

Copy the URL Modal prints, then:

```bash
echo "MODAL_URL=https://<your-modal-url>" > .env.local
npm run dev
```

First call is a 5–10 min cold start (the container downloads ~14 GB of weights into the `glyf-model-cache` volume). Subsequent cold starts are ~30–60s. Warm calls are instant.

## Project notes

- The base model is `Qwen/Qwen2.5-Coder-7B`. The LoRA was fine-tuned on glyph-captioned SVGs; that adapter is private. Cloning the repo gets you the frontend and the Modal scaffolding, not the model.
- Streaming SVG sanitization (`src/lib/sanitize.ts`) handles mid-token cuts — partial tags, broken attributes, half-written numbers — so the canvas can re-render every chunk without flickering or trailing brackets.
- Multi-glyph TTF generation goes through `opentype.js`; the per-letter cumulative ascender/descender is computed from the rendered path bbox relative to a fixed baseline.
