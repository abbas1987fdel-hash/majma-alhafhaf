import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
const source = await readFile(new URL('../public/sw.js', import.meta.url), 'utf8');
function worker({failInstall=false}={}) {
  const listeners = {}, stores = new Map();
  const origin='https://example.test/majma-alhafhaf/';
  const key=input => new URL(typeof input==='string'?input:input.url??String(input),origin).href;
  let fetched=0, activated=false;
  const caches={
    async open(name) {
      if (!stores.has(name)) stores.set(name,new Map());
      const entries=stores.get(name);
      return {
        async addAll(requests) {if(failInstall)throw Error('network');for(const request of requests)entries.set(key(request),new Response(key(request)));},
        async match(request) {return entries.get(key(request))?.clone();},
      };
    },
    async delete(name){return stores.delete(name);},
    async match(request){for(const entries of stores.values()){const response=entries.get(key(request));if(response)return response.clone();}},
  };
  const self={__HAFHAF_SHELL__:{version:'test',assets:['index.html','assets/app.js','assets/app.css','brand.png','manifest.webmanifest']},registration:{scope:origin},clients:{async claim(){}},async skipWaiting(){activated=true;},addEventListener(name,fn){listeners[name]=fn;}};
  vm.runInNewContext(source,{self,caches,URL,Request,Response,fetch:async()=>{fetched++;throw Error('offline');}});
  return {
    stores, get fetched(){return fetched;}, get activated(){return activated;},
    async install(){let result=Promise.resolve();listeners.install({waitUntil(value){result=value;}});await result;},
    async request(path,{mode='cors',method='GET'}={}){let result;listeners.fetch({request:{url:new URL(path,origin).href,mode,method},respondWith(value){result=value;}});return result;},
  };
}
test('installed desktop launch and all precached assets work with network unavailable',async()=>{
  const app=worker();await app.install();assert.equal(app.activated,true);
  const page=await app.request('?app=1',{mode:'navigate'});assert.match(await page.text(),/index.html$/);
  for(const asset of ['assets/app.js','assets/app.css','brand.png','manifest.webmanifest'])assert.ok(await app.request(asset));
  assert.equal(app.fetched,0);
});
test('partial shell install never activates and removes its incomplete cache',async()=>{
  const app=worker({failInstall:true});await assert.rejects(app.install(),/network/);
  assert.equal(app.activated,false);assert.equal(app.stores.size,0);
});
test('API requests and unrelated origins are never intercepted',async()=>{
  const app=worker();await app.install();
  assert.equal(await app.request('https://industrious-walrus-342.convex.cloud/api/query'),undefined);
  assert.equal(await app.request('api/data'),undefined);
  assert.equal(await app.request('index.html',{method:'POST'}),undefined);
});
test('prior release chunks remain accessible to an already-open client',async()=>{
  const app=worker();await app.install();
  app.stores.set('hafhaf-shell-old',new Map([['https://example.test/majma-alhafhaf/assets/old.js',new Response('old chunk')]]));
  assert.equal(await (await app.request('assets/old.js')).text(),'old chunk');
});
