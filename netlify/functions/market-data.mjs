import ecb from '../lib/ecb.mjs';
import webstat from '../lib/webstat.mjs';

// Une règle Netlify couvre les deux fournisseurs de données publiques.
// Le chemin natif de cette fonction ne doit pas contourner la règle publique.
export default async function handler(request){
 const path=new URL(request.url).pathname;
 if(path==='/api/market-data/ecb')return ecb(request);
 if(path==='/api/market-data/webstat')return webstat(request);
 return Response.json({error:'Page introuvable.'},{status:404,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','X-Robots-Tag':'noindex'}});
}
export const config={path:'/api/market-data/:provider',rateLimit:{windowLimit:60,windowSize:60,aggregateBy:['ip','domain']}};
