
const backdropImage = document.getElementById("backdropImage");
const quoteText = document.getElementById("quoteText");
const quoteAuthor = document.getElementById("quoteAuthor");
const headlinePanel = document.getElementById("headlinePanel");

// Toggle GPU WebGL renderer when present via URL param `?webgl=1` or `?lively=1`.
const qs = new URLSearchParams(location.search);
const USE_WEBGL = qs.has('webgl') || qs.has('lively');

// Auto-detect Lively host using several heuristics; if detected, enable strict lightweight mode.
function detectLivelyHost() {
  try {
    if (qs.has('lively')) return true;
    const ua = (navigator && navigator.userAgent) ? navigator.userAgent.toLowerCase() : '';
    if (ua.includes('lively') || ua.includes('livelywallpaper') || ua.includes('lively-wallpaper')) return true;
    if (typeof window.external !== 'undefined') {
      // some hosts expose external APIs; try a safe check for any key containing 'lively'
      try {
        for (const k in window.external) {
          if (/lively/i.test(k)) return true;
        }
      } catch {}
    }
  } catch {}
  return false;
}

const LIGHTWEIGHT_MODE = detectLivelyHost();

// In lightweight mode (Lively), avoid expensive CPU/image work and aggressive caching.
let WG_CACHE_ENABLED = !LIGHTWEIGHT_MODE;
const DONT_CROP = !!LIGHTWEIGHT_MODE;
if (LIGHTWEIGHT_MODE) {
  // reduce concurrency to avoid CPU spikes in host
  // Note: processAndCropImage checks concurrency via _wgProcessingCount
  // and PROCESS_CONCURRENCY is used elsewhere; override conservatively here.
  // eslint-disable-next-line no-unused-vars
  var PROCESS_CONCURRENCY = 0;
}

// WebGL runtime safety: disable WebGL renderer after repeated failures
const WG_WEBGL_ERROR_MAX = 3;
let _wgWebglErrorCount = 0;
let _wgWebglDisabled = false;

// Prune blob: URLs to avoid unbounded growth which can cause memory pressure
function pruneBlobUrls(max = 60) {
  try {
    while (_wgCreatedBlobUrls.size > max) {
      const it = _wgCreatedBlobUrls.values().next();
      if (it.done) break;
      const url = it.value;
      try { URL.revokeObjectURL(url); } catch {}
      _wgCreatedBlobUrls.delete(url);
    }
  } catch {}
}

async function safeRenderWebgl(url) {
  if (LIGHTWEIGHT_MODE) return false;
  if (_wgWebglDisabled) return false;
  if (!window.WGWebGL || !WGWebGL.isAvailable || !WGWebGL.isAvailable()) return false;
  try {
    const ok = await WGWebGL.renderImage(url);
    if (!ok) throw new Error('WGWebGL.renderImage returned false');
    _wgWebglErrorCount = 0;
    return true;
  } catch (e) {
    _wgWebglErrorCount += 1;
    console.warn('WGWebGL render error', e, 'count', _wgWebglErrorCount);
    if (_wgWebglErrorCount >= WG_WEBGL_ERROR_MAX) {
      _wgWebglDisabled = true;
      try { WGWebGL.dispose(); } catch {}
      const wc = document.getElementById('webglContainer');
      if (wc) wc.style.display = 'none';
      console.warn('WGWebGL disabled after repeated errors');
    }
    return false;
  }
}


const AUTO_ROTATE_MS = 2 * 60 * 1000; // 2 minutes
const CROSSFADE_MS = 900;
const QUOTE_FADE_MS = 520;
const RECONNECT_INTERVAL_MS = 30_000;
const IMAGE_BATCH_SIZE = 30;
// Minimum time between manual/automatic loadNext calls (ms)
const LOAD_DEBOUNCE_MS = 800;
let _lastLoadMs = 0;
const PICSUM_TOTAL_PAGES = 33;
const QUOTES_API = "https://zenquotes.io/api/quotes";
const FONTS_API = "https://api.fontsource.org/v1/fonts";

const CACHE_NAME = 'wallgen-image-cache-v1';
const CACHE_MANIFEST_KEY = 'wg_cache_map';
const CACHE_MAX_AGE_MS = 5 * 24 * 60 * 60 * 1000; 

function loadCacheManifest() {
  try {
    return JSON.parse(safeGetItem(CACHE_MANIFEST_KEY) || '{}');
  } catch {
    return {};
  }
}

function saveCacheManifest(manifest) {
  try {
    safeSetItem(CACHE_MANIFEST_KEY, JSON.stringify(manifest));
  } catch {}
}

async function cacheImageRemote(url) {
  if (!WG_CACHE_ENABLED) return false;
  if (!url || url.startsWith('data:') || url.startsWith('blob:')) return false;
  // Schedule caching during idle to avoid blocking critical work
  return new Promise((resolve) => {
    const work = async () => {
      try {
        const cache = await caches.open(CACHE_NAME);
        const resp = await fetch(url, { mode: 'cors', cache: 'no-store' });
        if (!resp.ok) return resolve(false);
        await cache.put(url, resp.clone());
        const manifest = loadCacheManifest();
        manifest[url] = Date.now();
        // Keep manifest bounded: remove oldest if too many keys
        const keys = Object.keys(manifest);
        if (keys.length > 400) {
          const sorted = keys.sort((a, b) => manifest[a] - manifest[b]);
          for (let i = 0; i < sorted.length - 300; i++) delete manifest[sorted[i]];
        }
        saveCacheManifest(manifest);
        resolve(true);
      } catch (e) {
        resolve(false);
      }
    };

    if (window.requestIdleCallback) {
      requestIdleCallback(() => work(), { timeout: 2000 });
    } else {
      setTimeout(() => work(), 300);
    }
  });
}

