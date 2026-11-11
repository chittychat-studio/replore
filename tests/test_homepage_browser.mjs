// Optional browser regression suite. Install QA-only tooling with:
// npm install --prefix .qa --no-save --package-lock=false playwright
// Uses installed Chrome, real public GitHub search, and no paid provider calls.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
const require=createRequire(import.meta.url);
const {chromium}=require('../.qa/node_modules/playwright');
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const web=path.join(root,'web');
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.woff2':'font/woff2','.webp':'image/webp','.jpg':'image/jpeg'};
const server=http.createServer((req,res)=>{
  const url=new URL(req.url,'http://localhost');
  if(url.pathname.startsWith('/api/')){res.writeHead(503,{'Content-Type':'application/json'});res.end('{"error":"qa_provider_disabled"}');return;}
  let file=path.resolve(web,'.'+decodeURIComponent(url.pathname));
  if(file===web) file=path.join(web,'index.html');
  if(!path.extname(file)) file+='.html';
  if(!file.startsWith(web+path.sep)||!fs.existsSync(file)){res.writeHead(404);res.end();return;}
  res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream'});fs.createReadStream(file).pipe(res);
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
const errors=[];
const context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
const page=await context.newPage();
page.on('pageerror',error=>errors.push(error.message));
let searches=0,disabledRelevanceRequests=0;
page.on('request',req=>{if(req.url().includes('api.github.com/search/repositories')) searches++;if(req.url().includes('/api/relevance')&&req.method()==='POST') disabledRelevanceRequests++;});
try{
  await page.goto(base);
  await page.locator('#quickpicks .chip').first().waitFor();
  assert.equal(await page.locator('#quickpicks .chip').count(),5);
  await page.locator('#trendCar').waitFor({state:'visible',timeout:30000});
  await page.waitForFunction(()=>document.getElementById('tcarTrack').getAttribute('aria-busy')==='false');
  const before=searches;
  await page.locator('#quickpicks .chip').nth(1).click();
  assert.equal(await page.locator('#q').inputValue(),'Find a React admin dashboard starter');
  assert.equal(searches,before,'example must not submit a search');
  await page.locator('#journey-repos').click();
  assert.match(await page.locator('#journey-heading').innerText(),/trade-offs/);
  await page.locator('#journey-repos').press('ArrowRight');
  assert.equal(await page.locator('#journey-plan').getAttribute('aria-selected'),'true');
  await page.locator('#journey-plan').press('Home');
  assert.equal(await page.locator('#journey-idea').getAttribute('aria-selected'),'true');
  await page.screenshot({path:path.join(root,'.qa','homepage-desktop.png'),fullPage:true});
  for(const width of [390,768,1440]){
    await page.setViewportSize({width,height:900});
    const overflow=await page.evaluate(()=>Array.from(document.querySelectorAll('body *')).filter(e=>{const b=e.getBoundingClientRect();return b.width&&b.right>innerWidth+1&&!e.closest('.comparison-scroll,.tdeck,.modal,.rc-drawer');}).slice(0,12).map(e=>({tag:e.tagName,cls:e.className,right:e.getBoundingClientRect().right})));
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`page overflow at ${width}: ${JSON.stringify(overflow)}`);
    assert.equal(await page.locator('#go').isVisible(),true);
    assert.equal(await page.locator('.hero .sub').isVisible(),true);
    if(width===390) await page.screenshot({path:path.join(root,'.qa','homepage-mobile.png'),fullPage:true});
  }
  await page.setViewportSize({width:1440,height:1000});
  // Submit to the real public GitHub API. No hard-coded successful search data.
  await page.locator('#go').click();
  await page.waitForFunction(()=>!window.__busy,{},{timeout:60000});
  const cards=page.locator('#out .rcard');
  assert.ok(await cards.count()>0,'real GitHub search returned no cards: '+await page.locator('#out').innerText());
  const realSearchCards=await cards.count();
  const firstName=await cards.first().locator('.pick-cb').getAttribute('data-name');
  assert.match(await cards.first().locator('.rc-gh-direct').getAttribute('href'),/^https:\/\/github.com\//);
  await page.setViewportSize({width:390,height:844});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'mobile results overflow');
  await cards.first().locator('.rc-bm').click();
  assert.equal(await cards.first().locator('.pick-cb').isChecked(),true);
  assert.match(await page.locator('#prdCount').innerText(),/1 repo/);
  await page.locator('#prdGo').click();
  await page.locator('#prdModal').waitFor({state:'visible'});
  assert.ok((await page.locator('#prdPrompt').innerText()).includes(firstName));
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'mobile plan overflow');
  await page.keyboard.press('Escape');
  await page.setViewportSize({width:1440,height:1000});
  await page.reload();
  await page.locator('#out .rcard').first().waitFor();
  // Restoring the results must still permit selecting and generating a prompt.
  if(!await page.locator('#out .pick-cb').first().isChecked()) await page.locator('#out .rc-bm').first().click();
  await page.locator('#prdGo').click();
  assert.ok((await page.locator('#prdPrompt').innerText()).includes(firstName));
  await page.keyboard.press('Escape');
  await page.screenshot({path:path.join(root,'.qa','search-results.png'),fullPage:true});
  // Failures use intercepted HTTP responses, never invented successful results.
  await page.route('https://api.github.com/**',route=>route.fulfill({status:403,contentType:'application/json',body:'{"message":"API rate limit exceeded"}'}));
  await page.locator('#q').fill('self hosted analytics');
  await page.locator('#go').click();
  await page.waitForFunction(()=>!window.__busy,{},{timeout:60000});
  assert.ok(await page.locator('#out .err').count()>0,'rate limit must be visible');
  assert.equal(await page.locator('#go').isEnabled(),true);
  await page.locator('#brandHome').click();
  await page.locator('[data-home-open="pluginBtn"]').first().click();
  await page.locator('#pluginModal').waitFor({state:'visible'});
  assert.equal(await page.locator('#pluginModal').evaluate(e=>e.parentElement.tagName),'BODY','dialogs must not nest inside Pro');
  await page.keyboard.press('Escape');
  await page.locator('[data-home-open="launchBtn"]').click();
  await page.locator('#launchModal').waitFor({state:'visible'});
  await page.keyboard.press('Escape');
  await page.locator('#optsBtn').click();
  await page.locator('#stackInput').waitFor({state:'visible'});
  await page.keyboard.press('Escape');
  await page.emulateMedia({reducedMotion:'no-preference'});
  await page.reload();
  await page.locator('#quickpicks .chip').first().waitFor();
  assert.equal(await page.locator('#go').isVisible(),true);
  assert.deepEqual(errors,[],'browser runtime errors');
  console.log(JSON.stringify({status:'passed',realSearchCards,selectedRepository:firstName,viewports:[390,768,1440],disabledRelevanceRequests,providerCalls:0,errors}));
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
