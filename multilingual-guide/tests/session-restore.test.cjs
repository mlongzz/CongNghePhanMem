const {test}=require('node:test');const assert=require('node:assert/strict');
const fs=require('node:fs');const ts=require('typescript');const vm=require('node:vm');
const load=file=>{const m={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports:m});return m;};
const {restoreOutcome,SESSION_UNVERIFIED_NOTICE}=load('src/services/sessionRestore.ts');
const {screenCopy}=load('src/services/screenI18n.ts');
test('only a real 401 expires the stored session',()=>{
  assert.equal(restoreOutcome(Object.assign(new Error('x'),{status:401})),'expired');
  assert.equal(restoreOutcome(Object.assign(new Error('x'),{status:500})),'unverified');
  assert.equal(restoreOutcome(new TypeError('Failed to fetch')),'unverified');
  assert.equal(restoreOutcome(null),'unverified');
});
test('unverified notice and admin wait message are translated',()=>{
  assert.ok(screenCopy[SESSION_UNVERIFIED_NOTICE]);
  assert.ok(screenCopy['Đang kiểm tra phiên đăng nhập…']);
});
test('context keeps the session unverified, retries on focus and online, and admin does not redirect meanwhile',()=>{
  const ctx=fs.readFileSync('src/context/AppContext.tsx','utf8');
  assert.ok(ctx.includes('restoreOutcome('));
  assert.ok(ctx.includes('setSessionUnverified(true)'));
  assert.ok(ctx.includes("addEventListener('online'"));
  assert.ok(ctx.includes("NativeAppState.addEventListener('change'"));
  const {gateDecision}=load('src/services/authRedirect.ts');
  const base={pathname:'/admin',target:'/admin',hasToken:false,authLoading:false,settled:true,sessionUnverified:true,isAdmin:false,signedOutByUser:false};
  assert.equal(gateDecision(base).kind,'unverified');
  assert.equal(gateDecision({...base,pathname:'/map'}).kind,'unverified');
  assert.equal(gateDecision({...base,authLoading:true}).kind,'unverified');
  assert.equal(gateDecision({...base,pathname:'/login'}).kind,'stay');
  const gate=fs.readFileSync('src/components/AuthGate.tsx','utf8');
  assert.ok(gate.includes('disabled={retrying}'));
});
test('every session notice set by the context has vi/en/fr/ja copy',()=>{
  const ctx=fs.readFileSync('src/context/AppContext.tsx','utf8');
  const notices=[...ctx.matchAll(/setSessionNotice\('([^']+)'\)/g)].map(m=>m[1]);
  assert.ok(notices.length>=1);
  for(const n of notices){assert.ok(screenCopy[n],n);assert.equal(screenCopy[n].length,3);}
});
