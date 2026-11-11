// Read-only audit of the configured public Stripe Payment Links. Never fills or submits a payment form.
// QA tooling: npm install --prefix .qa --no-save --package-lock=false playwright
import {createRequire} from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const require=createRequire(import.meta.url),{chromium}=require('../.qa/node_modules/playwright');
const source=fs.readFileSync(path.join(root,'web/pro-core.js'),'utf8');
const links=source.match(/var PRO_URL="([^"]+)", PRO_URL_YEAR="([^"]+)"/);
if(!links)throw new Error('Could not read configured Stripe Payment Links');
const output=path.join(root,'.qa');fs.mkdirSync(output,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
const results=[];
try{
  for(const [index,plan] of ['monthly','yearly'].entries()){
    const url=new URL(links[index+1]);
    if(url.origin!=='https://buy.stripe.com'||url.username||url.password)throw new Error('Expected a public Stripe Payment Link');
    const page=await browser.newPage({viewport:{width:1280,height:950}});
    try{
      const response=await page.goto(url.href,{waitUntil:'domcontentloaded',timeout:45000});
      await page.locator('body').filter({hasText:/\$|USD|no longer|expired|unavailable/i}).waitFor({timeout:20000}).catch(()=>{});
      if(plan==='yearly')await page.waitForFunction(()=>/\$36[.,]00/.test(document.body.innerText)||/invalid|expired|cannot be applied/i.test(document.body.innerText),{},{timeout:25000}).catch(()=>{});
      const text=await page.locator('body').innerText();
      const lines=text.split('\n').map(s=>s.trim()).filter(s=>s&&/USD|US\$|\$\d|per month|per year|year|month|renew|tax|cancel|terms|refund|invalid|no longer|expired|unavailable|Cardzo|Replore/i.test(s)).slice(0,45);
      const terms=await page.locator('a').evaluateAll(as=>as.filter(a=>/terms|privacy/i.test(a.textContent)).map(a=>({text:a.textContent.trim(),href:a.href})));
      results.push({plan,status:response.status(),checkoutText:lines,discount36Visible:/\$36[.,]00/.test(text),invalidPromotionVisible:/This code is invalid/i.test(text),termsLinks:terms,paymentSubmitted:false});
      await page.screenshot({path:path.join(output,'stripe-'+plan+'-readonly.png'),fullPage:true});
    }catch(error){results.push({plan,error:error.name,paymentSubmitted:false});}
    await page.close();
  }
  fs.writeFileSync(path.join(output,'stripe-readonly-evidence.json'),JSON.stringify(results,null,2));
  console.log(JSON.stringify({scope:'public hosted checkout only; no purchase',results}));
}finally{await browser.close();}
