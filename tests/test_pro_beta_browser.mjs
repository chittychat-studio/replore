// Browser + actual local claim/entitlement/playbook handlers. Stripe and KV are controlled fixtures.
// This does NOT verify a real Stripe payment, Google account or production playbook inventory.
// QA dependency: npm install --prefix .qa --no-save --package-lock=false playwright
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {handleClaim,resetClaim} from '../functions/api/pro/claim.js';
import {proKeyOk,resetPro,PRO_TTL_MS} from '../functions/api/relevance.js';
import {playbookResponse,resetPlaybook} from '../functions/api/pro/playbook.js';
const require=createRequire(import.meta.url),{chromium}=require('../.qa/node_modules/playwright');
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),web=path.join(root,'web');
const SID='cs_test_LocalFixtureOnly123456789',SUB='sub_LocalFixtureOnly123456789';
const env={STRIPE_SECRET_KEY:'rk_test_LocalFixtureOnly123456789',PRO_SIGNING_SECRET:'local fixture only; never a production secret'.repeat(2),PRO_PRICE_IDS:'price_LocalProFixture123'};
const fixtureBook={id:'test-launch',title:'Test fixture: launch setup',steps:[{title:'Fixture domain step',body:'Fixture content for exercising the existing step renderer.'},{title:'Fixture email step',body:'- Verify fixture state\n- Test progress persistence'}]};
const records={'pb:index':[{id:fixtureBook.id,title:fixtureBook.title,steps:2}],['pb:'+fixtureBook.id]:fixtureBook};
const kv={async get(key){return records[key]||null;}};
let subStatus='active',paymentStatus='paid',now=Date.now(),lookups=0,holdBook=null,holdOnce=false;
function subscription(){return {id:SUB,status:subStatus,current_period_end:Math.floor(now/1000)+86400,items:{data:[{price:{id:'price_LocalProFixture123',product:'prod_LocalFixture'}}]}};}
async function stripeFixture(url){
  lookups++;
  if(url.includes('/checkout/sessions/'))return Response.json({id:SID,payment_status:paymentStatus,subscription:subscription()});
  if(url.includes('/subscriptions/'))return Response.json(subscription());
  throw new Error('Unexpected fixture request');
}
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.woff2':'font/woff2','.svg':'image/svg+xml','.webp':'image/webp'};
const server=http.createServer(async(req,res)=>{
 try{
  const base='http://'+req.headers.host,url=new URL(req.url,base);
  if(url.pathname.startsWith('/api/')){
   const chunks=[];for await(const chunk of req)chunks.push(chunk);
   const request=new Request(url,{method:req.method,headers:req.headers,...(req.method==='GET'?{}:{body:Buffer.concat(chunks)})});
   let response;
   if(url.pathname==='/api/auth/config')response=Response.json({on:false});
   else if(url.pathname==='/api/pro/claim')response=await handleClaim(request,env,stripeFixture,now);
   else if(url.pathname==='/api/pro/playbook'){
    response=await playbookResponse(request,{...env,PLAYBOOKS:kv},r=>proKeyOk(r,env,stripeFixture,now),now);
    if(url.searchParams.has('id')&&holdOnce){holdOnce=false;await new Promise(resolve=>{holdBook=resolve;});}
   }else response=Response.json({error:'qa_provider_disabled'},{status:503});
   res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));return;
  }
  let file=path.resolve(web,'.'+decodeURIComponent(url.pathname));
  if(file===web)file=path.join(web,'index.html');if(!path.extname(file))file+='.html';
  if(!file.startsWith(web+path.sep)||!fs.existsSync(file)){res.writeHead(404);res.end();return;}
  res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream'});fs.createReadStream(file).pipe(res);
 }catch(_){res.writeHead(500);res.end('local_fixture_error');}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
