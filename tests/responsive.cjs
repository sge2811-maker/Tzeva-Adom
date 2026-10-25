// Focused UI coverage only. No state injection, synthetic victory or full campaign suite.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const {chromium, webkit} = require('playwright');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'));
const server = http.createServer((req, res) => { res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end(html); });
const results = [];
const sizes = [[320,568],[390,664],[430,932],[932,430],[768,1024],[1024,768],[1366,768],[1920,1080],[3840,2160]].filter(([w])=>!process.argv.includes('--quick-layout')||[320,430,932,3840].includes(w));
async function geometry(page) {
  return page.evaluate(() => {
    const rect = id => { const r = document.getElementById(id).getBoundingClientRect(); return {x:r.x,y:r.y,w:r.width,h:r.height,b:r.bottom,r:r.right}; };
    return {width:innerWidth,height:innerHeight,scrollWidth:document.documentElement.scrollWidth,app:rect('app'),stage:rect('stage'),panel:rect('panel'),hud:rect('hud'),tools:rect('mapTools'),layout:document.getElementById('app').dataset.layout};
  });
}
function fits(g) {
  assert(g.scrollWidth <= g.width+1, 'horizontal document overflow');
  assert(g.app.b <= g.height+1 && g.app.r <= g.width+1, 'app exceeds viewport');
  assert(g.panel.b <= g.height+1 && g.panel.x >= 0, 'panel outside viewport');
  assert(g.stage.h >= Math.min(170,g.height*.32) && g.stage.w >= 200, 'battle map too small');
  assert(g.tools.b <= g.height+1 && g.tools.h >= 44, 'map toolbar clipped');
}
async function tap(page, id, touch) { await page.locator('#'+id)[touch?'tap':'click'](); }
async function point(page, id) { const b = await page.locator('#'+id).boundingBox(); return {x:b.x+b.width/2,y:b.y+b.height/2}; }
async function gameStart(page,touch) {
  await tap(page,'startBtn',touch);
  await page.waitForTimeout(350);
  // Skip the real intro with input, not a fixture or state mutation.
  const b=await page.locator('#cv').boundingBox();
  if(touch) await page.touchscreen.tap(b.x+b.width*.45,b.y+b.height*.4); else await page.mouse.click(b.x+b.width*.45,b.y+b.height*.4);
  await page.waitForTimeout(180);
}
async function layoutCases(browser,engine) {
  for(const [width,height] of sizes) {
    const touch=width<1100;
    const context=await browser.newContext({viewport:{width,height},hasTouch:touch,isMobile:touch,deviceScaleFactor:touch?3:1});
    const page=await context.newPage(); const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(base);
    await page.locator('#startBtn').scrollIntoViewIfNeeded();
    assert(await page.locator('#startBtn').isVisible(),'Deploy unreachable');
    await gameStart(page,touch);
    fits(await geometry(page));
    if(await page.locator('#commandsBtn').isVisible()) await tap(page,'commandsBtn',touch);
    for(const id of ['tab-build','tab-train','tab-diplo']) {
      await tap(page,id,touch); await page.waitForTimeout(60); fits(await geometry(page));
      assert(await page.locator('#body-'+id.slice(4)).isVisible(),id+' body unreachable');
    }
    if(await page.locator('#panelToggle').isVisible()) await tap(page,'panelToggle',touch);
    if(await page.locator('#statsBtn').isVisible()) {
      await tap(page,'statsBtn',touch); assert(await page.locator('#meters').isVisible());
      fits(await geometry(page)); await tap(page,'statsBtn',touch);
    }
    await tap(page,'controlsHelp',touch);
    assert(await page.locator('#controlsDialog').isVisible(),'help inaccessible');
    await page.locator('#controlsDialog form button')[touch?'tap':'click']();
    assert.equal(await page.locator('#controlsDialog').isVisible(),false);
    // The clock must continue through layout and panel changes.
    const time=await page.evaluate(()=>__mra().t); await page.waitForTimeout(180);
    assert((await page.evaluate(()=>__mra().t))>time,'simulation stopped');
    assert.deepEqual(errors,[],'runtime errors');
    results.push({engine,size:[width,height],...(await geometry(page)),errors});
    console.log('PASS',engine,width+'x'+height);
    await context.close();
  }
}
async function landscapeCases(browser,engine) {
  // Short visible heights represent browser chrome, not just the phone's full screen.
  for(const [width,height,safe] of [[932,430,59],[932,300,59],[852,300,59],[667,280,0],[568,280,0]]) {
    const context=await browser.newContext({viewport:{width,height},hasTouch:true,isMobile:true,deviceScaleFactor:3});
    const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(base);
    // Only CSS environment inputs are simulated; game state is never modified.
    await page.addStyleTag({content:`:root{--safe-left:${safe}px;--safe-right:${safe}px;--safe-bottom:21px;}`});
    await page.locator('#startBtn').scrollIntoViewIfNeeded();await gameStart(page,true);
    await tap(page,'pauseBtn',true);
    const closed=await geometry(page);fits(closed);
    assert.equal(closed.layout,'landscape');
    assert.equal(await page.locator('#panel').isVisible(),false,'drawer should start closed');
    assert(closed.stage.w>=width-2*safe-1,'sidebar still steals landscape width');
    assert(closed.stage.h>=height*.54,'landscape HUD and controls crowd the map');
    for(const id of ['commandsBtn','panTool','selectTool','zoomIn','zoomOut','zoomHome','fitMap','controlsHelp']) {
      const b=await page.locator('#'+id).boundingBox();
      assert(b.width>=44&&b.height>=44,id+' touch target too small');
      assert(b.x>=safe-1&&b.x+b.width<=width-safe+1,id+' outside safe area');
      assert(b.y+b.height<=height-20,id+' behind home indicator');
    }
    await tap(page,'sArmy',true);
    const identity=await page.evaluate(()=>__mra().ents.map(e=>e.id));
    const orders=()=>page.evaluate(()=>JSON.stringify(__mra().ents.filter(e=>e.side==='israel'&&e.kind==='unit').map(e=>e.order)));
    const priorOrders=await orders();
    await tap(page,'commandsBtn',true);
    for(const tab of ['build','train','diplo']) {
      await tap(page,'tab-'+tab,true);assert(await page.locator('#body-'+tab).isVisible());
      const g=await geometry(page);fits(g);assert.equal(g.stage.w,closed.stage.w);assert.equal(g.stage.h,closed.stage.h);
      assert(g.panel.x>=safe&&g.panel.r<=width-safe,'drawer under notch');
      assert(g.panel.y>=g.hud.b&&g.panel.b<=g.tools.y,'drawer clips HUD or map tools: '+JSON.stringify(g));
    }
    // A real production tap in a scrollable short drawer must reach the engine.
    await tap(page,'tab-build',true);
    const credits=await page.evaluate(()=>__mra().sides.israel.credits);
    await page.locator('#gridBuild button').filter({hasText:'Iron Dome Battery'}).tap();
    assert((await page.evaluate(()=>__mra().sides.israel.credits))<credits,'landscape production failed');
    // First map tap dismisses commands without accidentally moving the selected army.
    await page.touchscreen.tap(closed.stage.x+35,closed.stage.y+closed.stage.h*.45);
    assert.equal(await page.locator('#panel').isVisible(),false);
    assert.equal(await orders(),priorOrders,'drawer dismissal also issued an order');
    await tap(page,'statsBtn',true);assert(await page.locator('#meters').isVisible());
    assert.equal((await geometry(page)).stage.h,closed.stage.h,'stats shrink short battlefield');
    await tap(page,'statsBtn',true);
    // Rotation keeps physical unit size, not a fraction of a much shorter screen.
    await tap(page,'zoomHome',true);
    const separation=()=>page.evaluate(()=>{const u=__mra().ents.filter(e=>e.side==='israel'&&e.kind==='unit');const a=__scr(u[0]),b=__scr(u[1]);return Math.hypot(b.x-a.x,b.y-a.y);});
    const distance=await separation();
    await page.setViewportSize({width:430,height:932});await page.waitForTimeout(180);
    await page.setViewportSize({width,height});await page.waitForTimeout(180);
    assert(Math.abs(await separation()-distance)<.2,'rotation changed unit size');
    assert.deepEqual(await page.evaluate(()=>__mra().ents.map(e=>e.id)),identity,'rotation recreated mission');
    assert(await page.locator('#sClear').isVisible(),'rotation lost army selection');
    // A second tap after drawer dismissal must still select/order normally.
    const b=await page.locator('#cv').boundingBox();
    await page.touchscreen.tap(b.x+b.width*.36,b.y+b.height*.48);
    assert.notEqual(await orders(),priorOrders,'map input stuck after drawer dismissal');
    if(process.env.RESPONSIVE_SHOTS) {
      await page.screenshot({path:path.join(process.env.RESPONSIVE_SHOTS,`landscape-v47-${engine}-${width}x${height}.png`)});
      await tap(page,'commandsBtn',true);await tap(page,'tab-build',true);
      await page.screenshot({path:path.join(process.env.RESPONSIVE_SHOTS,`landscape-v47-${engine}-${width}x${height}-drawer.png`)});
    }
    assert.deepEqual(errors,[]);results.push({engine,landscape:[width,height],safe,stage:closed.stage,errors});
    console.log('PASS landscape',engine,`${width}x${height}`,`safe=${safe}`);await context.close();
  }
}
async function interactions(browser,engine) {
  const context=await browser.newContext({viewport:{width:430,height:932},hasTouch:true,isMobile:true,deviceScaleFactor:3});
  const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base);await gameStart(page,true);await tap(page,'pauseBtn',true);
  await tap(page,'sArmy',true);
  assert.match(await page.locator('#selbar').innerText(),/Clear/,'army selection failed');
  const b=await page.locator('#cv').boundingBox();
  await page.touchscreen.tap(b.x+b.width*.28,b.y+b.height*.45);
  assert(await page.evaluate(()=>__mra().ents.some(e=>e.side==='israel'&&e.kind==='unit'&&e.order)),'touch order not recorded');
  const unitsBefore=await page.evaluate(()=>__mra().ents.filter(e=>e.side==='israel'&&e.kind==='unit').map(e=>[e.id,e.x,e.y]));
  await tap(page,'pauseBtn',true);await page.waitForTimeout(700);await tap(page,'pauseBtn',true);
  const moved=await page.evaluate(before=>before.some(([id,x,y])=>{const e=__mra().ents.find(e=>e.id===id);return e&&Math.hypot(e.x-x,e.y-y)>.1;}),unitsBefore);
  assert(moved,'ordered army did not move');
  // Read-only camera projection makes a real pan observable without changing state.
  const projection=()=>page.evaluate(()=>__scr(__mra().ents.find(e=>e.side==='israel'&&e.kind==='struct')));
  const before=await projection();await tap(page,'panTool',true);
  // Trusted mouse drag exercises the shared pointer path on both engines.
  await page.mouse.move(b.x+b.width*.35,b.y+b.height*.5);await page.mouse.down();
  await page.mouse.move(b.x+b.width*.35+45,b.y+b.height*.5+35,{steps:5});await page.mouse.up();
  const after=await projection();assert(Math.hypot(after.x-before.x,after.y-before.y)>10,'pan did not move camera');
  if(engine==='chromium') {
    const cdp=await context.newCDPSession(page);
    const start=[{x:b.x+140,y:b.y+220},{x:b.x+220,y:b.y+280}];
    const projectedDistance=()=>page.evaluate(()=>{const u=__mra().ents.filter(e=>e.side==='israel'&&e.kind==='unit');const a=__scr(u[0]),b=__scr(u[1]);return Math.hypot(b.x-a.x,b.y-a.y);});
    const distance=await projectedDistance();
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:start});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:start[0].x-35,y:start[0].y-35},{x:start[1].x+35,y:start[1].y+35}]});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    assert((await projectedDistance())>distance*1.1,'pinch did not zoom');
    const p=await projection();
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:b.x+120,y:b.y+230}]});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:b.x+170,y:b.y+260}]});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    const q=await projection();assert(Math.hypot(p.x-q.x,p.y-q.y)>10,'one-finger pan did not move camera');
    // An interrupted touch must not poison the next real tap.
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:b.x+120,y:b.y+230}]});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});
    await cdp.detach();
  }
  await tap(page,'selectTool',true);assert.equal(await page.locator('#selectTool').getAttribute('aria-pressed'),'true');
  await tap(page,'zoomHome',true);
  await tap(page,'sClear',true);
  const unitPoint=await page.evaluate(()=>__mra().ents.filter(e=>e.side==='israel'&&e.kind==='unit').map(e=>__scr(e)).find(p=>p.x>30&&p.x<350&&p.y>40&&p.y<620));
  assert(unitPoint,'no visible unit to box select');
  await page.mouse.move(b.x+unitPoint.x-24,b.y+unitPoint.y-24);await page.mouse.down();
  await page.mouse.move(b.x+unitPoint.x+24,b.y+unitPoint.y+24,{steps:5});await page.mouse.up();
  assert(await page.locator('#sClear').isVisible(),'drag box did not select units');
  await page.locator('#cv').focus();
  const keyBefore=await projection();await page.keyboard.press('ArrowLeft');const keyAfter=await projection();
  assert(Math.hypot(keyBefore.x-keyAfter.x,keyBefore.y-keyAfter.y)>1,'keyboard map pan failed');
  // Re-orient a running mission; identity, selection and clock must survive.
  const identity=await page.evaluate(()=>{const g=__mra();return {seed:g.seed,ids:g.ents.map(e=>e.id),t:g.t};});
  await page.setViewportSize({width:932,height:430});await page.waitForTimeout(180);fits(await geometry(page));
  assert.deepEqual(await page.evaluate(()=>__mra().ents.map(e=>e.id)),identity.ids,'rotation recreated game');
  assert.match(await page.locator('#selbar').innerText(),/Clear/,'rotation lost selection');
  await page.setViewportSize({width:430,height:664});await page.waitForTimeout(180);fits(await geometry(page));
  await tap(page,'tab-build',true);
  const credits=await page.evaluate(()=>__mra().sides.israel.credits);
  const card=page.locator('#gridBuild button').filter({hasText:'Iron Dome Battery'});
  await card.tap();assert((await page.evaluate(()=>__mra().sides.israel.credits))<credits,'build tap not accepted');
  assert.deepEqual(errors,[]);
  // Follow the actual campaign menu -> briefing -> battle path in a fresh profile.
  const campaign=await context.newPage();campaign.on('pageerror',e=>errors.push(e.message));
  await campaign.setViewportSize({width:852,height:300});
  await campaign.goto(base);await tap(campaign,'msnCoal',true);await tap(campaign,'mStart',true);
  assert(await campaign.locator('#cut').isVisible(),'mission briefing did not open');
  await tap(campaign,'cutSkip',true);await tap(campaign,'cutDeploy',true);
  await campaign.waitForTimeout(350);fits(await geometry(campaign));
  assert.equal(await campaign.locator('#missions').isVisible(),false);
  assert.equal(await campaign.evaluate(()=>__mra().mission.def.n),1);
  await tap(campaign,'commandsBtn',true);await tap(campaign,'tab-orders',true);
  assert(await campaign.locator('#body-orders').isVisible(),'landscape mission objectives unreachable');
  await tap(campaign,'panelToggle',true);assert.equal(await campaign.locator('#panel').isVisible(),false);
  assert.deepEqual(errors,[]);
  results.push({engine,interactions:'selection, order, movement, pan, zoom, rotation, production, campaign briefing',errors});
  await context.close();
}
let base;
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));base=`http://127.0.0.1:${server.address().port}/`;
 for(const [engine,type] of Object.entries({chromium,webkit})) {
  if(process.argv.includes('--webkit')&&engine!=='webkit')continue;
  const browser=await type.launch({headless:true});
  try {
    if(process.argv.includes('--landscape-only'))await landscapeCases(browser,engine);
    else {
      if(!process.argv.includes('--interactions'))await layoutCases(browser,engine);
      if(!process.argv.includes('--layout-only')) {await interactions(browser,engine);if(!process.argv.includes('--skip-landscape'))await landscapeCases(browser,engine);}
    }
  } finally {await browser.close();}
 }
 console.log(JSON.stringify(results,null,2));console.log('RESPONSIVE_UI_PASS');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>server.close());