async function getCachedBlobUrl(url) {
  try {
    const cache = await caches.open(CACHE_NAME);
    const match = await cache.match(url);
    if (!match) return null;
    const blob = await match.blob();
    const obj = URL.createObjectURL(blob);
    _wgCreatedBlobUrls.add(obj);
    pruneBlobUrls(60);
    return obj;
  } catch {
    return null;
  }
}

async function cleanupOldCache() {
  try {
    const manifest = loadCacheManifest();
    const cache = await caches.open(CACHE_NAME);
    let changed = false;
    const now = Date.now();
    for (const [key, ts] of Object.entries(manifest)) {
      if (now - ts > CACHE_MAX_AGE_MS) {
        try {
          await cache.delete(key);
        } catch {}
        delete manifest[key];
        changed = true;
      }
    }
    if (changed) saveCacheManifest(manifest);
  } catch {}
}

// Load cached scenes into the runtime pool (called at boot)
async function loadCachedScenesToPool() {
  try {
    const manifest = loadCacheManifest();
    const urls = Object.keys(manifest || {});
    const scenes = [];
    for (let i = 0; i < urls.length; i++) {
      const url = urls[i];
      const blobUrl = await getCachedBlobUrl(url);
      if (!blobUrl) continue;
      scenes.push({ id: `cached-${i}`, name: 'Cached', image: blobUrl, alt: 'Cached image' });
    }
    if (scenes.length) {
      // Prepend cached scenes so they're used before fetching new ones when offline
      imagePool = scenes.concat(imagePool);
    }
  } catch {}
}

function safeGetItem(key) {
  try {
    return localStorage.getItem(key);
  } catch { return null; }
}
function safeSetItem(key, val) {
  try {
    localStorage.setItem(key, val);
  } catch {}
}
function safeRemoveItem(key) {
  try { localStorage.removeItem(key); } catch {}
}

function saveSession() {
  try {
    safeSetItem('wg_imagePool', JSON.stringify(imagePool));
    safeSetItem('wg_quotePool', JSON.stringify(quotePool));
    safeSetItem('wg_fontPool', JSON.stringify(fontPool));
    safeSetItem('wg_usedImageIds', JSON.stringify([...usedImageIds]));
    safeSetItem('wg_usedQuoteTexts', JSON.stringify([...usedQuoteTexts]));
    safeSetItem('wg_usedFontIds', JSON.stringify([...usedFontIds]));
    safeSetItem('wg_lastScene', activeImageUrl || "");
    safeSetItem('wg_lastQuote', activeQuoteText || "");
    safeSetItem('wg_usedFallbackImageIds', JSON.stringify([...usedFallbackImageIds]));
    safeSetItem('wg_usedFallbackQuoteTexts', JSON.stringify([...usedFallbackQuoteTexts]));
  } catch {}
}

function loadSession() {
  try {
    const imgPool = JSON.parse(safeGetItem('wg_imagePool') || '[]');
    const qtPool = JSON.parse(safeGetItem('wg_quotePool') || '[]');
    const ftPool = JSON.parse(safeGetItem('wg_fontPool') || '[]');
    imagePool = Array.isArray(imgPool) ? imgPool : [];
    quotePool = Array.isArray(qtPool) ? qtPool : [];
    fontPool = Array.isArray(ftPool) ? ftPool : [];
    // sets
    const usedImg = JSON.parse(safeGetItem('wg_usedImageIds') || '[]');
    usedImg && usedImg.forEach(id => usedImageIds.add(id));
    const usedQ = JSON.parse(safeGetItem('wg_usedQuoteTexts') || '[]');
    usedQ && usedQ.forEach(t => usedQuoteTexts.add(t));
    const usedF = JSON.parse(safeGetItem('wg_usedFontIds') || '[]');
    usedF && usedF.forEach(id => usedFontIds.add(id));
    // fallback
    const fbi = JSON.parse(safeGetItem('wg_usedFallbackImageIds') || '[]');
    fbi && fbi.forEach(id => usedFallbackImageIds.add(id));
    const fbq = JSON.parse(safeGetItem('wg_usedFallbackQuoteTexts') || '[]');
    fbq && fbq.forEach(t => usedFallbackQuoteTexts.add(t));
  } catch {}
}

// Call session save regularly and before unload
window.addEventListener('beforeunload', saveSession);
setInterval(saveSession, 60000);

