const backdropImage = document.getElementById("backdropImage");
const quoteText = document.getElementById("quoteText");
const quoteAuthor = document.getElementById("quoteAuthor");
const headlinePanel = document.getElementById("headlinePanel");

const PRELOADED_WALLPAPER_COUNT = 5;
const WALLGEN_CURRENT_ENTRY_KEY = "wallgen-current-entry";
const WALLGEN_QUEUE_KEY = "wallgen-wallpaper-queue";
let refreshTimeout = null;
let activeQuoteFont = "";
let wallpaperQueue = [];
let queueFillPromise = null;
let wallpaperLoadPromise = null;
let activeWallpaperUrl = "";
let activeWallpaperEntry = null;

const quoteFontCatalog = [
  "Alegreya",
  "Alice",
  "Amarante",
  "Arbutus Slab",
  "Baskervville",
  "Bellefair",
  "Bitter",
  "Bodoni Moda",
  "Brygada 1918",
  "Cardo",
  "Cinzel",
  "Cormorant Garamond",
  "Cormorant Infant",
  "Cormorant Unicase",
  "DM Serif Display",
  "Domine",
  "EB Garamond",
  "Forum",
  "Fraunces",
  "Gelasio",
  "IM Fell English SC",
  "Instrument Serif",
  "Libre Baskerville",
  "Literata",
  "Lora",
  "Marcellus",
  "Merriweather",
  "Newsreader",
  "Old Standard TT",
  "Playfair Display",
  "Prata",
  "Rosarivo",
  "Spectral",
  "Tinos",
  "Unna",
  "Vollkorn",
  "Yrsa",
  "Zilla Slab"
];

const quoteFontLoaders = new Map();

function buildGoogleFontHref(fontFamily) {
  const fontFamilySlug = fontFamily.trim().split(/\s+/).join("+");
  return `https://fonts.googleapis.com/css2?family=${fontFamilySlug}:wght@400;500;600;700&display=swap`;
}

function pickRandomQuoteFont() {
  if (quoteFontCatalog.length < 2) {
    return quoteFontCatalog[0] || "Georgia";
  }

  let fontFamily = activeQuoteFont;

  while (fontFamily === activeQuoteFont) {
    fontFamily = quoteFontCatalog[Math.floor(Math.random() * quoteFontCatalog.length)];
  }

  return fontFamily;
}

function ensureQuoteFontLoaded(fontFamily) {
  if (quoteFontLoaders.has(fontFamily)) {
    return quoteFontLoaders.get(fontFamily);
  }

  const loader = new Promise((resolve) => {
    const stylesheet = document.createElement("link");
    stylesheet.rel = "stylesheet";
    stylesheet.href = buildGoogleFontHref(fontFamily);

    const finish = () => {
      if (!document.fonts || typeof document.fonts.load !== "function") {
        resolve();
        return;
      }

      Promise.race([
        document.fonts.load(`500 1em "${fontFamily}"`),
        new Promise((timeoutResolve) => window.setTimeout(timeoutResolve, 1800))
      ]).finally(resolve);
    };

    stylesheet.onload = finish;
    stylesheet.onerror = resolve;
    document.head.append(stylesheet);
  });

  quoteFontLoaders.set(fontFamily, loader);
  return loader;
}

function preloadImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve();
    image.onerror = reject;
    image.src = url;
  });
}

function buildWallpaperUrl(forceFresh, nonce) {
  if (!forceFresh) {
    return "/api/wallpaper";
  }

  return `/api/wallpaper?refresh=1&nonce=${nonce || Date.now()}`;
}

function buildWallpaperBatchUrl(count) {
  return `/api/wallpaper-batch?count=${count}&refresh=1&nonce=${Date.now()}-${Math.random()
    .toString(36)
    .slice(2)}`;
}

async function prepareWallpaperEntry(payload) {
  await preloadImage(payload.scene.image);
  const quoteFontFamily = pickRandomQuoteFont();
  await ensureQuoteFontLoaded(quoteFontFamily);

  return {
    payload,
    quoteFontFamily
  };
}

function isValidWallpaperEntry(entry) {
  return Boolean(
    entry &&
      entry.payload &&
      entry.payload.scene &&
      typeof entry.payload.scene.image === "string" &&
      entry.payload.quote &&
      typeof entry.payload.quote.text === "string" &&
      typeof entry.payload.quote.author === "string"
  );
}

function readStoredWallpaperEntries(storageKey) {
  try {
    const raw = window.sessionStorage.getItem(storageKey);

    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw);

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter(isValidWallpaperEntry);
  } catch {
    return [];
  }
}

function persistWallpaperState() {
  try {
    if (activeWallpaperEntry) {
      window.sessionStorage.setItem(WALLGEN_CURRENT_ENTRY_KEY, JSON.stringify([activeWallpaperEntry]));
    } else {
      window.sessionStorage.removeItem(WALLGEN_CURRENT_ENTRY_KEY);
    }

    window.sessionStorage.setItem(WALLGEN_QUEUE_KEY, JSON.stringify(wallpaperQueue));
  } catch {
    // Ignore session storage failures and continue with in-memory caching.
  }
}

function restoreWallpaperState() {
  const currentEntries = readStoredWallpaperEntries(WALLGEN_CURRENT_ENTRY_KEY);
  const queuedEntries = readStoredWallpaperEntries(WALLGEN_QUEUE_KEY);
  const restoredCurrent = currentEntries[0] || null;

  wallpaperQueue = queuedEntries.filter(
    (entry) => entry.payload.scene.image !== restoredCurrent?.payload?.scene?.image
  );

  if (!restoredCurrent) {
    persistWallpaperState();
    return false;
  }

  activeQuoteFont = restoredCurrent.quoteFontFamily || activeQuoteFont;
  activeWallpaperEntry = restoredCurrent;
  applyWallpaper(restoredCurrent.payload, restoredCurrent.quoteFontFamily || "Georgia");
  persistWallpaperState();
  return true;
}

