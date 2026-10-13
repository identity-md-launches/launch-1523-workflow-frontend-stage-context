// Original code-drawn brand artwork; this is not a screenshot of chain activity.
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
  const squares = [[1,1,'#b83f16'],[2,1,'#ed793b'],[3,1,'#f7d76a'],[1,2,'#d83142'],[3,2,'#b4d96c'],[1,3,'#8957b4'],[2,3,'#3765cb'],[3,3,'#279b9c'],[1,4,'#20252b']];
  await page.setContent(`<html><body style="margin:0;background:#f7f7f2;color:#292d27;font-family:Arial,sans-serif"><div style="padding:64px"><div style="display:flex;align-items:center;gap:14px;font-size:28px;font-weight:600"><svg width="32" height="32" viewBox="0 0 32 32"><path fill="#b83f16" d="M0 0h13v13H0zm19 0h13v13H19zM0 19h13v13H0z"/><path fill="#292d27" d="M19 19h13v13H19z"/></svg>PixelCommons</div><h1 style="font-size:80px;line-height:1.05;letter-spacing:-4px;margin:90px 0 24px;width:620px">Make your mark.</h1><p style="font-size:28px;color:#60675d;line-height:1.5;width:550px">A shared canvas.<br>4,096 pixels. 16 colors. Everyone.</p><p style="font-size:22px;color:#60675d;margin-top:60px">Paint together on Sepolia.</p><svg width="360" height="450" viewBox="0 0 360 450" style="position:absolute;right:36px;top:96px">${squares.map(([x,y,color])=>`<rect x="${x*70}" y="${y*70}" width="64" height="64" fill="${color}"/>`).join('')}</svg></div></body></html>`);
  await page.screenshot({ path: fileURLToPath(new URL('../public/share.png', import.meta.url)) });
} finally { await browser.close(); }
