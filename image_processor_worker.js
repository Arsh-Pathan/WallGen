self.onmessage = async (ev) => {
  const msg = ev.data;
  if (!msg || !msg.id) return;
  const { id, url, targetW, targetH, quality } = msg;
  try {
    // Fetch image
    const resp = await fetch(url, { mode: 'cors', cache: 'no-store' });
    if (!resp || !resp.ok) throw new Error('Fetch failed');
    const blob = await resp.blob();
    // Create bitmap
    let bitmap;
    try {
      bitmap = await createImageBitmap(blob);
    } catch (e) {
      // Try fallback using ImageBitmap from Image
      const img = new Image();
      img.crossOrigin = 'anonymous';
      const imgLoaded = new Promise((res, rej) => { img.onload = res; img.onerror = rej; });
      img.src = URL.createObjectURL(blob);
      await imgLoaded;
      bitmap = await createImageBitmap(img);
      URL.revokeObjectURL(img.src);
    }
    const srcW = bitmap.width;
    const srcH = bitmap.height;
    if (!srcW || !srcH) throw new Error('Invalid image dimensions');
    // Compute scaling for center-crop
    const scale = Math.max(targetW / srcW, targetH / srcH);
    const sWidth = Math.round(targetW / scale);
    const sHeight = Math.round(targetH / scale);
    const drawW = Math.round(srcW * scale);
    const drawH = Math.round(srcH * scale);
    const sx = Math.max(0, Math.round((drawW - targetW) / 2 / scale));
    const sy = Math.max(0, Math.round((drawH - targetH) / 2 / scale));

    if (typeof OffscreenCanvas !== 'undefined') {
      const off = new OffscreenCanvas(targetW, targetH);
      const ctx = off.getContext('2d');
      ctx.drawImage(bitmap, sx, sy, sWidth, sHeight, 0, 0, targetW, targetH);
      const outBlob = await off.convertToBlob({ type: 'image/jpeg', quality: quality || 0.86 });
      const ab = await outBlob.arrayBuffer();
      self.postMessage({ id, success: true, buffer: ab, mime: outBlob.type }, [ab]);
      try { bitmap.close(); } catch {}
      return;
    }

    // If OffscreenCanvas not available in worker, fail gracefully
    self.postMessage({ id, success: false, reason: 'no-offscreen' });
    try { bitmap.close(); } catch {}
  } catch (err) {
    self.postMessage({ id, success: false, reason: err && err.message });
  }
};