/* ─── Offline Fallback Library (only used when internet is down) ─── */
const offlineFallbackScenes = [
  { id: "fb-1", name: "Glacial Ridge", image: "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=2200&q=80", alt: "Misty mountain valley at sunrise." },
  { id: "fb-2", name: "Forest Canopy", image: "https://images.unsplash.com/photo-1441974231531-c6227db76b6e?auto=format&fit=crop&w=2200&q=80", alt: "Deep green forest lit by filtered sunlight." },
  { id: "fb-3", name: "Open Water", image: "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=2200&q=80", alt: "Ocean horizon glowing under soft evening light." },
  { id: "fb-4", name: "High Summit", image: "https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?auto=format&fit=crop&w=2200&q=80", alt: "Sharp mountain peaks rising above layered clouds." },
  { id: "fb-5", name: "Desert Lines", image: "https://images.unsplash.com/photo-1501785888041-af3ef285b470?auto=format&fit=crop&w=2200&q=80", alt: "Wind-shaped desert ridges stretching toward the horizon." },
  { id: "fb-6", name: "Night Grid", image: "https://images.unsplash.com/photo-1477959858617-67f85cf4f1df?auto=format&fit=crop&w=2200&q=80", alt: "Dense city skyline glowing at night." },
  { id: "fb-7", name: "Aurora Field", image: "https://images.unsplash.com/photo-1531366936337-7c912a4589a7?auto=format&fit=crop&w=2200&q=80", alt: "Night sky washed with aurora above a quiet landscape." },
  { id: "fb-8", name: "Canyon Light", image: "https://images.unsplash.com/photo-1508261305436-4f2f92f2f3b5?auto=format&fit=crop&w=2200&q=80", alt: "Warm canyon walls catching late sunlight." },
  { id: "fb-9", name: "Still Lake", image: "https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=2200&q=80", alt: "Mirror-like lake surrounded by dark pines and mountains." },
  { id: "fb-10", name: "Winter Pass", image: "https://images.unsplash.com/photo-1482192505345-5655af888cc4?auto=format&fit=crop&w=2200&q=80", alt: "Snow-covered peaks under a clear blue sky." },
  { id: "fb-11", name: "Coastal Road", image: "https://images.unsplash.com/photo-1500534314209-a25ddb2bd429?auto=format&fit=crop&w=2200&q=80", alt: "A winding road tracing a rugged coastline." },
  { id: "fb-12", name: "Glass Geometry", image: "https://images.unsplash.com/photo-1511818966892-d7d671e672a2?auto=format&fit=crop&w=2200&q=80", alt: "Modern architecture framed against a bright sky." }
];

const offlineFallbackQuotes = [
  { text: "The only way to do great work is to love what you do.", author: "Steve Jobs" },
  { text: "In the middle of difficulty lies opportunity.", author: "Albert Einstein" },
  { text: "It does not matter how slowly you go as long as you do not stop.", author: "Confucius" },
  { text: "What you get by achieving your goals is not as important as what you become.", author: "Zig Ziglar" },
  { text: "Believe you can and you're halfway there.", author: "Theodore Roosevelt" },
  { text: "The best time to plant a tree was 20 years ago. The second best time is now.", author: "Chinese Proverb" },
  { text: "Your limitation — it's only your imagination.", author: "Unknown" },
  { text: "Great things never come from comfort zones.", author: "Unknown" },
  { text: "Dream it. Wish it. Do it.", author: "Unknown" },
  { text: "The harder you work for something, the greater you'll feel when you achieve it.", author: "Unknown" },
  { text: "Wake up with determination. Go to bed with satisfaction.", author: "Unknown" },
  { text: "Do something today that your future self will thank you for.", author: "Sean Patrick Flanery" },
  { text: "It's going to be hard, but hard does not mean impossible.", author: "Unknown" },
  { text: "Stay patient and trust your journey.", author: "Unknown" },
  { text: "Every champion was once a contender that refused to give up.", author: "Rocky Balboa" },
  { text: "Keep moving. Quiet progress still changes your horizon.", author: "WallGen" },
  { text: "What feels slow today becomes your edge tomorrow.", author: "WallGen" },
  { text: "Show up again. Consistency gives luck somewhere to land.", author: "WallGen" },
  { text: "You don't have to be great to start, but you have to start to be great.", author: "Zig Ziglar" },
  { text: "The secret of getting ahead is getting started.", author: "Mark Twain" },
  { text: "It always seems impossible until it's done.", author: "Nelson Mandela" },
  { text: "Hardships often prepare ordinary people for an extraordinary destiny.", author: "C.S. Lewis" },
  { text: "Work hard in silence, let your success be the noise.", author: "Frank Ocean" },
  { text: "Things work out best for those who make the best of how things work out.", author: "John Wooden" },
  { text: "To live a creative life, we must lose our fear of being wrong.", author: "Joseph Chilton Pearce" },
  { text: "All our dreams can come true if we have the courage to pursue them.", author: "Walt Disney" }
];

/* ─── State ─── */
let activeImageUrl = "";
let activeQuoteText = "";
let refreshTimer = null;
let reconnectTimer = null;
let isTransitioning = false;
let isOnline = false;

