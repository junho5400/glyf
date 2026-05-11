"""
Modal backend for Glyf.

Serves Qwen2.5-Coder-7B + the project's LoRA adapter behind a single POST
endpoint that streams Server-Sent Events matching the frontend's contract:
    POST {vibe, letter}  →  SSE stream of  data: {"text": "<chunk>"}\\n\\n
    final event:                            data: {"done": true}\\n\\n

The model class loads the base + adapter once on container start (warm
containers reuse the loaded model). The HTTP function is a thin router on a
lightweight image so cold start of the public endpoint is fast; only the GPU
container has the heavy ML deps.

Deploy:
    modal deploy backend/modal_app.py
    # copy the URL it prints, set MODAL_URL in glyf's .env.local

Iterate locally:
    modal serve backend/modal_app.py
"""
from __future__ import annotations

import json
from threading import Thread

import modal

BASE_MODEL = "Qwen/Qwen2.5-Coder-7B"
ADAPTER_REPO = "junho5400/svg-finetune-qwen-7b-lora-resume"
CACHE_DIR = "/cache"

# GPU image: heavy, but only the model container pulls it.
gpu_image = (
    modal.Image.debian_slim(python_version="3.11")
    .pip_install(
        "torch==2.5.1",
        "transformers==4.46.3",
        "peft==0.13.2",
        "accelerate==1.1.1",
        "huggingface_hub>=0.26,<1.0",
        "sentencepiece>=0.2.0",
    )
    .env({
        "HF_HOME": CACHE_DIR,
        "TRANSFORMERS_CACHE": CACHE_DIR,
        "TOKENIZERS_PARALLELISM": "false",
    })
)

# Router image: tiny — just FastAPI + stdlib. Cold start ~2s.
router_image = (
    modal.Image.debian_slim(python_version="3.11")
    .pip_install("fastapi[standard]")
)

model_cache = modal.Volume.from_name("glyf-model-cache", create_if_missing=True)

app = modal.App("glyf-backend")


@app.cls(
    image=gpu_image,
    gpu="L4",
    secrets=[modal.Secret.from_name("huggingface-secret")],
    volumes={CACHE_DIR: model_cache},
    timeout=900,
    scaledown_window=180,
)
class GlyfModel:
    @modal.enter()
    def load(self):
        import os
        import torch
        from transformers import AutoModelForCausalLM, AutoTokenizer
        from peft import PeftModel

        token = os.environ.get("HF_TOKEN")
        print(f"loading tokenizer ({BASE_MODEL})")
        self.tokenizer = AutoTokenizer.from_pretrained(BASE_MODEL, token=token)
        if self.tokenizer.pad_token is None:
            self.tokenizer.pad_token = self.tokenizer.eos_token

        print(f"loading base ({BASE_MODEL})")
        base = AutoModelForCausalLM.from_pretrained(
            BASE_MODEL,
            torch_dtype=torch.bfloat16,
            device_map="auto",
            token=token,
        )
        print(f"loading LoRA adapter ({ADAPTER_REPO})")
        self.model = PeftModel.from_pretrained(base, ADAPTER_REPO, token=token)
        self.model.eval()
        print("model ready")

    @modal.method()
    def stream(self, vibe: str, letter: str):
        from transformers import TextIteratorStreamer

        caption = f"the letter '{letter}' in a {vibe} typeface"
        prompt = f"Generate an SVG glyph for: {caption}\nSVG:\n"
        inputs = self.tokenizer(prompt, return_tensors="pt").to(self.model.device)

        streamer = TextIteratorStreamer(
            self.tokenizer,
            skip_prompt=True,
            skip_special_tokens=True,
        )
        gen_kwargs = dict(
            **inputs,
            max_new_tokens=2048,
            do_sample=False,
            pad_token_id=self.tokenizer.pad_token_id,
            streamer=streamer,
        )
        thread = Thread(target=self.model.generate, kwargs=gen_kwargs)
        thread.start()
        for chunk in streamer:
            if chunk:
                yield chunk
        thread.join()


@app.function(image=router_image)
@modal.fastapi_endpoint(method="POST", docs=False)
def generate(payload: dict):
    from fastapi.responses import StreamingResponse

    vibe = (payload.get("vibe") or "").strip()
    letter = (payload.get("letter") or "").strip()
    if not vibe or not letter:
        return {"error": "vibe and letter are required"}

    def sse():
        try:
            for chunk in GlyfModel().stream.remote_gen(vibe, letter):
                yield f"data: {json.dumps({'text': chunk})}\n\n"
            yield f"data: {json.dumps({'done': True})}\n\n"
        except Exception as exc:  # noqa: BLE001 — propagate to client
            yield f"data: {json.dumps({'error': str(exc)})}\n\n"

    return StreamingResponse(
        sse(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache, no-transform",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
