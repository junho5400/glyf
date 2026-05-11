const MOCK_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000">' +
  '<path d="M35 643Q35 628 41 619Q47 610 61 610Q71 610 77 615Q83 620 85 631Q89 666 120 686Q151 706 199 706Q244 706 272 686Q300 666 300 629Q300 605 285 588Q270 571 248 559Q225 548 187 530Q145 511 119 496Q93 481 70 455Q47 428 47 390Q47 350 69 322Q91 294 127 280Q163 265 206 265Q250 265 284 279Q318 293 337 318Q356 343 356 375Q356 390 350 399Q344 408 330 408Q320 408 314 403Q307 398 305 388Q301 356 272 338Q243 320 206 320Q171 320 146 336Q121 352 121 380Q121 401 134 415Q147 429 166 440Q185 450 226 467Q269 485 296 500Q323 515 346 541Q368 566 368 606Q368 653 336 686Q304 718 253 734Q202 750 148 750Q92 750 60 726Q27 702 35 643Z"/>' +
  '</svg>';

const CHUNK_DELAY_MS = 50;

function* chunks(text: string): Generator<string> {
  let i = 0;
  while (i < text.length) {
    const size = 6 + Math.floor(Math.random() * 12);
    yield text.slice(i, i + size);
    i += size;
  }
}

export async function POST(request: Request) {
  let body: { vibe?: string; letter?: string };
  try {
    body = (await request.json()) as { vibe?: string; letter?: string };
  } catch {
    return new Response('Invalid JSON body', { status: 400 });
  }
  const { vibe, letter } = body;
  if (!vibe || !letter) {
    return new Response('Missing vibe or letter', { status: 400 });
  }

  const { signal } = request;
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      for (const chunk of chunks(MOCK_SVG)) {
        if (signal.aborted) {
          controller.close();
          return;
        }
        const event = `data: ${JSON.stringify({ text: chunk })}\n\n`;
        controller.enqueue(encoder.encode(event));
        await new Promise((r) => setTimeout(r, CHUNK_DELAY_MS));
      }
      controller.enqueue(
        encoder.encode(`data: ${JSON.stringify({ done: true })}\n\n`),
      );
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}