// Reusable offscreen canvas for image processing to avoid repeated allocations
let _wgCanvas = null;
// Processing concurrency and created blob-tracking
const PROCESS_CONCURRENCY = 1;
let _wgProcessingCount = 0;
const _wgCreatedBlobUrls = new Set();
// Worker for image processing (if available)
let _wgProcessorWorker = null;
let _wgWorkerReady = false;
try {
  if (typeof Worker !== 'undefined' && !LIGHTWEIGHT_MODE) {
    _wgProcessorWorker = new Worker('./image_processor_worker.js');
    _wgProcessorWorker.onmessage = (ev) => {
      const d = ev.data || {};
      if (!d.id) return;
      const cb = _wgProcessorCallbacks && _wgProcessorCallbacks[d.id];
      if (!cb) return;
      delete _wgProcessorCallbacks[d.id];
      if (d.success && d.buffer) {
        const blob = new Blob([d.buffer], { type: d.mime || 'image/jpeg' });
        cb.resolve(blob);
      } else {
        cb.reject(new Error(d.reason || 'worker-failed'));
      }
    };
    _wgWorkerReady = true;
  }
} catch (e) {
  _wgWorkerReady = false;
}

const _wgProcessorCallbacks = {};
let _wgProcessorIdSeq = 1;

/* Image pool: fetched from the internet */
let imagePool = [];
const usedImageIds = new Set();
let fetchedPages = new Set();

/* Quote pool: fetched from the internet */
let quotePool = [];
const usedQuoteTexts = new Set();

/* Font pool: fetched from the internet */
let fontPool = [];
const usedFontIds = new Set();

const animStyles = ["up", "down", "left", "right", "scale"];

/* Offline fallback tracking (also no repeats) */
const usedFallbackImageIds = new Set();
const usedFallbackQuoteTexts = new Set();

/* ─── Utilities ─── */

function shuffle(items) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function preloadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    // allow the browser to decode asynchronously to avoid blocking main thread
    try { img.decoding = 'async'; } catch {}
    img.onload = () => resolve(url);
    img.onerror = () => reject(new Error(`Failed to load: ${url}`));
    img.src = url;
  });
}

// Try to center-crop an image to target dimensions and return a data URL.
// Returns null on failure (CORS, OOM, other errors) so callers can fallback to original URL.
async function processAndCropImage(url, targetW, targetH, quality = 0.86) {
  if (!url || url.startsWith('data:') || url.startsWith('blob:')) return null;
  if (DONT_CROP) return null;
  if (_wgProcessingCount >= PROCESS_CONCURRENCY) return null;
  _wgProcessingCount += 1;
  try {
    // If worker available, delegate processing to worker to keep main thread free
    if (_wgWorkerReady && _wgProcessorWorker) {
      const id = `p${_wgProcessorIdSeq++}`;
      const promise = new Promise((resolve, reject) => {
        _wgProcessorCallbacks[id] = { resolve, reject };
        try {
          _wgProcessorWorker.postMessage({ id, url, targetW, targetH, quality });
        } catch (e) {
          delete _wgProcessorCallbacks[id];
          reject(e);
        }
      });
      try {
        const blob = await promise;
        if (!blob) return null;
        const blobUrl = URL.createObjectURL(blob);
        _wgCreatedBlobUrls.add(blobUrl);
        pruneBlobUrls(60);
        return blobUrl;
      } catch (e) {
        // fallback to main-thread processing below
      }
    }

    // Fallback: main-thread processing (existing path)
    let resp;
    try {
      resp = await fetch(url, { mode: 'cors', cache: 'no-store' });
      if (!resp || !resp.ok) return null;
    } catch {
      return null;
    }

    let blob;
    try { blob = await resp.blob(); } catch { return null; }

    let bitmap;
    try {
      bitmap = await createImageBitmap(blob);
    } catch (e) {
      try {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        const loaded = new Promise((res, rej) => { img.onload = res; img.onerror = rej; });
        img.src = URL.createObjectURL(blob);
        await loaded;
        bitmap = await createImageBitmap(img);
        URL.revokeObjectURL(img.src);
      } catch (err) {
        return null;
      }
    }

    const srcW = bitmap.width;
    const srcH = bitmap.height;
    if (!srcW || !srcH) return null;

    const scale = Math.max(targetW / srcW, targetH / srcH);
    const sWidth = Math.round(targetW / scale);
    const sHeight = Math.round(targetH / scale);
    const drawW = Math.round(srcW * scale);
    const drawH = Math.round(srcH * scale);
    const sx = Math.max(0, Math.round((drawW - targetW) / 2 / scale));
    const sy = Math.max(0, Math.round((drawH - targetH) / 2 / scale));

    let outBlob = null;
    try {
      if (typeof OffscreenCanvas !== 'undefined') {
        const off = new OffscreenCanvas(targetW, targetH);
        const ctx = off.getContext('2d');
        ctx.drawImage(bitmap, sx, sy, sWidth, sHeight, 0, 0, targetW, targetH);
        if (off.convertToBlob) outBlob = await off.convertToBlob({ type: 'image/jpeg', quality });
      } else {
        if (!_wgCanvas) _wgCanvas = document.createElement('canvas');
        const canvas = _wgCanvas;
        canvas.width = targetW;
        canvas.height = targetH;
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, targetW, targetH);
        ctx.drawImage(bitmap, sx, sy, sWidth, sHeight, 0, 0, targetW, targetH);
        outBlob = await new Promise((res) => canvas.toBlob(res, 'image/jpeg', quality));
      }
    } catch (e) {
      return null;
    }

    if (!outBlob) return null;
    const blobUrl = URL.createObjectURL(outBlob);
    _wgCreatedBlobUrls.add(blobUrl);
    pruneBlobUrls(60);
    return blobUrl;
  } finally {
    _wgProcessingCount -= 1;
  }
}

