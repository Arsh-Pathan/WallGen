const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");

const PORT = Number(process.env.PORT) || 3000;
const SLOT_DURATION_MS = 30 * 60 * 1000;
const PUBLIC_DIR = path.join(__dirname, "public");
const CATEGORY_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const QUOTE_CACHE_TTL_MS = 30 * 60 * 1000;

const imageThemes = [
  {
    label: "Nature",
    mood: "wild nature",
    categories: [
      "Category:Featured pictures of nature",
      "Category:Quality images of landscapes",
      "Category:Forests",
      "Category:Mountains",
      "Category:Waterfalls"
    ]
  },
  {
    label: "Space",
    mood: "cosmic",
    categories: [
      "Category:Astronomical images",
      "Category:Galaxies",
      "Category:Nebulae",
      "Category:Night sky photographs",
      "Category:Moon"
    ]
  },
  {
    label: "Cities",
    mood: "urban energy",
    categories: [
      "Category:Cityscapes",
      "Category:Skylines",
      "Category:Night cityscapes",
      "Category:Streets in cities",
      "Category:Urban photography"
    ]
  },
  {
    label: "Technology",
    mood: "future tech",
    categories: [
      "Category:Computers",
      "Category:Robots",
      "Category:Microchips",
      "Category:Satellites",
      "Category:Technology"
    ]
  },
  {
    label: "Countries",
    mood: "world travel",
    categories: [
      "Category:Landscapes by country",
      "Category:Culture by country",
      "Category:Architecture by country",
      "Category:Tourist attractions by country",
      "Category:National parks by country"
    ]
  },
  {
    label: "Oceans",
    mood: "blue horizon",
    categories: [
      "Category:Oceans",
      "Category:Coasts",
      "Category:Underwater photographs",
      "Category:Seascapes",
      "Category:Coral reefs"
    ]
  },
  {
    label: "Wildlife",
    mood: "untamed life",
    categories: [
      "Category:Wildlife photography",
      "Category:Bird photographs",
      "Category:Mammals in nature",
      "Category:Marine life",
      "Category:Macro photography of insects"
    ]
  },
  {
    label: "Architecture",
    mood: "designed form",
    categories: [
      "Category:Architecture photographs",
      "Category:Modern architecture",
      "Category:Bridges",
      "Category:Towers",
      "Category:Interiors"
    ]
  },
  {
    label: "Abstract",
    mood: "abstract mood",
    categories: [
      "Category:Abstract photography",
      "Category:Abstract nature photography",
      "Category:Patterns in nature",
      "Category:Reflections in water",
      "Category:Light and shadow in nature"
    ]
  }
];

const fallbackScenes = [
  {
    name: "Fallback Ridge",
    image:
      "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=2200&q=80",
    alt: "Misty mountain valley at sunrise.",
    mood: "fallback landscape",
    credit: "Fallback image",
    sourceUrl: "https://images.unsplash.com/"
  },
  {
    name: "Fallback Forest",
    image:
      "https://images.unsplash.com/photo-1441974231531-c6227db76b6e?auto=format&fit=crop&w=2200&q=80",
    alt: "Deep green forest with sun rays.",
    mood: "fallback forest",
    credit: "Fallback image",
    sourceUrl: "https://images.unsplash.com/"
  },
  {
    name: "Fallback Coast",
    image:
      "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=2200&q=80",
    alt: "Ocean horizon at golden hour.",
    mood: "fallback coast",
    credit: "Fallback image",
    sourceUrl: "https://images.unsplash.com/"
  }
];

const fallbackQuotes = [
  {
    text: "Keep moving. Quiet progress still changes your horizon.",
    author: "WallGen Fallback",
    sourceName: "Local fallback",
    sourceUrl: ""
  },
  {
    text: "What feels slow today becomes your edge tomorrow.",
    author: "WallGen Fallback",
    sourceName: "Local fallback",
    sourceUrl: ""
  },
  {
    text: "Show up again. Consistency gives luck somewhere to land.",
    author: "WallGen Fallback",
    sourceName: "Local fallback",
    sourceUrl: ""
  }
];

const palettes = [
  {
    accent: "#f0a500",
    accentSoft: "rgba(240, 165, 0, 0.22)",
    accentStrong: "rgba(240, 165, 0, 0.62)"
  },
  {
    accent: "#82ffd4",
    accentSoft: "rgba(130, 255, 212, 0.20)",
    accentStrong: "rgba(130, 255, 212, 0.58)"
  },
  {
    accent: "#ff8c6b",
    accentSoft: "rgba(255, 140, 107, 0.20)",
    accentStrong: "rgba(255, 140, 107, 0.60)"
  },
  {
    accent: "#b7ff6a",
    accentSoft: "rgba(183, 255, 106, 0.22)",
    accentStrong: "rgba(183, 255, 106, 0.58)"
  },
  {
    accent: "#f3e9cb",
    accentSoft: "rgba(243, 233, 203, 0.20)",
    accentStrong: "rgba(243, 233, 203, 0.58)"
  }
];

