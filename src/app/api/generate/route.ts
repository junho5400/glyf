const MOCK_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">' +
  '<rect width="200" height="200" fill="#fafaf9"/>' +
  '<path d="M 100 30 L 170 170 L 140 170 L 120 130 L 80 130 L 60 170 L 30 170 Z" fill="#171717"/>' +
  '<path d="M 90 110 L 110 110 L 100 70 Z" fill="#fafaf9"/>' +
  '</svg>';

const CHUNK_DELAY_MS = 50;

function* chunks(text: string): Generator<string> {
  let i = 0;
  while (i < text.length) {
    const size = 4 + Math.floor(Math.random() * 9);
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
