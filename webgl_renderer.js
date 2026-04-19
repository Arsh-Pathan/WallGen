// Lightweight WebGL renderer for WallGen
// Exposes global WGWebGL with: init(containerEl), isAvailable(), renderImage(url), dispose()
(function (global) {
  const WGWebGL = {
    _gl: null,
    _canvas: null,
    _program: null,
    _texture: null,
    _posBuffer: null,
    init(container) {
      try {
        if (!container) return false;
        // create canvas that fills container
        const canvas = document.createElement('canvas');
        canvas.style.width = '100%';
        canvas.style.height = '100%';
        canvas.style.display = 'block';
        canvas.style.objectFit = 'cover';
        canvas.setAttribute('aria-hidden', 'true');
        container.appendChild(canvas);
        const gl = canvas.getContext('webgl', { preserveDrawingBuffer: false }) || canvas.getContext('experimental-webgl');
        if (!gl) return false;
        this._canvas = canvas;
        this._gl = gl;
        // simple textured quad
        const vs = `attribute vec2 a_pos; varying vec2 v_uv; void main(){ v_uv = (a_pos+1.0)*0.5; gl_Position = vec4(a_pos, 0.0, 1.0); }`;
        const fs = `precision mediump float; varying vec2 v_uv; uniform sampler2D u_tex; void main(){ gl_FragColor = texture2D(u_tex, v_uv); }`;
        const vsh = gl.createShader(gl.VERTEX_SHADER);
        gl.shaderSource(vsh, vs);
        gl.compileShader(vsh);
        const fsh = gl.createShader(gl.FRAGMENT_SHADER);
        gl.shaderSource(fsh, fs);
        gl.compileShader(fsh);
        const prog = gl.createProgram();
        gl.attachShader(prog, vsh);
        gl.attachShader(prog, fsh);
        gl.linkProgram(prog);
        if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
          console.warn('WGWebGL: program link failed');
          return false;
        }
        this._program = prog;
        // position buffer for full-screen quad
        const pos = new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]);
        const posBuf = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
        gl.bufferData(gl.ARRAY_BUFFER, pos, gl.STATIC_DRAW);
        this._posBuffer = posBuf;
        // texture
        const tex = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        this._texture = tex;
        // resize handling
        const resize = () => {
          const w = container.clientWidth || window.innerWidth;
          const h = container.clientHeight || window.innerHeight;
          canvas.width = Math.max(1, Math.floor(w * (window.devicePixelRatio || 1)));
          canvas.height = Math.max(1, Math.floor(h * (window.devicePixelRatio || 1)));
          gl.viewport(0, 0, canvas.width, canvas.height);
        };
        window.addEventListener('resize', resize);
        resize();
        return true;
      } catch (e) {
        console.warn('WGWebGL init failed', e);
        return false;
      }
    },
    isAvailable() {
      try {
        return !!this._gl;
      } catch {
        return false;
      }
    },
    async renderImage(url) {
      if (!this._gl || !this._canvas) return false;
      const gl = this._gl;
      try {
        // fetch image as blob to avoid cross-origin taint when possible
        const resp = await fetch(url, { mode: 'cors' });
        const blob = await resp.blob();
        const bitmap = await createImageBitmap(blob).catch(() => null);
        if (!bitmap) {
          // fallback to Image element
          return new Promise((resolve) => {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => {
              gl.bindTexture(gl.TEXTURE_2D, this._texture);
              gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
              gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
              this._draw();
              resolve(true);
            };
            img.onerror = () => resolve(false);
            img.src = url;
          });
        }
        gl.bindTexture(gl.TEXTURE_2D, this._texture);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, bitmap);
        this._draw();
        // close bitmap to free memory
        try { bitmap.close(); } catch {}
        return true;
      } catch (e) {
        console.warn('WGWebGL.renderImage failed', e);
        return false;
      }
    },
    _draw() {
      const gl = this._gl;
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.useProgram(this._program);
      gl.bindBuffer(gl.ARRAY_BUFFER, this._posBuffer);
      const aPos = gl.getAttribLocation(this._program, 'a_pos');
      gl.enableVertexAttribArray(aPos);
      gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this._texture);
      const uTex = gl.getUniformLocation(this._program, 'u_tex');
      gl.uniform1i(uTex, 0);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    },
    dispose() {
      try {
        if (this._canvas && this._canvas.parentNode) this._canvas.parentNode.removeChild(this._canvas);
        this._canvas = null;
        this._gl = null;
        this._program = null;
        this._texture = null;
        this._posBuffer = null;
      } catch {}
    }
  };
  global.WGWebGL = WGWebGL;
})(window);
