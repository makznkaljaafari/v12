
const CACHE_NAME = 'alshwaia-smart-v3.1-stable';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/index.js', /* NEW: Include the main compiled JS bundle */
  '/metadata.json',
  'https://fonts.googleapis.com/css2?family=Tajawal:wght@400;500;700;900&display=swap',
  'https://cdn-icons-png.flaticon.com/512/628/628283.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS_TO_CACHE))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.map((key) => {
        if (key !== CACHE_NAME) return caches.delete(key);
      })
    ))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);
  
  // استثناء طلبات API من الكاش لضمان حداثة البيانات المالية
  const isApiRequest = 
    url.hostname.includes('supabase.co') || 
    url.hostname.includes('googleapis.com');

  if (isApiRequest) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) return cachedResponse;
      
      return fetch(event.request).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return networkResponse;
      }).catch(() => {
        // العودة لصفحة البداية إذا فشل الاتصال بالملفات الأساسية (أو فشل جلب أي مورد ضمن النطاق)
        if (event.request.mode === 'navigate') {
          // Attempt to return the cached root of the PWA for navigation requests
          return caches.match(self.registration.scope || '/');
        }
      });
    })
  );
});