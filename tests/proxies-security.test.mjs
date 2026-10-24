import test from 'node:test';
import assert from 'node:assert/strict';
import {createHandler as ecb,config as ecbConfig} from '../netlify/functions/ecb.mjs';
import {createHandler as webstat,config as webstatConfig} from '../netlify/functions/webstat.mjs';

test('Les proxies refusent les paramètres inconnus, répétés et trop longs sans appel réseau',async()=>{
  for(const factory of [ecb,webstat]){
    const handler=factory({getKey:()=>'',fetcher:()=>assert.fail('Aucun réseau dans ce test')});
    for(const query of ['?series=tec10&series=tec2','?url=https://example.invalid','?range='+'a'.repeat(300)]){
      const response=await handler(new Request('https://example.invalid/.netlify/functions/data'+query));
      assert.equal(response.status,400);assert.equal(response.headers.get('X-Robots-Tag'),'noindex');
      assert.equal(response.headers.get('X-Content-Type-Options'),'nosniff');
    }
  }
});

test('Les quotas sont définis par IP et domaine pour les deux fournisseurs',()=>{
  for(const config of [ecbConfig,webstatConfig]){
    assert.equal(config.rateLimit.windowLimit,60);assert.equal(config.rateLimit.windowSize,60);
    assert.deepEqual(config.rateLimit.aggregateBy,['ip','domain']);
  }
});