const context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'}),page=await context.newPage();
const errors=[];page.on('pageerror',e=>errors.push(e.message));
await context.route('https://api.github.com/**',route=>route.fulfill({status:403,contentType:'application/json',body:'{"message":"GitHub disabled in Pro-only QA"}'}));
await context.route('https://buy.stripe.com/**',()=>{throw new Error('QA must never navigate to a payment link');});
try{
 await page.goto(base);await page.locator('#proBtn').click();await page.locator('#proModal').waitFor({state:'visible'});
 assert.equal(await page.locator('#proModal .pro-bens li').count(),3);
 assert.match(await page.locator('#proModal h2').innerText(),/^Replore Pro$/);
 assert.match(await page.locator('#proPlanM').innerText(),/8 USD a month/);
 assert.match(await page.locator('#proPlanY').innerText(),/36 USD/);
 assert.match(await page.locator('#proPlanYWas').innerText(),/72 USD a year/);
 assert.equal(await page.locator('#proCardY').getAttribute('aria-disabled'),'true');
 assert.equal(await page.locator('#proCardY').getAttribute('href'),null,'unverified yearly checkout has no navigable link');
 await page.locator('#proCardY').focus();await page.locator('#proCardY').press('Enter');assert.equal(context.pages().length,1);
 assert.equal(await page.locator('#proYearWarning').evaluate(e=>e===document.activeElement),true);
 await page.locator('#proModal').screenshot({path:path.join(root,'.qa','pro-modal-desktop.png')});
 for(const width of [390,768]){
  await page.setViewportSize({width,height:844});
  assert.equal(await page.locator('#proModal .sheet').evaluate(e=>e.scrollWidth<=e.clientWidth),true,'modal overflow at '+width);
  assert.equal(await page.locator('#proCardM').isVisible(),true);assert.equal(await page.locator('#proCardY').isVisible(),true);
  if(width===390){await page.locator('#proModal .sheet').evaluate(e=>{e.scrollTop=0;});await page.locator('#proModal').screenshot({path:path.join(root,'.qa','pro-modal-mobile.png')});}
 }
 await page.setViewportSize({width:1440,height:1000});
 await page.locator('#proModal [data-home-open="launchBtn"]').click();await page.locator('#launchModal').waitFor({state:'visible'});
 assert.ok((await page.locator('#lnQs').innerText()).length>20,'preview is the functioning existing planner');
 await page.goto(base+'/pro');await page.locator('#ppCardM').waitFor({state:'visible'});
 assert.match(await page.locator('#pbStatus').innerText(),/Checking|Sign in/);
 await page.waitForFunction(()=>document.getElementById('pbStatus').textContent.includes('Sign in'));
 assert.equal(await page.locator('#ppBooks').isVisible(),false,'free user does not receive paid books');
 assert.match(await page.locator('#ppCardM').getAttribute('href'),/^https:\/\/buy\.stripe\.com\//);
 assert.equal(await page.locator('#ppCardY').getAttribute('href'),null);
 await page.locator('a.pro-preview-link[href="/#launch"]').click();await page.locator('#launchModal').waitFor({state:'visible'});
 await page.goto(base+'/pro');await page.locator('#ppCardM').waitFor({state:'visible'});
 await page.screenshot({path:path.join(root,'.qa','pro-page-desktop.png'),fullPage:true});
 await page.setViewportSize({width:390,height:844});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'Pro page mobile overflow');
 await page.screenshot({path:path.join(root,'.qa','pro-page-mobile.png'),fullPage:true});
 // Exercise the actual claim endpoint and its consumer with a synthetic, test-only checkout session.
 await page.evaluate(()=>proCheckoutMark());await page.goto(base+'/pro?session_id='+SID);
 await page.locator('#ppClaimOk').waitFor({state:'visible'});
 assert.equal(new URL(page.url()).searchParams.has('session_id'),false,'checkout id removed from address');
 await page.locator('#ppBooks').waitFor({state:'visible'});await page.locator('.pb-card .pb-step').waitFor();
 assert.equal(await page.locator('.pb-step').innerText(),'Fixture domain step','books refresh after payment key event');
 await page.locator('.pb-mark').click();await page.waitForFunction(()=>document.querySelector('.pb-step')?.textContent==='Fixture email step');
 await page.reload();await page.locator('#ppBooks').waitFor({state:'visible'});
 await page.waitForFunction(()=>document.querySelector('.pb-step')?.textContent==='Fixture email step');
 assert.match(await page.locator('.pb-prog').innerText(),/1 of 2 done/,'progress persists');
 // A denied subscription after the existing cache interval must not expose books.
 subStatus='canceled';now+=PRO_TTL_MS+1;await page.reload();
 await page.waitForFunction(()=>document.getElementById('pbStatus').textContent.includes('Sign in'));
 assert.equal(await page.locator('#ppBooks').isVisible(),false);
 assert.match(await page.locator('#ppOn').innerText(),/key saved/i,'saved key is not portrayed as active entitlement');
 // A new active verification restores access; removing the key clears already rendered paid UI.
 subStatus='active';now+=PRO_TTL_MS+1;await page.reload();await page.locator('#ppBooks').waitFor({state:'visible'});
 await page.locator('#ppRemove').click();await page.waitForFunction(()=>document.getElementById('pbStatus').textContent.includes('Sign in'));
 assert.equal(await page.locator('#ppBooks').isVisible(),false);
 assert.equal(await page.locator('.pb-view').innerText(),'');
 // Forged, shape-valid keys are refused by the actual signature checker without a Stripe lookup.
 const before=lookups;await page.evaluate(()=>proKeySave('rp.sub_LocalFixtureOnly123456789.0000000000000000'));
 await page.waitForFunction(()=>document.getElementById('pbStatus').textContent.includes('Sign in'));
 assert.equal(lookups,before);assert.equal(await page.locator('#ppBooks').isVisible(),false);
 await page.evaluate(()=>proKeyRemove());
 // Failed payment cannot activate access.
 paymentStatus='unpaid';resetClaim();await page.goto(base+'/pro?session_id='+SID);
 await page.locator('#ppClaimErr').waitFor({state:'visible'});assert.match(await page.locator('#ppClaimErr').innerText(),/not paid/);
 assert.equal(await page.evaluate(()=>proKeyGet()),'');
 // A late book reply from old credentials must not restore the paid view after removal.
 paymentStatus='paid';subStatus='active';resetPro();resetClaim();holdOnce=true;
 await page.evaluate(()=>proCheckoutMark());await page.goto(base+'/pro?session_id='+SID);
 await page.waitForFunction(()=>document.getElementById('pbStatus').textContent==='Loading playbook...');
 await page.evaluate(()=>proKeyRemove());
 assert.ok(holdBook);holdBook();holdBook=null;
 await page.waitForFunction(()=>document.getElementById('pbStatus').textContent.includes('Sign in'));
 assert.equal(await page.locator('#ppBooks').isVisible(),false);assert.equal(await page.locator('.pb-view').innerText(),'');
 assert.deepEqual(errors,[]);
 console.log(JSON.stringify({result:'passed',environment:'local server + actual handlers + synthetic Stripe/KV',realPayments:0,providerCalls:0,viewports:[390,768,1440],checks:['Pro presentation','yearly guard','renewal disclosure','real Leo preview','claim-to-books refresh','progress retention','canceled subscription','forged key denial','key removal','failed payment','stale reply suppression'],browserErrors:errors}));
}finally{
 if(holdBook)holdBook();resetClaim();resetPlaybook();resetPro();await browser.close();await new Promise(resolve=>server.close(resolve));
}
