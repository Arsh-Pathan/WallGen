/* ═══════════════════════════════════════════════════════
   WallGen — Standalone Live Wallpaper
   No server. Fetches live images + quotes from the web.
   Designed for Lively Wallpaper (Windows).
   ═══════════════════════════════════════════════════════ */

/* ─── DOM ─── */
const backdropImage = document.getElementById("backdropImage");
const quoteText = document.getElementById("quoteText");
const quoteAuthor = document.getElementById("quoteAuthor");
const headlinePanel = document.getElementById("headlinePanel");

/* ─── Config ─── */
const AUTO_ROTATE_MS = 30 * 60 * 1000;
const CROSSFADE_MS = 900;
const QUOTE_FADE_MS = 520;
const RECONNECT_INTERVAL_MS = 30_000;
const IMAGE_BATCH_SIZE = 30;
const PICSUM_TOTAL_PAGES = 33;
const QUOTES_API = "https://zenquotes.io/api/quotes";

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

/* Image pool: fetched from the internet */
let imagePool = [];
const usedImageIds = new Set();
let fetchedPages = new Set();

/* Quote pool: fetched from the internet */
let quotePool = [];
const usedQuoteTexts = new Set();

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
    img.onload = () => resolve(url);
    img.onerror = () => reject(new Error(`Failed to load: ${url}`));
    img.src = url;
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
      image: `https://picsum.photos/id/${photo.id}/2560/1440`,
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
  const response = await fetch(QUOTES_API);
  if (!response.ok) throw new Error(`ZenQuotes HTTP ${response.status}`);

  const data = await response.json();

  return Array.isArray(data)
    ? data
        .filter(
          (e) =>
            e &&
            typeof e.q === "string" &&
            typeof e.a === "string" &&
            e.q.length >= 30 &&
            e.q.length <= 200
        )
        .map((e) => ({ text: e.q.trim(), author: e.a.trim() }))
    : [];
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

function animateQuote(quote) {
  return new Promise((resolve) => {
    headlinePanel.classList.add("quote-fading");

    setTimeout(() => {
      quoteText.textContent = quote.text;
      quoteAuthor.textContent = `— ${quote.author}`;
      activeQuoteText = quote.text;

      void headlinePanel.offsetHeight;

      headlinePanel.classList.remove("quote-fading");
      headlinePanel.classList.add("quote-entering");

      setTimeout(() => {
        headlinePanel.classList.remove("quote-entering");
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

async function applyWallpaper(scene, quote, animate) {
  if (!animate) {
    quoteText.textContent = quote.text;
    quoteAuthor.textContent = `— ${quote.author}`;
    activeQuoteText = quote.text;

    const el = getBackdropEl();
    el.style.backgroundImage = `url("${scene.image}")`;
    el.setAttribute("aria-label", scene.alt || scene.name || "WallGen wallpaper");
    el.style.opacity = "1";
  } else {
    await Promise.all([
      animateQuote(quote),
      crossfadeBackdrop(scene.image, scene.alt || scene.name || "WallGen wallpaper")
    ]);
  }

  activeImageUrl = scene.image;
  scheduleAutoRefresh();
}

/* ─── Load Next Wallpaper ─── */

async function loadNext(animate) {
  if (isTransitioning) return;
  isTransitioning = true;

  try {
    /* Try to refill pools from the internet */
    const [hasImages, hasQuotes] = await Promise.allSettled([
      ensureImagePool(),
      ensureQuotePool()
    ]);

    const gotImages = hasImages.status === "fulfilled" && hasImages.value;
    const gotQuotes = hasQuotes.status === "fulfilled" && hasQuotes.value;

    /* If we couldn't get live content, start reconnection loop */
    if (!gotImages && !gotQuotes && !isOnline) {
      startReconnectLoop();
    }

    /* Pick next scene & quote (will use fallbacks if pools are empty) */
    const scene = pickNextImage();
    const quote = pickNextQuote();

    if (!scene) return;

    /* Preload the image */
    try {
      await preloadImage(scene.image);
    } catch {
      /* If preload fails, still apply — browser will retry loading it */
    }

    await applyWallpaper(scene, quote, animate);
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

window.addEventListener("pointermove", (event) => {
  const el = getBackdropEl();
  if (!el) return;
  const x = (event.clientX / window.innerWidth - 0.5) * 42;
  const y = (event.clientY / window.innerHeight - 0.5) * 42;
  el.style.transform = `scale(1.14) translate3d(${x * -1.35}px, ${y * -1.35}px, 0)`;
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

/* ─── Double-Click to Switch ─── */

window.addEventListener("dblclick", (event) => {
  if (event.button !== 0 || isEditable(event.target)) return;
  loadNext(true);
});

/* ─── Boot ─── */

/* Show an offline quote immediately (no blank screen) */
const bootQuote =
  offlineFallbackQuotes[Math.floor(Math.random() * offlineFallbackQuotes.length)];
quoteText.textContent = bootQuote.text;
quoteAuthor.textContent = `— ${bootQuote.author}`;
activeQuoteText = bootQuote.text;

/* Fetch live content and display first wallpaper */
loadNext(false);