function appendPreparedWallpapers(entries) {
  const knownImages = new Set([
    activeWallpaperUrl,
    ...wallpaperQueue.map((entry) => entry.payload.scene.image)
  ]);

  for (const entry of entries) {
    const imageUrl = entry?.payload?.scene?.image;

    if (!imageUrl || knownImages.has(imageUrl)) {
      continue;
    }

    wallpaperQueue.push(entry);
    knownImages.add(imageUrl);
  }

  persistWallpaperState();
}

async function fetchPreparedWallpaper(forceFresh) {
  const response = await fetch(buildWallpaperUrl(forceFresh, Date.now()), { cache: "no-store" });

  if (!response.ok) {
    throw new Error(`Request failed with status ${response.status}`);
  }

  const payload = await response.json();
  return prepareWallpaperEntry(payload);
}

async function fetchPreparedWallpaperBatch(count) {
  const response = await fetch(buildWallpaperBatchUrl(count), { cache: "no-store" });

  if (!response.ok) {
    throw new Error(`Request failed with status ${response.status}`);
  }

  const payloads = await response.json();

  if (!Array.isArray(payloads)) {
    throw new Error("Wallpaper batch response was not an array");
  }

  return Promise.all(payloads.map((payload) => prepareWallpaperEntry(payload)));
}

function refillWallpaperQueue(targetCount = PRELOADED_WALLPAPER_COUNT) {
  if (queueFillPromise) {
    return queueFillPromise;
  }

  queueFillPromise = (async () => {
    while (wallpaperQueue.length < targetCount) {
      const missingCount = targetCount - wallpaperQueue.length;
      const preparedEntries = await fetchPreparedWallpaperBatch(missingCount);
      const queueLengthBeforeAppend = wallpaperQueue.length;

      appendPreparedWallpapers(preparedEntries);

      if (wallpaperQueue.length === queueLengthBeforeAppend) {
        break;
      }
    }

    return wallpaperQueue;
  })().finally(() => {
    queueFillPromise = null;
  });

  return queueFillPromise;
}

function applyWallpaper(payload, quoteFontFamily) {
  quoteText.textContent = payload.quote.text;
  quoteAuthor.textContent = `- ${payload.quote.author}`;
  document.documentElement.style.setProperty("--quote-font", `"${quoteFontFamily}", serif`);
  backdropImage.style.backgroundImage = `url("${payload.scene.image}")`;
  backdropImage.setAttribute("aria-label", payload.scene.alt);
  activeWallpaperUrl = payload.scene.image;
  activeWallpaperEntry = {
    payload,
    quoteFontFamily
  };
  scheduleAutoRefresh(payload.nextRefreshAt);
  persistWallpaperState();
}

function scheduleAutoRefresh(nextRefreshAt) {
  if (refreshTimeout) {
    window.clearTimeout(refreshTimeout);
  }

  const delay = Math.max(2000, new Date(nextRefreshAt).getTime() - Date.now() + 500);
  refreshTimeout = window.setTimeout(() => loadWallpaper(false), delay);
}

async function loadWallpaper(forceFresh) {
  if (wallpaperLoadPromise) {
    return wallpaperLoadPromise;
  }

  wallpaperLoadPromise = (async () => {
    try {
      let entry = null;

      if (forceFresh && wallpaperQueue.length > 0) {
        entry = wallpaperQueue.shift() || null;
        persistWallpaperState();
      }

      if (!entry) {
        entry = await fetchPreparedWallpaper(forceFresh);
      }

      activeQuoteFont = entry.quoteFontFamily;
      applyWallpaper(entry.payload, entry.quoteFontFamily);
      refillWallpaperQueue().catch(() => {});
    } catch (error) {
      quoteText.textContent = "Unable to load a wallpaper right now.";
      quoteAuthor.textContent = "";
      window.setTimeout(() => {
        wallpaperLoadPromise = null;
        loadWallpaper(forceFresh);
      }, 4000);
      return;
    }

    wallpaperLoadPromise = null;
  })();

  return wallpaperLoadPromise;
}

function requestFreshWallpaper() {
  loadWallpaper(true);
}

function isEditableTarget(target) {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable ||
      target.tagName === "INPUT" ||
      target.tagName === "TEXTAREA" ||
      target.tagName === "SELECT")
  );
}

window.addEventListener("pointermove", (event) => {
  const x = (event.clientX / window.innerWidth - 0.5) * 42;
  const y = (event.clientY / window.innerHeight - 0.5) * 42;
  backdropImage.style.transform = `scale(1.14) translate3d(${x * -1.35}px, ${y * -1.35}px, 0)`;
  headlinePanel.style.transform = `translate3d(${x * 0.28}px, ${y * 0.28}px, 0)`;
});

window.addEventListener("pointerleave", () => {
  backdropImage.style.transform = "scale(1.12)";
  headlinePanel.style.transform = "translate3d(0, 0, 0)";
});

document.addEventListener("selectstart", (event) => {
  if (isEditableTarget(event.target)) {
    return;
  }

  event.preventDefault();
});

document.addEventListener("dragstart", (event) => {
  if (isEditableTarget(event.target)) {
    return;
  }

  event.preventDefault();
});

window.addEventListener("dblclick", (event) => {
  if (event.button !== 0 || isEditableTarget(event.target)) {
    return;
  }

  requestFreshWallpaper();
});

restoreWallpaperState();
refillWallpaperQueue().catch(() => {});
loadWallpaper(false);
