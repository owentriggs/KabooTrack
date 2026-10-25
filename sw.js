// Offline support. The app opens from the cache straight away and refreshes the cache in the background.
// The deploy workflow replaces "dev" with the commit id so each release gets a fresh cache.
var VERSION='dev';
var CACHE='kaboo-'+VERSION;
var FONTS='kaboo-fonts';
var SHELL=['./','index.html','scan.js','manifest.webmanifest','icon.svg','icon-180.png','icon-192.png','icon-512.png','icon-maskable-512.png'];

self.addEventListener('install',function(e){
  e.waitUntil(caches.open(CACHE).then(function(c){return c.addAll(SHELL);}).then(function(){return self.skipWaiting();}));
});
self.addEventListener('activate',function(e){
  e.waitUntil(caches.keys().then(function(keys){
    return Promise.all(keys.filter(function(k){return k!==CACHE&&k!==FONTS;}).map(function(k){return caches.delete(k);}));
  }).then(function(){return self.clients.claim();}));
});

function refresh(cache,req,key){
  return fetch(req).then(function(res){
    if(res&&(res.ok||res.type==='opaque'))cache.put(key||req,res.clone());
    return res;
  });
}

self.addEventListener('fetch',function(e){
  var req=e.request;
  if(req.method!=='GET')return;
  var url=new URL(req.url);

  // Google Fonts: keep the first copy, it never changes.
  if(url.hostname==='fonts.googleapis.com'||url.hostname==='fonts.gstatic.com'){
    e.respondWith(caches.open(FONTS).then(function(c){
      return c.match(req).then(function(hit){return hit||refresh(c,req);});
    }).catch(function(){return new Response('',{status:503});}));
    return;
  }
  if(url.origin!==self.location.origin)return;

  // Pages always resolve to the cached app.
  var key=req.mode==='navigate'?'index.html':req;
  e.respondWith(caches.open(CACHE).then(function(c){
    return c.match(key,{ignoreSearch:req.mode==='navigate'}).then(function(hit){
      var net=refresh(c,req,key).catch(function(){return hit;});
      if(hit){e.waitUntil(net);return hit;}
      return net;
    });
  }));
});
