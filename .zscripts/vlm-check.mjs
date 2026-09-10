import ZAI from 'z-ai-web-dev-sdk';
import fs from 'fs';

async function main() {
  const zai = await ZAI.create();
  const b64 = fs.readFileSync(process.argv[2]).toString('base64');
  const response = await zai.chat.completions.createVision({
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: process.argv[3] || 'Review this UI screenshot. List: (1) any visual defects (overlaps, cut-off text, broken layout, unreadable contrast), (2) whether it shows a light-themed dashboard with dark left sidebar, KPI stat cards, a dark map, and right-side panels, (3) overall quality 1-10. Be concise.'
          },
          { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${b64}` } }
        ]
      }
    ],
    thinking: { type: 'disabled' }
  });
  console.log(response.choices[0]?.message?.content);
}
main().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