const interactionModes = [
  {
    id: "parallax",
    label: "Parallax Bloom"
  },
  {
    id: "ripple",
    label: "Ripple Field"
  },
  {
    id: "fireflies",
    label: "Firefly Drift"
  },
  {
    id: "trail",
    label: "Light Trail"
  }
];

let cachedWallpaper = null;
let cachedSlotKey = null;
let generationPromise = null;
let generationSlotKey = null;
const categoryMembersCache = new Map();
let quotesCache = null;
const recentSceneUrls = [];
const MAX_RECENT_SCENES = 12;

const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon"
};

function hashString(value) {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

function pickEntry(collection, slotKey, salt) {
  const seed = hashString(`${slotKey}:${salt}`);
  return collection[seed % collection.length];
}

function buildUrl(base, params) {
  const url = new URL(base);

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, value);
    }
  });

  return url.toString();
}

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    const request = https.get(
      url,
      {
        headers: {
          Accept: "application/json",
          "User-Agent": "WallGen/1.0"
        }
      },
      (response) => {
        if (
          response.statusCode &&
          response.statusCode >= 300 &&
          response.statusCode < 400 &&
          response.headers.location
        ) {
          response.resume();
          resolve(fetchJson(new URL(response.headers.location, url).toString()));
          return;
        }

        if (response.statusCode !== 200) {
          response.resume();
          reject(new Error(`Request failed with status ${response.statusCode}`));
          return;
        }

        let body = "";
        response.setEncoding("utf8");
        response.on("data", (chunk) => {
          body += chunk;
        });
        response.on("end", () => {
          try {
            resolve(JSON.parse(body));
          } catch (error) {
            reject(new Error(`Invalid JSON response from ${url}`));
          }
        });
      }
    );

    request.on("error", reject);
    request.end();
  });
}

