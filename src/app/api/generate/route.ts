const MOCK_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000">' +
  '<path d="M109 428Q109 431 107 435Q105 438 102 441Q99 444 96 446Q93 448 91 448Q87 448 84 445Q81 442 81 437Q81 432 84 425Q87 418 91 412Q95 406 100 402Q104 398 108 398Q113 398 116 401Q119 404 119 409Q119 414 116 419Q113 424 109 428ZM102 503Q102 506 101 510Q100 514 99 518Q98 522 97 526Q96 530 95 533Q94 536 93 539Q92 542 91 545Q89 556 87 572Q85 588 83 604Q81 620 79 634Q77 648 75 655Q73 660 70 674Q67 687 63 704Q59 720 54 738Q49 755 44 770Q39 785 34 796Q29 807 26 810Q23 813 19 819Q15 825 10 830Q5 835 0 838Q-5 841 -10 841Q-17 841 -22 835Q-27 829 -30 820Q-33 811 -34 801Q-35 791 -35 783Q-35 775 -34 765Q-33 755 -31 745Q-29 736 -26 728Q-23 720 -19 716Q-17 714 -15 713Q-13 712 -11 712Q-7 712 -3 716Q1 720 4 726Q7 732 10 738Q12 744 13 747Q14 743 16 732Q18 721 21 707Q23 693 26 678Q29 663 31 652Q34 635 37 613Q40 591 43 570Q46 548 49 530Q51 511 53 502Q55 495 58 490Q61 485 68 485Q71 485 75 486Q78 487 82 488Q85 489 89 490Q92 491 94 491Q96 491 98 490Q100 488 101 486Q102 484 102 481Q102 478 102 475Z"/>' +
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