function preloadFontCSS(font) {
  if (!font) return Promise.resolve();
  return new Promise((resolve) => {
    const family = font.family.replace(/ /g, "+");
    const url = `https://fonts.googleapis.com/css2?family=${family}&display=swap`;
    const id = `font-${font.id}`;

    if (document.getElementById(id)) {
      document.fonts.load(`1em "${font.family}"`).then(resolve).catch(resolve);
      return;
    }

    const link = document.createElement("link");
    link.id = id;
    link.rel = "stylesheet";
    link.href = url;
    
    link.onload = () => {
      document.fonts.load(`1em "${font.family}"`).then(resolve).catch(resolve);
    };
    link.onerror = resolve;
    
    document.head.appendChild(link);
  });
}

/* ─── Image Fetching (Picsum Photos API) ─── */

function pickRandomPage() {
  /* Pick a page we haven't fetched yet */
  const available = [];
  for (let p = 1; p <= PICSUM_TOTAL_PAGES; p++) {
    if (!fetchedPages.has(p)) available.push(p);
  }
  if (!available.length) {
    /* All pages exhausted — reset and refetch */
    fetchedPages.clear();
    for (let p = 1; p <= PICSUM_TOTAL_PAGES; p++) available.push(p);
  }
  return available[Math.floor(Math.random() * available.length)];
}

async function fetchImageBatch() {
  const page = pickRandomPage();
  const response = await fetch(
    `https://picsum.photos/v2/list?page=${page}&limit=${IMAGE_BATCH_SIZE}`
  );

  if (!response.ok) throw new Error(`Picsum HTTP ${response.status}`);

  const data = await response.json();
  fetchedPages.add(page);

  return data
    .filter((photo) => {
      /* Only landscape photos large enough for a wallpaper */
      return (
        photo.width >= 1920 &&
        photo.height >= 1080 &&
        photo.width / photo.height >= 1.3
      );
    })
    .map((photo) => ({
      id: String(photo.id),
      name: `Photo by ${photo.author}`,
      // Request an appropriately sized image for the current viewport
      image: (() => {
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const w = Math.min(1280, Math.round(window.innerWidth * dpr));
        const h = Math.min(720, Math.round(window.innerHeight * dpr));
        return `https://picsum.photos/id/${photo.id}/${w}/${h}`;
      })(),
      alt: `Photograph by ${photo.author}`,
      author: photo.author
    }));
}

async function ensureImagePool() {
  /* If we still have unused images in the pool, no need to fetch */
  const unused = imagePool.filter((img) => !usedImageIds.has(img.id));
  if (unused.length > 0) return true;

  /* Try fetching a new batch */
  try {
    const batch = await fetchImageBatch();
    /* Filter out any images we've already used */
    const fresh = batch.filter((img) => !usedImageIds.has(img.id));

    if (fresh.length > 0) {
      imagePool = shuffle(fresh);
      isOnline = true;
      return true;
    }

    /* If all images from this page were already used, reset and try again */
    if (usedImageIds.size > 200) {
      usedImageIds.clear();
      imagePool = shuffle(batch);
      isOnline = true;
      return true;
    }

    /* Try one more page */
    const batch2 = await fetchImageBatch();
    const fresh2 = batch2.filter((img) => !usedImageIds.has(img.id));
    if (fresh2.length > 0) {
      imagePool = shuffle(fresh2);
      isOnline = true;
      return true;
    }

    return false;
  } catch {
    return false;
  }
}

/* ─── Quote Fetching (ZenQuotes API) ─── */

async function fetchQuoteBatch() {
  // Try primary source (ZenQuotes) first, then fallback to type.fit if CORS or errors occur
  try {
    const response = await fetch(QUOTES_API);
    if (response.ok) {
      const data = await response.json();
      if (Array.isArray(data)) {
        return data
          .filter(
            (e) =>
              e &&
              typeof e.q === "string" &&
              typeof e.a === "string" &&
              e.q.length >= 30 &&
              e.q.length <= 200
          )
          .map((e) => ({ text: e.q.trim(), author: e.a.trim() }));
      }
    }
  } catch (e) {
    // ignore and try fallback
  }

  // Fallback: type.fit (simple public quotes list)
  try {
    const response = await fetch('https://type.fit/api/quotes');
    if (response.ok) {
      const data = await response.json();
      if (Array.isArray(data)) {
        return data
          .filter((e) => e && typeof e.text === 'string' && e.text.length >= 30 && e.text.length <= 200)
          .map((e) => ({ text: e.text.trim(), author: (e.author || 'Unknown').trim() }));
      }
    }
  } catch (e) {
    // ignore
  }

  // No live quotes available
  return [];
}

async function ensureQuotePool() {
  const unused = quotePool.filter((q) => !usedQuoteTexts.has(q.text));
  if (unused.length > 0) return true;

  try {
    const batch = await fetchQuoteBatch();
    const fresh = batch.filter((q) => !usedQuoteTexts.has(q.text));

    if (fresh.length > 0) {
      quotePool = shuffle(fresh);
      return true;
    }

    /* If we've used all fetched quotes, reset tracking */
    if (usedQuoteTexts.size > 100) {
      usedQuoteTexts.clear();
      quotePool = shuffle(batch);
      return batch.length > 0;
    }

    return false;
  } catch {
    return false;
  }
}

