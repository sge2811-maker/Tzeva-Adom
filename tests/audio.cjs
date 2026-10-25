// Focused audio coverage: real gestures and observed Web Audio output, no game fixtures.
const assert=require('node:assert/strict');
const fs=require('node:fs');const path=require('node:path');const http=require('node:http');
const {chromium,webkit,devices}=require('playwright');
const html=fs.readFileSync(path.join(__dirname,'..','index.html'));
const server=http.createServer((req,res)=>{res.setHeader('Content-Type','text/html; charset=utf-8');res.end(html);});
const results=[];let base;
async function sessionContract(browser) {
 const context=await browser.newContext({...devices['iPhone 15 Pro Max']});
 await context.addInitScript(()=>{
  // Platform API contract only; this does not simulate an iPhone audio device.
  window.sessionRequests=[];window.rejectSession=false;
  Object.defineProperty(navigator,'audioSession',{configurable:true,value:{
   set type(value){sessionRequests.push(value);if(rejectSession)throw new Error('optional API rejected');},
   get type(){return sessionRequests.at(-1)||'auto';}
  }});
 });
 const page=await context.newPage();await page.goto(base);await deploy(page);await running(page);
 assert.equal(await page.evaluate(()=>navigator.audioSession.type),'playback','playback audio session not requested');
 await page.locator('#soundBtn').tap();assert.equal(await page.evaluate(()=>navigator.audioSession.type),'auto','muting retained playback session');
 await page.evaluate(()=>{window.rejectSession=true;});
 await page.locator('#soundBtn').tap();await running(page);await observe(page);
 assert(await peak(page,'out',1000)>.0001,'optional audio session failure broke Web Audio');
 // Campaign briefing uses a separate sound button and starts before a game exists.
 const campaign=await context.newPage();await campaign.goto(base);
 await campaign.locator('#msnCoal').tap();await campaign.locator('#mStart').tap();await running(campaign);
 assert.equal(await campaign.locator('#cutSound').textContent(),'Sound on');
 await campaign.locator('#cutSound').tap();assert.equal(await campaign.locator('#cutSound').textContent(),'Sound off');
 await campaign.locator('#cutSound').tap();await running(campaign);
 await campaign.locator('#cutSkip').tap();await campaign.locator('#cutDeploy').tap();
 assert(await campaign.evaluate(()=>__snd.on&&__mra().mission.def.n===1),'briefing deployment lost sound');
 results.push({engine:'chromium',optionalAudioSessionContract:'PASS: playback request, auto on mute, rejected setter preserves real audio',note:'instrumented API contract; physical iOS routing unverified'});
 console.log('PASS optional Audio Session contract and campaign audio controls');await context.close();
}
async function deploy(page) {
 await page.locator('#startBtn').tap();await page.waitForTimeout(350);
 const b=await page.locator('#cv').boundingBox();await page.touchscreen.tap(b.x+b.width*.4,b.y+b.height*.4);
 await page.waitForTimeout(200);
}
async function running(page) {
 try {await page.waitForFunction(()=>window.__snd?.on&&__snd.ctx?.state==='running',{},{timeout:5000});}
 catch(e) {console.error('Audio state',await page.evaluate(()=>({on:__snd.on,context:__snd.ctx?.state,contextAPI:typeof AudioContext,button:document.getElementById('soundBtn').textContent,toasts:document.getElementById('toasts').textContent,session:navigator.audioSession?.type})));throw e;}
 assert.equal(await page.locator('#soundBtn').getAttribute('aria-pressed'),'true');
}
async function observe(page) {
 await page.evaluate(()=>{
  const c=__snd.ctx;
  window.audioProbe={};
  for(const bus of ['out','musicBus','master']) {
   const a=c.createAnalyser();a.fftSize=2048;__snd[bus].connect(a);audioProbe[bus]=a;
  }
 });
}
async function peak(page,bus,duration=900) {
 return page.evaluate(async({bus,duration})=>{
  const a=audioProbe[bus],data=new Float32Array(a.fftSize);let max=0;
  const until=performance.now()+duration;
  do {a.getFloatTimeDomainData(data);for(const n of data)max=Math.max(max,Math.abs(n));await new Promise(r=>setTimeout(r,25));}while(performance.now()<until);
  return max;
 },{bus,duration});
}
async function audioFlow(browser,engine,width,height) {
 const context=await browser.newContext({...devices['iPhone 15 Pro Max'],viewport:{width,height}});
 const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base);assert.equal(await page.evaluate(()=>__snd.ctx),null,'audio started before play gesture');
 const supported=await page.evaluate(()=>!!(window.AudioContext||window.webkitAudioContext));
 if(!supported) {
  await deploy(page);assert.equal(await page.locator('#soundBtn').innerText(),'Sound unavailable');
  await page.locator('#soundBtn').tap();assert.equal(await page.locator('#soundBtn').getAttribute('aria-pressed'),'false');
  await page.locator('#controlsHelp').tap();await page.locator('#audioTest').tap();
  assert.match(await page.locator('#audioStatus').innerText(),/unavailable/);
  await page.locator('#controlsDialog form button').tap();
  const t=await page.evaluate(()=>__mra().t);await page.waitForTimeout(180);assert((await page.evaluate(()=>__mra().t))>t);
  assert.deepEqual(errors,[]);
  results.push({engine,size:[width,height],fallback:'PASS: unavailable audio clearly labelled; help and game continue',waveform:'UNVERIFIED: this WebKit build has no Web Audio API',errors});
  console.log('PASS unavailable-audio fallback',engine,`${width}x${height}`,'PLAYBACK UNVERIFIED');await context.close();return;
 }
 await deploy(page);await running(page);await observe(page);
 const music=await peak(page,'musicBus',1600);assert(music>.0001,'music bus is silent');
 const output=await peak(page,'out',300);assert(output>.0001,'master output is silent');
 await page.locator('#soundBtn').tap();assert.equal(await page.locator('#soundBtn').innerText(),'Sound off');
 await page.waitForTimeout(500);assert(await peak(page,'out',200)<.00001,'mute still outputs audio');
 await page.locator('#soundBtn').tap();await running(page);assert(await peak(page,'out',500)>.0001,'unmute silent');
 // Recorded Hebrew voice from an actual unit selection, with music disabled.
 await page.locator('#statsBtn').tap();await page.locator('#musicBtn').tap();
 await page.waitForTimeout(1200);await page.locator('#statsBtn').tap();
 await page.evaluate(()=>{
  const c=__snd.ctx,create=c.createBufferSource.bind(c);
  c.createBufferSource=()=>{const source=create(),start=source.start.bind(source);
   source.start=(...args)=>{const a=c.createAnalyser();a.fftSize=2048;source.connect(a);audioProbe.recordedVoice=a;return start(...args);};return source;};
 });
 await page.locator('#sArmy').tap();
 await page.waitForFunction(()=>audioProbe.recordedVoice);
 const voice=await peak(page,'recordedVoice',1300);assert(voice>.001,'recorded unit acknowledgement silent');
 assert(await page.evaluate(()=>__snd.voice),'voice unexpectedly disabled');
 // Browser audio interruption is simulated at the platform boundary only.
 await page.evaluate(()=>__snd.ctx.suspend());
 await page.waitForFunction(()=>document.getElementById('soundBtn').textContent==='Tap for sound');
 await page.locator('#soundBtn').tap();await running(page);
 assert(await page.evaluate(()=>__snd.on),'retry turned audio off');
 // Rejected platform resumes must not claim that sound is running.
 await page.evaluate(async()=>{await __snd.ctx.suspend();window.originalAudioResume=__snd.ctx.resume.bind(__snd.ctx);__snd.ctx.resume=()=>Promise.reject(new Error('simulated platform block'));});
 await page.locator('#soundBtn').tap();assert.equal(await page.locator('#soundBtn').innerText(),'Tap for sound');
 await page.evaluate(()=>{__snd.ctx.resume=originalAudioResume;});
 await page.locator('#panTool').tap();await running(page);
 // Closed contexts must be rebuilt instead of reusing an unusable graph.
 await page.evaluate(()=>__snd.ctx.close());await page.locator('#soundBtn').tap();await running(page);await observe(page);
 await page.locator('#controlsHelp').tap();await page.locator('#audioTest').tap();
 await observe(page);
 const test=await peak(page,'out',350);assert(test>.0001,'test sound silent');
 await page.locator('#controlsDialog form button').tap();
 // Mute persists on reload and a new Deploy; explicit music/voice can enable sound.
 await page.locator('#soundBtn').tap();await page.reload();await deploy(page);
 assert.equal(await page.evaluate(()=>__snd.on),false,'saved mute ignored');
 await page.locator('#statsBtn').tap();await page.locator('#musicBtn').tap();
 await running(page);assert(await page.evaluate(()=>__snd.music),'music toggle failed');
 await page.locator('#statsBtn').tap();
 // Rotation must retain the active context and audible output.
 await observe(page);await page.setViewportSize({width:height,height:width});await page.waitForTimeout(200);
 await running(page);assert(await peak(page,'out',500)>.0001,'rotation silenced audio');
 assert.deepEqual(errors,[]);results.push({engine,size:[width,height],musicPeak:music,outputPeak:output,voicePeak:voice,testPeak:test,audioSession:await page.evaluate(()=>navigator.audioSession?.type||'unsupported'),errors});
 console.log('PASS audio',engine,`${width}x${height}`);await context.close();
}
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));base=process.env.AUDIO_BASE_URL||`http://127.0.0.1:${server.address().port}/`;
 for(const [engine,type] of Object.entries({chromium,webkit})) {
  if(process.argv.includes('--webkit')&&engine!=='webkit')continue;
  if(process.argv.includes('--session-only')&&engine!=='chromium')continue;
  const browser=await type.launch({headless:true});
  try {
   if(process.argv.includes('--session-only'))await sessionContract(browser);
   else {for(const size of process.argv.includes('--smoke')?[[932,300]]:[[430,932],[932,300]])await audioFlow(browser,engine,...size);if(engine==='chromium')await sessionContract(browser);}
  }finally{await browser.close();}
 }
 console.log(JSON.stringify(results,null,2));console.log('AUDIO_PASS');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>server.close());
