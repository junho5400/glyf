const MOCK_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000">' +
  '<path d="M-10 913Q-17 913 -20 907Q-24 901 -24 891Q-24 876 -17 847Q-10 818 0 780Q10 742 20 702Q30 662 37 626Q44 591 48 568Q51 545 51 542Q51 538 50 537Q49 536 49 533Q49 530 51 526Q53 522 58 511Q63 499 69 486Q75 472 81 460Q87 448 91 442Q96 435 102 435Q110 435 113 441Q116 447 116 454Q116 463 113 470Q110 477 106 485Q135 457 163 445Q191 434 214 434Q233 434 246 445Q259 456 259 481Q259 505 247 531Q235 557 216 581Q197 605 174 624Q151 643 129 654Q107 665 89 665Q75 665 67 657Q59 649 59 636Q59 626 64 617Q69 608 76 603Q75 608 73 615Q71 622 70 630Q69 637 69 643Q69 656 75 662Q81 667 89 667Q106 667 129 654Q152 640 174 619Q197 597 215 571Q233 545 243 519Q254 493 254 472Q254 457 245 449Q236 441 221 441Q199 441 173 453Q147 465 124 485Q101 505 86 530Q71 555 71 581Q71 594 68 610Q65 626 61 641Q57 657 54 669Q51 681 51 686Q51 690 52 693Q52 696 52 699Q52 708 49 724Q46 740 41 760Q36 780 30 801Q24 822 19 841Q14 860 10 873Q6 886 6 889Q6 898 11 905Q15 913 -10 913Z"/>' +
  '</svg>'

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