/* ─── Font Fetching (Fontsource API) ─── */

async function fetchFontBatch() {
  const response = await fetch(FONTS_API);
  if (!response.ok) throw new Error(`Fontsource HTTP ${response.status}`);

  const data = await response.json();
  /* Filter for google fonts with normal weight and latin letters */
  const usable = data.filter(
    (f) => f.type === "google" && f.subsets.includes("latin") && f.weights && f.weights.includes(400)
  );
  
  if (usable.length === 0) throw new Error("No usable fonts found");
  return usable;
}

async function ensureFontPool() {
  const unused = fontPool.filter((f) => !usedFontIds.has(f.id));
  if (unused.length > 0) return true;

  try {
    const batch = await fetchFontBatch();
    const fresh = batch.filter((f) => !usedFontIds.has(f.id));

    if (fresh.length > 0) {
      fontPool = shuffle(fresh);
      return true;
    }

    /* Reset if all used */
    if (usedFontIds.size > 100) {
      usedFontIds.clear();
      fontPool = shuffle(batch);
      return batch.length > 0;
    }

    return false;
  } catch {
    return false;
  }
}

/* ─── Pick Next (no repeats) ─── */

function pickNextImage() {
  /* Try live pool first */
  const unused = imagePool.filter((img) => !usedImageIds.has(img.id));
  if (unused.length > 0) {
    const pick = unused[0];
    usedImageIds.add(pick.id);
    imagePool = imagePool.filter((img) => img.id !== pick.id);
    return pick;
  }

  /* Fallback: offline library */
  let fallbackUnused = offlineFallbackScenes.filter(
    (s) => !usedFallbackImageIds.has(s.id)
  );

  if (!fallbackUnused.length) {
    /* All fallbacks used — reset */
    usedFallbackImageIds.clear();
    fallbackUnused = [...offlineFallbackScenes];
  }

  const shuffled = shuffle(fallbackUnused);
  const pick = shuffled[0];
  usedFallbackImageIds.add(pick.id);
  return pick;
}

function pickNextQuote() {
  /* Try live pool first */
  const unused = quotePool.filter((q) => !usedQuoteTexts.has(q.text));
  if (unused.length > 0) {
    const pick = unused[0];
    usedQuoteTexts.add(pick.text);
    quotePool = quotePool.filter((q) => q.text !== pick.text);
    return pick;
  }

  /* Fallback: offline quotes */
  let fallbackUnused = offlineFallbackQuotes.filter(
    (q) => !usedFallbackQuoteTexts.has(q.text)
  );

  if (!fallbackUnused.length) {
    usedFallbackQuoteTexts.clear();
    fallbackUnused = [...offlineFallbackQuotes];
  }

  const shuffled = shuffle(fallbackUnused);
  const pick = shuffled[0];
  usedFallbackQuoteTexts.add(pick.text);
  return pick;
}

function pickNextFont() {
  const unused = fontPool.filter((f) => !usedFontIds.has(f.id));
  if (unused.length > 0) {
    const pick = unused[0];
    usedFontIds.add(pick.id);
    fontPool = fontPool.filter((f) => f.id !== pick.id);
    return pick;
  }
  return null;
}

function applyFont(font) {
  if (!font) return;
  document.documentElement.style.setProperty("--quote-font", `"${font.family}", Georgia, serif`);
}

/* ─── Reconnection Logic ─── */

function startReconnectLoop() {
  if (reconnectTimer) return;

  reconnectTimer = setInterval(async () => {
    if (isOnline) {
      /* Already reconnected — stop checking */
      clearInterval(reconnectTimer);
      reconnectTimer = null;
      return;
    }

    try {
      const hasImages = await ensureImagePool();
      const hasQuotes = await ensureQuotePool();
      await ensureFontPool();

      if (hasImages || hasQuotes) {
        isOnline = true;
        clearInterval(reconnectTimer);
        reconnectTimer = null;
        console.log("[WallGen] Reconnected — live content available.");
      }
    } catch {
      /* Still offline, keep trying */
    }
  }, RECONNECT_INTERVAL_MS);
}

/* ─── DOM Transitions ─── */

function animateQuote(quote, font) {
  return new Promise((resolve) => {
    const exitAnim = animStyles[Math.floor(Math.random() * animStyles.length)];
    const enterAnim = animStyles[Math.floor(Math.random() * animStyles.length)];
    
    // 1. Fade out to exitAnim direction
    headlinePanel.className = `headline-panel quote-anim-${exitAnim}`;

    setTimeout(() => {
      // Update content while invisible
      quoteText.textContent = quote.text;
      quoteAuthor.textContent = `— ${quote.author}`;
      activeQuoteText = quote.text;
      applyFont(font);

      // 2. Disable transition instantly and teleport to enterAnim starting position
      headlinePanel.style.transition = "none";
      headlinePanel.className = `headline-panel quote-anim-${enterAnim}`;

      // Force layout recalculation so the snap takes effect without animation
      void headlinePanel.offsetHeight;

      // 3. Re-enable transition and trigger enter state (moves to center)
      headlinePanel.style.transition = "";
      headlinePanel.className = "headline-panel quote-entering";

      setTimeout(() => {
        // Clean up class after enter completes
        headlinePanel.className = "headline-panel";
        resolve();
      }, QUOTE_FADE_MS);
    }, QUOTE_FADE_MS);
  });
}

