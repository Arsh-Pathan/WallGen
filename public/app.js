const backdropImage = document.getElementById("backdropImage");
const quoteText = document.getElementById("quoteText");
const quoteAuthor = document.getElementById("quoteAuthor");
const headlinePanel = document.getElementById("headlinePanel");

let refreshTimeout = null;
let activeQuoteFont = "";

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

function applyWallpaper(payload, quoteFontFamily) {
  quoteText.textContent = payload.quote.text;
  quoteAuthor.textContent = `- ${payload.quote.author}`;
  document.documentElement.style.setProperty("--quote-font", `"${quoteFontFamily}", serif`);
  backdropImage.style.backgroundImage = `url("${payload.scene.image}")`;
  backdropImage.setAttribute("aria-label", payload.scene.alt);
  scheduleAutoRefresh(payload.nextRefreshAt);
}

function scheduleAutoRefresh(nextRefreshAt) {
  if (refreshTimeout) {
    window.clearTimeout(refreshTimeout);
  }

  const delay = Math.max(2000, new Date(nextRefreshAt).getTime() - Date.now() + 500);
  refreshTimeout = window.setTimeout(() => loadWallpaper(false), delay);
}

async function loadWallpaper(forceFresh) {
  const url = forceFresh
    ? `/api/wallpaper?refresh=1&nonce=${Date.now()}`
    : "/api/wallpaper";

  try {
    document.body.classList.add("is-switching");
    await new Promise((resolve) => window.setTimeout(resolve, 220));
    const response = await fetch(url, { cache: "no-store" });

    if (!response.ok) {
      throw new Error(`Request failed with status ${response.status}`);
    }

    const payload = await response.json();
    await preloadImage(payload.scene.image);
    const quoteFontFamily = pickRandomQuoteFont();
    await ensureQuoteFontLoaded(quoteFontFamily);
    activeQuoteFont = quoteFontFamily;
    applyWallpaper(payload, quoteFontFamily);
    requestAnimationFrame(() => {
      document.body.classList.remove("is-switching");
    });
  } catch (error) {
    quoteText.textContent = "Unable to load a wallpaper right now.";
    quoteAuthor.textContent = "";
    document.body.classList.remove("is-switching");
    window.setTimeout(() => loadWallpaper(forceFresh), 4000);
  }
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

window.addEventListener("keydown", (event) => {
  if (isEditableTarget(event.target)) {
    return;
  }

  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "r") {
    sessionStorage.setItem("wallgen-force-refresh", "1");
  }

  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "n") {
    event.preventDefault();
    requestFreshWallpaper();
    return;
  }

  if (!event.ctrlKey && !event.metaKey && !event.altKey) {
    const key = event.key.toLowerCase();

    if (key === "n" || key === " ") {
      event.preventDefault();
      requestFreshWallpaper();
    }
  }
});

const shouldForceRefresh = sessionStorage.getItem("wallgen-force-refresh") === "1";
sessionStorage.removeItem("wallgen-force-refresh");
loadWallpaper(shouldForceRefresh);
