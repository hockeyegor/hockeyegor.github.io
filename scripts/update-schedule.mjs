import { mkdir, writeFile } from 'node:fs/promises';

const target = new URL('../data/schedule.html', import.meta.url);
const response = await fetch('https://onhockey.tv/schedule_table.php', {
  headers: {
    Accept: 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8',
    'Cache-Control': 'no-cache',
    Referer: 'https://onhockey.tv/',
    'User-Agent': 'Mozilla/5.0 (SmartTV; Linux; Tizen) AppleWebKit/537.36 Chrome/120 Safari/537.36'
  }
});

if (!response.ok) {
  throw new Error(`Schedule request returned HTTP ${response.status}`);
}

const html = new TextDecoder('windows-1251').decode(await response.arrayBuffer());
if (!html.includes('id=\'gametable\'') && !html.includes('id="gametable"')) {
  throw new Error('Schedule response does not contain the match table');
}

await mkdir(new URL('../data/', import.meta.url), { recursive: true });
await writeFile(target, html, 'utf8');
console.log(`Updated ${target.pathname}`);