function crossfadeBackdrop(imageUrl, alt) {
  return new Promise((resolve) => {
    const nextLayer = document.createElement("div");
    nextLayer.className = "backdrop-image backdrop-image--next";
    nextLayer.style.backgroundImage = `url("${imageUrl}")`;
    nextLayer.setAttribute("aria-label", alt || "WallGen wallpaper");
    nextLayer.style.opacity = "0";

    const currentLayer = getBackdropEl();
    currentLayer.parentNode.insertBefore(nextLayer, currentLayer);

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        nextLayer.style.opacity = "1";
        currentLayer.style.opacity = "0";

        setTimeout(() => {
          nextLayer.id = "backdropImage";
          nextLayer.classList.remove("backdrop-image--next");
          // Revoke any blob URL from the old layer to free memory
          try {
            const bg = currentLayer.style.backgroundImage || '';
            const m = bg.match(/url\(["']?(.*?)["']?\)/);
            if (m && m[1]) {
              const oldUrl = m[1];
              if (oldUrl.startsWith('blob:') && _wgCreatedBlobUrls.has(oldUrl)) {
                try { URL.revokeObjectURL(oldUrl); } catch {}
                _wgCreatedBlobUrls.delete(oldUrl);
              }
            }
          } catch (e) {}

          currentLayer.remove();
          window.__wgBackdrop = nextLayer;
          resolve();
        }, CROSSFADE_MS);
      });
    });
  });
}

function getBackdropEl() {
  return window.__wgBackdrop || document.getElementById("backdropImage");
}

/* ─── Core: Apply a wallpaper + quote ─── */

async function applyWallpaper(scene, quote, animate, font) {
  if (!animate) {
    quoteText.textContent = quote.text;
    quoteAuthor.textContent = `— ${quote.author}`;
    activeQuoteText = quote.text;
    applyFont(font);

    const el = getBackdropEl();
    // Revoke previous blob URL if one was used to avoid leaking object URLs
    try {
      if (activeImageUrl && activeImageUrl.startsWith('blob:') && _wgCreatedBlobUrls.has(activeImageUrl)) {
        try { URL.revokeObjectURL(activeImageUrl); } catch {}
        _wgCreatedBlobUrls.delete(activeImageUrl);
      }
    } catch (e) {}

    // If WebGL renderer is requested and available, render into the canvas instead
    if (USE_WEBGL && window.WGWebGL && WGWebGL.isAvailable && WGWebGL.isAvailable()) {
      try {
        // hide background image element (canvas will be visible)
        const bgEl = document.getElementById('backdropImage');
        if (bgEl) bgEl.style.backgroundImage = 'none';
        const webglContainer = document.getElementById('webglContainer');
        if (webglContainer) webglContainer.style.display = 'block';
        await safeRenderWebgl(scene.image);
        // set accessible label on canvas container
        if (webglContainer) webglContainer.setAttribute("aria-label", scene.alt || scene.name || "WallGen wallpaper");
      } catch (e) {
        // fallback to CSS background if WebGL render fails
        el.style.backgroundImage = `url("${scene.image}")`;
        el.setAttribute("aria-label", scene.alt || scene.name || "WallGen wallpaper");
      }
    } else {
      el.style.backgroundImage = `url("${scene.image}")`;
      el.setAttribute("aria-label", scene.alt || scene.name || "WallGen wallpaper");
      el.style.opacity = "1";
    }
  } else {
    if (USE_WEBGL && window.WGWebGL && WGWebGL.isAvailable && WGWebGL.isAvailable()) {
      // Render to WebGL and animate quote only
      await Promise.allSettled([
        animateQuote(quote, font),
        (async () => { try { await safeRenderWebgl(scene.image); } catch {} })()
      ]);
    } else {
      await Promise.all([
        animateQuote(quote, font),
        crossfadeBackdrop(scene.image, scene.alt || scene.name || "WallGen wallpaper")
      ]);
    }
  }

  activeImageUrl = scene.image;
  scheduleAutoRefresh();
}

/* ─── Load Next Wallpaper ─── */

