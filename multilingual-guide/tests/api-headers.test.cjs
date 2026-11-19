const {test}=require('node:test');const assert=require('node:assert/strict');
const fs=require('node:fs');const ts=require('typescript');const vm=require('node:vm');
function load(globals){
  const exports={};
  const code=ts.transpileModule(fs.readFileSync('src/services/api.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  vm.runInNewContext(code,{exports,process:{env:{EXPO_PUBLIC_API_URL:'http://test.invalid'}},AbortController,setTimeout,clearTimeout,Error,TypeError,...globals});
  return exports;
}
test('content type is only sent when there is a body',async()=>{
  const seen=[];
  const api=load({fetch:async(url,options)=>{seen.push(options.headers);return {ok:true,status:200,json:async()=>({})};}});
  await api.apiFetch('/places');
  await api.apiFetch('/favorites',{token:'t'});
  await api.apiFetch('/favorites',{token:'t',method:'POST',body:'{}'});
  assert.equal(JSON.stringify(seen[0]),'{}');
  assert.equal(JSON.stringify(seen[1]),'{"Authorization":"Bearer t"}');
  assert.equal(seen[2]['Content-Type'],'application/json');
  assert.equal(seen[2].Authorization,'Bearer t');
});

test('the account token is never attached to URLs outside the API base',async()=>{
  const seen=[];
  const api=load({fetch:async(url,options)=>{seen.push({url,headers:options.headers||{}});return {ok:true,status:200,json:async()=>({})};}});
  api.setTokenProvider(()=>'secret');
  await api.fetchWithAccount('https://vi.wikipedia.org/w/api.php?x=1',{headers:{Accept:'application/json'}});
  await api.fetchWithAccount('https://tile.openstreetmap.org/1/2/3.png',{});
  await api.fetchWithAccount('http://test.invalid.evil.example/osm',{});
  await api.fetchWithAccount('http://test.invalid@evil.example/osm',{});
  await api.fetchWithAccount('http://test.invalidx/osm',{});
  for(const call of seen)assert.equal(call.headers.Authorization,undefined,call.url);
  assert.equal(seen.length,5);
  await api.fetchWithAccount('http://test.invalid/osm/nearby',{});
  assert.equal(seen[5].headers.Authorization,'Bearer secret');
});

test('apiFetch does not attach a token to absolute URLs, explicit tokens included',async()=>{
  const seen=[];
  const api=load({fetch:async(url,options)=>{seen.push({url,headers:options.headers||{}});return {ok:true,status:200,json:async()=>({})};}});
  api.setTokenProvider(()=>'secret');
  for(const target of ['https://evil.example/steal','//evil.example/steal','http://test.invalid/places','HTTPS://evil.example/x'])
    for(const options of [undefined,{token:'explicit'}])await api.apiFetch(target,options);
  assert.equal(seen.length,8);
  for(const call of seen){assert.equal(call.headers.Authorization,undefined,call.url);assert.ok(!call.url.startsWith('http://test.invalidhttps'),call.url);}
  await api.apiFetch('/places');
  assert.equal(seen[8].url,'http://test.invalid/places');
  assert.equal(seen[8].headers.Authorization,'Bearer secret');
});
