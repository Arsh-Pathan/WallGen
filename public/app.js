const backdropImage = document.getElementById("backdropImage");
const quoteText = document.getElementById("quoteText");
const quoteAuthor = document.getElementById("quoteAuthor");
const headlinePanel = document.getElementById("headlinePanel");

let refreshTimeout = null;
const quoteFonts = [
  '"Cormorant Garamond", serif',
  '"DM Serif Display", serif',
  '"Playfair Display", serif',
  '"Libre Baskerville", serif',
  '"Bodoni Moda", serif',
  '"Cinzel", serif',
  '"Prata", serif',
  '"Lora", serif'
];

function pickRandomFont() {
  return quoteFonts[Math.floor(Math.random() * quoteFonts.length)];
}

function preloadImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve();
    image.onerror = reject;
    image.src = url;
  });
}

function applyWallpaper(payload) {
  quoteText.textContent = payload.quote.text;
  quoteAuthor.textContent = `- ${payload.quote.author}`;
  document.documentElement.style.setProperty("--quote-font", pickRandomFont());
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
    applyWallpaper(payload);
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

window.addEventListener("keydown", (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "r") {
    sessionStorage.setItem("wallgen-force-refresh", "1");
  }

  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "n") {
    event.preventDefault();
    requestFreshWallpaper();
  }
});

const shouldForceRefresh = sessionStorage.getItem("wallgen-force-refresh") === "1";
sessionStorage.removeItem("wallgen-force-refresh");
loadWallpaper(shouldForceRefresh);