async function loadNext(animate) {
  if (isTransitioning) return;
  const now = Date.now();
  if (now - _lastLoadMs < LOAD_DEBOUNCE_MS) return;
  _lastLoadMs = now;
  isTransitioning = true;

  try {
    /* Try to refill pools from the internet */
    const refillResults = await Promise.allSettled([
      ensureImagePool(),
      ensureQuotePool(),
      ensureFontPool()
    ]);

    const gotImages = refillResults[0] && refillResults[0].status === 'fulfilled' && refillResults[0].value;
    const gotQuotes = refillResults[1] && refillResults[1].status === 'fulfilled' && refillResults[1].value;
    const gotFonts = refillResults[2] && refillResults[2].status === 'fulfilled' && refillResults[2].value;

    /* If we couldn't get live content, start reconnection loop */
    if (!gotImages && !gotQuotes && !isOnline) {
      startReconnectLoop();
    }

    /* Pick next scene & quote (will use fallbacks if pools are empty) */
    const scene = pickNextImage();
    const quote = pickNextQuote();
    const font = pickNextFont();

    if (!scene) return;

    /* Preload the image and font concurrently before applying. Then attempt a safe center-crop. */
    try {
      await Promise.allSettled([
        preloadImage(scene.image),
        preloadFontCSS(font)
      ]);

      try {
        const originalSource = scene.image;
        // If the document is hidden (embedded/background), skip heavy processing
        if (!document.hidden) {
          const dpr = Math.min(window.devicePixelRatio || 1, 2);
          // Cap processing size to avoid huge canvases in low-memory environments
          const targetW = Math.min(Math.round(window.innerWidth * dpr), 1280);
          const targetH = Math.min(Math.round(window.innerHeight * dpr), 720);
          const cropped = await processAndCropImage(scene.image, targetW, targetH);
          if (cropped) {
            scene.image = cropped;
          }
        }
        // Attempt to cache the original remote image (if it was remote)
        if (originalSource && !originalSource.startsWith('data:') && !originalSource.startsWith('blob:')) {
          cacheImageRemote(originalSource).catch(() => {});
        }
      } catch {}
    } catch {
      /* If preload fails, still apply — browser will retry loading it */
    }

    await applyWallpaper(scene, quote, animate, font);
    // Save session after applying new state
    saveSession();
  } finally {
    isTransitioning = false;
  }
}

/* ─── Auto-Refresh Timer ─── */

function scheduleAutoRefresh() {
  if (refreshTimer) clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => loadNext(true), AUTO_ROTATE_MS);
}

/* ─── Parallax ─── */

// Throttle pointermove updates via requestAnimationFrame to avoid main-thread thrash
let _wgPointerX = 0;
let _wgPointerY = 0;
let _wgPointerScheduled = false;
window.addEventListener("pointermove", (event) => {
  _wgPointerX = event.clientX;
  _wgPointerY = event.clientY;
  if (_wgPointerScheduled) return;
  _wgPointerScheduled = true;
  requestAnimationFrame(() => {
    const el = getBackdropEl();
    if (!el) {
      _wgPointerScheduled = false;
      return;
    }
    const x = (_wgPointerX / window.innerWidth - 0.5) * 42;
    const y = (_wgPointerY / window.innerHeight - 0.5) * 42;
    el.style.transform = `scale(1.14) translate3d(${x * -1.35}px, ${y * -1.35}px, 0)`;
    _wgPointerScheduled = false;
  });
});

window.addEventListener("pointerleave", () => {
  const el = getBackdropEl();
  if (!el) return;
  el.style.transform = "scale(1.12)";
});

/* ─── Prevent Selection / Drag ─── */

function isEditable(target) {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable ||
      target.tagName === "INPUT" ||
      target.tagName === "TEXTAREA" ||
      target.tagName === "SELECT")
  );
}

document.addEventListener("selectstart", (e) => {
  if (!isEditable(e.target)) e.preventDefault();
});
document.addEventListener("dragstart", (e) => {
  if (!isEditable(e.target)) e.preventDefault();
});

/* Keyboard shortcuts and double-click support removed to avoid accidental triggers in embedding hosts. */

/* ─── Boot ─── */

loadSession(); // attempt session restore

// Cleanup old cached images and load any cached scenes into pool
cleanupOldCache().finally(() => {
  loadCachedScenesToPool().catch(() => {});
});

// If requested, initialize the lightweight WebGL renderer (non-blocking)
try {
  // Do NOT initialize WebGL when running inside detected Lively lightweight host
  if (USE_WEBGL && !LIGHTWEIGHT_MODE && window.WGWebGL && WGWebGL.init) {
    const container = document.getElementById('webglContainer');
    const ok = WGWebGL.init(container);
    if (ok) {
      // Prefer the canvas-backed backdrop when WebGL is active
      window.__wgBackdrop = container.querySelector('canvas') || document.getElementById('backdropImage');
    }
  }
} catch (e) {}

/* Show previous quote/wallpaper if session exists, else an offline random */
const cachedLastQuoteText = safeGetItem('wg_lastQuote');
let bootQuote;
if (cachedLastQuoteText) {
  // Set previous quote (find full object for proper author display)
  const allQuotes = [...quotePool, ...offlineFallbackQuotes];
  bootQuote = allQuotes.find(q => q.text === cachedLastQuoteText);
}
if (!bootQuote) {
  bootQuote = offlineFallbackQuotes[Math.floor(Math.random() * offlineFallbackQuotes.length)];
}
quoteText.textContent = bootQuote.text;
quoteAuthor.textContent = `— ${bootQuote.author}`;
activeQuoteText = bootQuote.text;

/* On load: try to show previous wallpaper bg if exists, else first available */
const cachedLastImageUrl = safeGetItem('wg_lastScene');
if (cachedLastImageUrl) {
  const el = getBackdropEl();
  el.style.backgroundImage = `url("${cachedLastImageUrl}")`;
  el.style.opacity = '1';
  activeImageUrl = cachedLastImageUrl;
}

// Then fetch live content and display next wallpaper after boot (no animation)
loadNext(false);