function toSceneName(title, fallbackLabel) {
  const cleaned = title
    .replace(/^File:/i, "")
    .replace(/\.[^.]+$/, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return cleaned || fallbackLabel;
}

function isUsableWikimediaImage(page) {
  const info = page && Array.isArray(page.imageinfo) ? page.imageinfo[0] : null;

  if (!info) {
    return false;
  }

  if (!["image/jpeg", "image/png"].includes(info.mime)) {
    return false;
  }

  if (typeof info.width !== "number" || typeof info.height !== "number") {
    return false;
  }

  if (info.width < 1400 || info.width < info.height) {
    return false;
  }

  return Boolean(info.thumburl || info.url);
}

function rememberSceneUrl(url) {
  if (!url) {
    return;
  }

  const existingIndex = recentSceneUrls.indexOf(url);

  if (existingIndex >= 0) {
    recentSceneUrls.splice(existingIndex, 1);
  }

  recentSceneUrls.unshift(url);

  if (recentSceneUrls.length > MAX_RECENT_SCENES) {
    recentSceneUrls.length = MAX_RECENT_SCENES;
  }
}

async function fetchCategoryMembers(category) {
  const cached = categoryMembersCache.get(category);

  if (cached && cached.expiresAt > Date.now()) {
    return cached.members;
  }

  const categoryUrl = buildUrl("https://commons.wikimedia.org/w/api.php", {
    action: "query",
    format: "json",
    list: "categorymembers",
    cmtitle: category,
    cmtype: "file",
    cmlimit: 200
  });
  const categoryData = await fetchJson(categoryUrl);
  const members = categoryData?.query?.categorymembers || [];

  categoryMembersCache.set(category, {
    expiresAt: Date.now() + CATEGORY_CACHE_TTL_MS,
    members
  });

  return members;
}

async function fetchLiveImage(slotKey, selectionSeed = String(slotKey)) {
  const orderedThemes = imageThemes
    .map((theme, index) => ({
      theme,
      score: hashString(`${selectionSeed}:theme:${theme.label}:${index}`)
    }))
    .sort((left, right) => left.score - right.score)
    .map((entry) => entry.theme);

  let lastError = null;
  let fallbackScene = null;

  for (const theme of orderedThemes) {
    const orderedCategories = theme.categories
      .map((category, index) => ({
        category,
        score: hashString(`${selectionSeed}:category:${theme.label}:${category}:${index}`)
      }))
      .sort((left, right) => left.score - right.score)
      .map((entry) => entry.category);

    for (const category of orderedCategories) {
      try {
        const members = await fetchCategoryMembers(category);

        if (!members.length) {
          continue;
        }

        const startIndex = hashString(`${selectionSeed}:${category}:image-offset`) % members.length;
        const orderedMembers = members
          .slice(startIndex)
          .concat(members.slice(0, startIndex))
          .slice(0, 28);
        const titleList = orderedMembers.map((member) => member.title);
        const detailsUrl = buildUrl("https://commons.wikimedia.org/w/api.php", {
          action: "query",
          format: "json",
          prop: "imageinfo",
          titles: titleList.join("|"),
          iiprop: "url|size|mime",
          iiurlwidth: 2200
        });
        const detailsData = await fetchJson(detailsUrl);
        const pages = Object.values(detailsData?.query?.pages || {});
        const pagesByTitle = new Map(pages.map((page) => [page.title, page]));
        const selectedPage = titleList
          .map((title) => pagesByTitle.get(title))
          .find(isUsableWikimediaImage);

        if (!selectedPage) {
          continue;
        }

        const info = selectedPage.imageinfo[0];
        const sourceUrl =
          info.descriptionurl ||
          `https://commons.wikimedia.org/wiki/${selectedPage.title.replace(/ /g, "_")}`;

        const scene = {
          name: toSceneName(selectedPage.title, theme.label),
          image: info.thumburl || info.url,
          alt: `${theme.label} image from Wikimedia Commons`,
          mood: `${theme.mood} from ${theme.label.toLowerCase()}`,
          credit: "Wikimedia Commons",
          sourceUrl
        };

        if (!recentSceneUrls.includes(scene.image)) {
          rememberSceneUrl(scene.image);
          return scene;
        }

        if (!fallbackScene) {
          fallbackScene = scene;
        }
      } catch (error) {
        lastError = error;
      }
    }
  }

  if (fallbackScene) {
    rememberSceneUrl(fallbackScene.image);
    return fallbackScene;
  }

  throw lastError || new Error("No usable image found across Wikimedia categories");
}

async function fetchQuoteBatch() {
  if (quotesCache && quotesCache.expiresAt > Date.now()) {
    return quotesCache.entries;
  }

  const quoteData = await fetchJson("https://zenquotes.io/api/quotes");
  const options = Array.isArray(quoteData)
    ? quoteData.filter(
        (entry) =>
          entry &&
          typeof entry.q === "string" &&
          typeof entry.a === "string" &&
          entry.q.length >= 40 &&
          entry.q.length <= 180
      )
    : [];

  if (!options.length) {
    throw new Error("No usable quote returned from ZenQuotes");
  }

  quotesCache = {
    expiresAt: Date.now() + QUOTE_CACHE_TTL_MS,
    entries: options
  };

  return options;
}

async function fetchLiveQuote(slotKey, selectionSeed = String(slotKey)) {
  const options = await fetchQuoteBatch();

  const selected = pickEntry(options, selectionSeed, "quote");

  return {
    text: selected.q.trim(),
    author: selected.a.trim(),
    sourceName: "ZenQuotes",
    sourceUrl: "https://zenquotes.io/"
  };
}

function buildFallbackWallpaperPayload(now = Date.now(), selectionSeed = String(now)) {
  const slotKey = Math.floor(now / SLOT_DURATION_MS);
  const slotStart = slotKey * SLOT_DURATION_MS;
  const nextRefreshAt = slotStart + SLOT_DURATION_MS;
  const scene = pickEntry(fallbackScenes, selectionSeed, "scene");
  const quote = pickEntry(fallbackQuotes, selectionSeed, "quote");
  const palette = pickEntry(palettes, slotKey, "palette");
  const interaction = pickEntry(interactionModes, slotKey, "interaction");

  return {
    generatedAt: new Date(now).toISOString(),
    slotStart: new Date(slotStart).toISOString(),
    nextRefreshAt: new Date(nextRefreshAt).toISOString(),
    durationHours: 3,
    scene,
    quote,
    palette,
    interaction,
    statusLine: "Live sources were unavailable, so a fallback wallpaper was used for this cycle.",
    sourceState: "fallback"
  };
}

async function buildWallpaperPayload(now = Date.now(), selectionSeed = String(now)) {
  const slotKey = Math.floor(now / SLOT_DURATION_MS);
  const slotStart = slotKey * SLOT_DURATION_MS;
  const nextRefreshAt = slotStart + SLOT_DURATION_MS;
  const palette = pickEntry(palettes, slotKey, "palette");
  const interaction = pickEntry(interactionModes, slotKey, "interaction");
  let scene;
  let quote;
  const failures = [];

  try {
    scene = await fetchLiveImage(slotKey, selectionSeed);
  } catch (error) {
    failures.push(`image: ${error.message}`);
  }

  try {
    quote = await fetchLiveQuote(slotKey, selectionSeed);
  } catch (error) {
    failures.push(`quote: ${error.message}`);
  }

  if (!scene && !quote) {
    console.error("WallGen live generation failed:", failures.join(" | "));
    return buildFallbackWallpaperPayload(now, selectionSeed);
  }

  if (!scene) {
    scene = pickEntry(fallbackScenes, selectionSeed, "scene");
  }

  if (!quote) {
    quote = pickEntry(fallbackQuotes, selectionSeed, "quote");
  }

  return {
    generatedAt: new Date(now).toISOString(),
    slotStart: new Date(slotStart).toISOString(),
    nextRefreshAt: new Date(nextRefreshAt).toISOString(),
    durationHours: 3,
    scene,
    quote,
    palette,
    interaction,
    statusLine:
      failures.length > 0
        ? "One live source was unavailable, so WallGen filled the missing part with a fallback."
        : "Live internet wallpaper and quote assembled for the current 30-minute cycle.",
    sourceState: failures.length > 0 ? "mixed" : "live"
  };
}

async function getCurrentWallpaper(forceRefresh = false, refreshNonce = "") {
  const now = Date.now();
  const slotKey = Math.floor(now / SLOT_DURATION_MS);
  const selectionSeed = forceRefresh && refreshNonce ? `${slotKey}:${refreshNonce}` : String(slotKey);

  if (!forceRefresh && cachedWallpaper && cachedSlotKey === slotKey) {
    return cachedWallpaper;
  }

  if (!forceRefresh && generationPromise && generationSlotKey === slotKey) {
    return generationPromise;
  }

  generationSlotKey = slotKey;
  generationPromise = buildWallpaperPayload(now, selectionSeed)
    .then((payload) => {
      cachedSlotKey = slotKey;
      cachedWallpaper = payload;
      return payload;
    })
    .finally(() => {
      generationPromise = null;
      generationSlotKey = null;
    });

  return generationPromise;
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  response.end(JSON.stringify(payload));
}

function redirect(response, statusCode, location) {
  response.writeHead(statusCode, {
    Location: location,
    "Cache-Control": "no-store"
  });
  response.end();
}

function sendFile(response, targetPath) {
  fs.readFile(targetPath, (error, content) => {
    if (error) {
      if (error.code === "ENOENT") {
        sendJson(response, 404, { error: "Not found" });
        return;
      }

      sendJson(response, 500, { error: "Unable to read file" });
      return;
    }

    const extension = path.extname(targetPath).toLowerCase();
    response.writeHead(200, {
      "Content-Type": contentTypes[extension] || "application/octet-stream"
    });
    response.end(content);
  });
}

const server = http.createServer((request, response) => {
  const requestUrl = new URL(request.url, `http://${request.headers.host}`);

  if (requestUrl.pathname === "/api/wallpaper") {
    const forceRefresh =
      requestUrl.searchParams.get("refresh") === "1" ||
      requestUrl.searchParams.has("nonce");
    const refreshNonce = requestUrl.searchParams.get("nonce") || "";

    getCurrentWallpaper(forceRefresh, refreshNonce)
      .then((payload) => {
        sendJson(response, 200, payload);
      })
      .catch((error) => {
        sendJson(response, 500, { error: error.message });
      });
    return;
  }

  if (requestUrl.pathname === "/api/health") {
    sendJson(response, 200, { ok: true });
    return;
  }

  if (requestUrl.pathname === "/api/current-wallpaper-image") {
    const forceRefresh =
      requestUrl.searchParams.get("refresh") === "1" ||
      requestUrl.searchParams.has("nonce");
    const refreshNonce = requestUrl.searchParams.get("nonce") || "";

    getCurrentWallpaper(forceRefresh, refreshNonce)
      .then((payload) => {
        redirect(response, 302, payload.scene.image);
      })
      .catch((error) => {
        sendJson(response, 500, { error: error.message });
      });
    return;
  }

  const requestedPath =
    requestUrl.pathname === "/" ? "/index.html" : requestUrl.pathname;
  const filePath = path.join(PUBLIC_DIR, path.normalize(requestedPath));

  if (!filePath.startsWith(PUBLIC_DIR)) {
    sendJson(response, 403, { error: "Forbidden" });
    return;
  }

  sendFile(response, filePath);
});

server.listen(PORT, () => {
  console.log(`WallGen running on http://localhost:${PORT}`);
});
