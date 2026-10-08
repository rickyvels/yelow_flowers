// Fondo algorítmico del cielo (canvas):
//  - Girasol de la intro con filotaxis: cada semilla gira el ángulo dorado (≈137.5°),
//    igual que en los girasoles reales, y lleva 21 + 34 pétalos (números de Fibonacci).
//  - Vía láctea: polvo de estrellas con distribución normal (Box–Muller) alrededor de una curva.
//  - Luciérnagas que flotan siguiendo un campo de flujo de ruido de Perlin 3D.
//  - Corazón paramétrico x = 16·sin³t, y = 13·cos t − 5·cos 2t − 2·cos 3t − cos 4t,
//    repartido por longitud de arco; las luciérnagas llegan a él con un resorte amortiguado.
//  - Estrellas fugaces, pétalos que caen y flores de filotaxis donde se toca la pantalla.
var Fondo = (function () {
  const canvas = document.getElementById("cielo");
  const ctx = canvas.getContext("2d");
  const TAU = Math.PI * 2;
  const ANGULO_DORADO = Math.PI * (3 - Math.sqrt(5));
  const reducido = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  let W = 0;
  let H = 0;
  let DPR = 1;
  let esc = 1; // escala según el tamaño de pantalla
  let reloj = 0;
  let enEscena = false;
  let capaEstrellas = null;
  let titilantes = [];
  let luciernagas = [];
  let fugaces = [];
  let petalos = [];
  let floraciones = [];
  let proximaFugaz = 2;
  const puntero = { x: 0, y: 0, hasta: 0 };

  const girasol = { semillas: reducido ? 260 : 480, crecimiento: 0, giro: 0, explosion: -1, colores: [] };
  const corazon = { activo: false, fuerza: 0, cx: 0, cy: 0, s: 1, orden: [] };

  // ---------- Ruido de Perlin 3D ("improved noise", Ken Perlin 2002) ----------
  const perm = new Uint8Array(512);
  (function () {
    const p = [];
    for (let i = 0; i < 256; i++) p[i] = i;
    for (let i = 255; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [p[i], p[j]] = [p[j], p[i]];
    }
    for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
  })();

  function suavizar(t) {
    return t * t * t * (t * (t * 6 - 15) + 10);
  }

  function mezclar(a, b, t) {
    return a + t * (b - a);
  }

  function gradiente(hash, x, y, z) {
    const h = hash & 15;
    const u = h < 8 ? x : y;
    const v = h < 4 ? y : h === 12 || h === 14 ? x : z;
    return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
  }

  function ruido(x, y, z) {
    const X = Math.floor(x) & 255;
    const Y = Math.floor(y) & 255;
    const Z = Math.floor(z) & 255;
    x -= Math.floor(x);
    y -= Math.floor(y);
    z -= Math.floor(z);
    const u = suavizar(x);
    const v = suavizar(y);
    const w = suavizar(z);
    const A = perm[X] + Y;
    const AA = perm[A] + Z;
    const AB = perm[A + 1] + Z;
    const B = perm[X + 1] + Y;
    const BA = perm[B] + Z;
    const BB = perm[B + 1] + Z;
    return mezclar(
      mezclar(
        mezclar(gradiente(perm[AA], x, y, z), gradiente(perm[BA], x - 1, y, z), u),
        mezclar(gradiente(perm[AB], x, y - 1, z), gradiente(perm[BB], x - 1, y - 1, z), u),
        v
      ),
      mezclar(
        mezclar(gradiente(perm[AA + 1], x, y, z - 1), gradiente(perm[BA + 1], x - 1, y, z - 1), u),
        mezclar(gradiente(perm[AB + 1], x, y - 1, z - 1), gradiente(perm[BB + 1], x - 1, y - 1, z - 1), u),
        v
      ),
      w
    );
  }

  // Número aleatorio con distribución normal (transformada de Box–Muller)
  function gauss() {
    let u = 0;
    while (u === 0) u = Math.random();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(TAU * Math.random());
  }

  function limitar(v, min, max) {
    return Math.max(min, Math.min(max, v));
  }

  // ---------- Destellos pre-dibujados (mucho más rápido que un gradiente por partícula) ----------
  function crearBrillo(centro, medio) {
    const c = document.createElement("canvas");
    c.width = c.height = 64;
    const g = c.getContext("2d");
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, "rgba(255, 255, 240, 1)");
    grad.addColorStop(0.12, centro);
    grad.addColorStop(0.4, medio);
    grad.addColorStop(1, "rgba(0, 0, 0, 0)");
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    return c;
  }

  const brilloDorado = crearBrillo("rgba(255, 222, 110, 0.95)", "rgba(255, 180, 40, 0.16)");
  const brilloAmbar = crearBrillo("rgba(255, 170, 50, 0.9)", "rgba(230, 110, 20, 0.14)");
  const brilloBlanco = crearBrillo("rgba(215, 230, 255, 0.85)", "rgba(140, 170, 255, 0.1)");

  // Pétalo: dos curvas cuadráticas desde la base (0,0) hasta la punta (0,largo)
  function trazarPetalo(largo, ancho) {
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(ancho, largo * 0.45, 0, largo);
    ctx.quadraticCurveTo(-ancho, largo * 0.45, 0, 0);
    ctx.fill();
  }

  // ---------- Cielo estático: nebulosa + vía láctea + estrellas ----------
  function pintarCielo() {
    capaEstrellas = document.createElement("canvas");
    capaEstrellas.width = canvas.width;
    capaEstrellas.height = canvas.height;
    const g = capaEstrellas.getContext("2d");
    g.setTransform(DPR, 0, 0, DPR, 0, 0);
    const area = W * H;
    const banda = (u) => ({
      x: u * W,
      y: H * (0.06 + 0.3 * u) + Math.sin(u * Math.PI) * H * 0.07,
    });

    for (let i = 0; i < 7; i++) {
      const p = banda(Math.random());
      const r = Math.max(W, H) * (0.12 + Math.random() * 0.12);
      const tono = i % 2 ? "125, 105, 255" : "255, 125, 190"; // violeta y rosa
      const grad = g.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
      grad.addColorStop(0, `rgba(${tono}, ${0.045 + Math.random() * 0.04})`);
      grad.addColorStop(1, `rgba(${tono}, 0)`);
      g.fillStyle = grad;
      g.fillRect(p.x - r, p.y - r, r * 2, r * 2);
    }

    const polvo = Math.min(3200, Math.round(area / 450));
    for (let i = 0; i < polvo; i++) {
      const p = banda(Math.random());
      const x = p.x + gauss() * H * 0.03;
      const y = p.y + gauss() * H * 0.045;
      const r = Math.random() < 0.9 ? 0.7 : 1.3;
      g.fillStyle = `rgba(215, 225, 255, ${0.08 + Math.random() * 0.35})`;
      g.fillRect(x, y, r, r);
    }

    const sueltas = Math.min(750, Math.round(area / 2400));
    for (let i = 0; i < sueltas; i++) {
      const x = Math.random() * W;
      const y = Math.pow(Math.random(), 1.6) * H; // más estrellas arriba
      const a = (0.25 + Math.random() * 0.6) * (1 - (y / H) * 0.7);
      g.fillStyle = Math.random() < 0.15 ? `rgba(255, 236, 200, ${a})` : `rgba(225, 235, 255, ${a})`;
      g.beginPath();
      g.arc(x, y, 0.3 + Math.random() * 1.1, 0, TAU);
      g.fill();
    }
  }

  function crearTitilantes() {
    const n = Math.round(limitar((W * H) / 14000, 30, 90));
    titilantes = [];
    for (let i = 0; i < n; i++) {
      titilantes.push({
        x: Math.random() * W,
        y: Math.pow(Math.random(), 1.5) * H * 0.85,
        r: 0.8 + Math.random() * 1.4,
        f: 0.4 + Math.random() * 1.6,
        fase: Math.random() * TAU,
        cruz: Math.random() < 0.18,
      });
    }
  }

  function dibujarTitilantes() {
    ctx.strokeStyle = "#e9f0ff";
    ctx.lineWidth = 0.6;
    for (const e of titilantes) {
      const b = Math.pow(0.5 + 0.5 * Math.sin(reloj * e.f + e.fase), 3);
      const s = e.r * 7;
      ctx.globalAlpha = 0.25 + 0.75 * b;
      ctx.drawImage(brilloBlanco, e.x - s / 2, e.y - s / 2, s, s);
      if (e.cruz && b > 0.55) {
        const l = e.r * 9 * b;
        ctx.globalAlpha = (b - 0.55) * 1.6;
        ctx.beginPath();
        ctx.moveTo(e.x - l, e.y);
        ctx.lineTo(e.x + l, e.y);
        ctx.moveTo(e.x, e.y - l);
        ctx.lineTo(e.x, e.y + l);
        ctx.stroke();
      }
    }
  }

  // ---------- Girasol de filotaxis (intro) ----------
  function medidasGirasol() {
    let R = Math.min(W, H) * 0.36;
    let cy = H / 2;
    if (H >= (W * 4) / 3) {
      // En vertical el girasol va encima del saludo para no taparlo
      const espacio = Math.max(H * 0.3, document.getElementById("saludo").getBoundingClientRect().top - 12);
      R = Math.min(R, espacio / 2.5);
      cy = espacio / 2;
    }
    return { cx: W / 2, cy, R, c: (R * 0.8) / Math.sqrt(girasol.semillas) };
  }

  function semilla(k, m) {
    const ang = k * ANGULO_DORADO + girasol.giro;
    const r = m.c * Math.sqrt(k);
    return { x: m.cx + Math.cos(ang) * r, y: m.cy + Math.sin(ang) * r, ang };
  }

  for (let k = 0; k < girasol.semillas; k++) {
    const t = k / girasol.semillas;
    girasol.colores.push(`hsl(${26 + 16 * t}, ${65 + 25 * t}%, ${16 + 26 * t}%)`);
  }

  function dibujarGirasol(dt) {
    if (girasol.explosion >= 1) return;
    girasol.crecimiento = Math.min(1, girasol.crecimiento + dt / 4.5);
    girasol.giro += dt * 0.05;
    if (girasol.explosion >= 0) girasol.explosion = Math.min(1, girasol.explosion + dt / 1.6);

    const ex = Math.max(0, girasol.explosion);
    const empuje = 1 + 2.5 * ex * ex;
    const alfa = 0.6 * (1 - ex);
    const { cx, cy, R, c } = medidasGirasol();

    // Pétalos (21 atrás, 34 adelante) que se abren cuando las semillas casi terminan
    const apertura = limitar((girasol.crecimiento - 0.55) / 0.45, 0, 1);
    if (apertura > 0) {
      const capas = [
        { n: 21, largo: 0.5, ancho: 0.11, color: "hsl(40, 95%, 40%)", desfase: 0.5 },
        { n: 34, largo: 0.44, ancho: 0.08, color: "hsl(48, 100%, 55%)", desfase: 0 },
      ];
      for (const capa of capas) {
        ctx.fillStyle = capa.color;
        ctx.globalAlpha = alfa * apertura;
        for (let i = 0; i < capa.n; i++) {
          const ang = ((i + capa.desfase) / capa.n) * TAU + girasol.giro * 0.5;
          const base = R * 0.74 * empuje;
          ctx.save();
          ctx.translate(cx + Math.cos(ang) * base, cy + Math.sin(ang) * base);
          ctx.rotate(ang - Math.PI / 2);
          ctx.scale(1, apertura);
          trazarPetalo(R * capa.largo * (0.92 + 0.08 * Math.sin(i * 7.3)), R * capa.ancho);
          ctx.restore();
        }
      }
    }

    // Semillas: la k-ésima gira k·ángulo dorado y se aleja √k del centro
    const visibles = Math.floor(girasol.semillas * (1 - Math.pow(1 - girasol.crecimiento, 3)));
    ctx.globalAlpha = alfa;
    for (let k = 0; k < visibles; k++) {
      const ang = k * ANGULO_DORADO + girasol.giro;
      const r = c * Math.sqrt(k) * empuje;
      const t = k / girasol.semillas;
      ctx.fillStyle = girasol.colores[k];
      ctx.beginPath();
      ctx.arc(cx + Math.cos(ang) * r, cy + Math.sin(ang) * r, c * (0.4 + 0.24 * t), 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  // ---------- Luciérnagas ----------
  function cantidadLuciernagas() {
    return Math.round(limitar((W * H) / 12000, 60, 120) * (reducido ? 0.5 : 1));
  }

  function nuevaLuciernaga(x, y) {
    return {
      x,
      y,
      vx: 0,
      vy: 0,
      r: 1 + Math.random() * 1.6,
      vel: 14 + Math.random() * 24,
      frec: 0.8 + Math.random() * 2,
      fase: Math.random() * TAU,
      aparicion: 0.4,
      objetivo: null,
    };
  }

  function ajustarLuciernagas() {
    if (!enEscena) return;
    const n = cantidadLuciernagas();
    while (luciernagas.length < n) luciernagas.push(nuevaLuciernaga(Math.random() * W, Math.random() * H));
    luciernagas.length = n;
    for (const l of luciernagas) {
      if (l.x > W) l.x = Math.random() * W;
      if (l.y > H) l.y = Math.random() * H;
    }
  }

  function latido() {
    const fase = (reloj % 1.2) / 1.2;
    const pulso = (c, w) => Math.exp(-Math.pow((fase - c) / w, 2));
    return 1 + 0.045 * (pulso(0.1, 0.045) + 0.6 * pulso(0.3, 0.05));
  }

  function dibujarLuciernagas(dt) {
    corazon.fuerza += ((corazon.activo ? 1 : 0) - corazon.fuerza) * Math.min(1, dt * (corazon.activo ? 0.9 : 2.5));
    const f = corazon.fuerza;
    const escalaCorazon = corazon.s * latido();
    const conPuntero = reloj < puntero.hasta && f < 0.3;
    const radio = 170 * esc;

    for (const l of luciernagas) {
      // El campo de flujo: el ruido decide hacia dónde sopla el "viento" en cada punto
      const ang = ruido(l.x * 0.0018, l.y * 0.0018, reloj * 0.06) * TAU * 1.6;
      let ax = (Math.cos(ang) * l.vel * esc - l.vx) * 1.8;
      let ay = (Math.sin(ang) * l.vel * esc - l.vy) * 1.8;

      if (conPuntero) {
        const dx = puntero.x - l.x;
        const dy = puntero.y - l.y;
        const d = Math.hypot(dx, dy) || 1;
        if (d < radio) {
          const k = (1 - d / radio) * esc;
          ax += ((dx / d) * 160 - (dy / d) * 120) * k; // se acercan y giran alrededor
          ay += ((dy / d) * 160 + (dx / d) * 120) * k;
        }
      }

      if (f > 0.001 && l.objetivo) {
        // Resorte críticamente amortiguado hacia su lugar en el corazón
        const tx = corazon.cx + l.objetivo.x * escalaCorazon;
        const ty = corazon.cy + l.objetivo.y * escalaCorazon;
        const sx = (tx - l.x) * 10 - l.vx * 6.3;
        const sy = (ty - l.y) * 10 - l.vy * 6.3;
        ax = ax * (1 - f) + sx * f;
        ay = ay * (1 - f) + sy * f;
      }

      l.vx += ax * dt;
      l.vy += ay * dt;
      l.x += l.vx * dt;
      l.y += l.vy * dt;

      if (f < 0.05) {
        if (l.x < -20) l.x = W + 20;
        else if (l.x > W + 20) l.x = -20;
        if (l.y < -20) l.y = H + 20;
        else if (l.y > H + 20) l.y = -20;
      }

      l.aparicion = Math.min(1, l.aparicion + dt / 1.5);
      const parpadeo = 0.5 + 0.5 * Math.sin(reloj * l.frec + l.fase);
      let a = 0.25 + 0.75 * parpadeo * parpadeo;
      a += (0.95 - a) * f; // en el corazón brillan fijo
      const s = l.r * 16 * esc;
      ctx.globalAlpha = a * l.aparicion;
      ctx.drawImage(brilloDorado, l.x - s / 2, l.y - s / 2, s, s);
    }
  }

  // ---------- Corazón ----------
  function medirCorazon() {
    const horizontal = W > H;
    const ancho = horizontal ? Math.min(W * 0.32, H * 0.38) : Math.min(W * 0.78, H * 0.38);
    corazon.s = ancho / 34;
    corazon.cx = W / 2;
    corazon.cy = horizontal ? H * 0.25 : H * 0.28;
  }

  function calcularCorazon() {
    medirCorazon();
    // Muestreamos la curva y la recorremos por longitud de arco para repartir parejo
    const muestras = [];
    let largo = 0;
    let previo = null;
    for (let i = 0; i <= 720; i++) {
      const t = (i / 720) * TAU;
      const x = 16 * Math.pow(Math.sin(t), 3);
      const y = -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)) - 2.5;
      if (previo) largo += Math.hypot(x - previo.x, y - previo.y);
      previo = { x, y };
      muestras.push({ x, y, largo });
    }
    const n = luciernagas.length;
    const puntos = [];
    let j = 0;
    for (let i = 0; i < n; i++) {
      const meta = (i / n) * largo;
      while (j < muestras.length - 1 && muestras[j].largo < meta) j++;
      puntos.push(muestras[j]);
    }
    // Cada luciérnaga va al punto que le queda "de frente" (ordenadas por ángulo) para que no se crucen
    const orden = luciernagas
      .map((l) => ({ l, a: (Math.atan2(l.y - corazon.cy, l.x - corazon.cx) + Math.PI / 2 + TAU) % TAU }))
      .sort((p, q) => p.a - q.a);
    orden.forEach((o, i) => (o.l.objetivo = puntos[i]));
    corazon.orden = orden.map((o) => o.l);
  }

  function dibujarCorazon() {
    const f = corazon.fuerza;
    if (f < 0.5 || !corazon.orden.length) return;
    const cy = corazon.cy - 2 * corazon.s;
    const r = corazon.s * 18;
    const halo = ctx.createRadialGradient(corazon.cx, cy, 0, corazon.cx, cy, r);
    halo.addColorStop(0, "rgba(255, 180, 60, 0.16)");
    halo.addColorStop(1, "rgba(255, 180, 60, 0)");
    ctx.globalAlpha = f;
    ctx.fillStyle = halo;
    ctx.fillRect(corazon.cx - r, cy - r, r * 2, r * 2);

    // Constelación: una línea fina une las luciérnagas del corazón
    ctx.globalAlpha = (f - 0.5) * 0.6;
    ctx.strokeStyle = "rgb(255, 214, 120)";
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    corazon.orden.forEach((l, i) => (i ? ctx.lineTo(l.x, l.y) : ctx.moveTo(l.x, l.y)));
    ctx.closePath();
    ctx.stroke();
  }

  function soltarCorazon() {
    corazon.activo = false;
    for (const l of luciernagas) {
      const dx = l.x - corazon.cx;
      const dy = l.y - corazon.cy;
      const d = Math.hypot(dx, dy) || 1;
      const v = (60 + Math.random() * 160) * esc;
      l.vx += (dx / d) * v;
      l.vy += (dy / d) * v;
    }
  }

  // ---------- Estrellas fugaces ----------
  function dibujarFugaces(dt) {
    proximaFugaz -= dt;
    if (proximaFugaz <= 0) {
      proximaFugaz = (reducido ? 10 : 4) + Math.random() * 8;
      const dir = Math.random() < 0.5 ? 1 : -1;
      const ang = (0.12 + Math.random() * 0.16) * Math.PI;
      const v = (650 + Math.random() * 450) * esc;
      fugaces.push({
        x: W * (0.15 + Math.random() * 0.7),
        y: H * Math.random() * 0.3,
        vx: Math.cos(ang) * v * dir,
        vy: Math.sin(ang) * v,
        vida: 0,
        dur: 0.7 + Math.random() * 0.5,
        largo: (110 + Math.random() * 90) * esc,
      });
    }
    ctx.lineCap = "round";
    for (const f of fugaces) {
      f.vida += dt;
      f.x += f.vx * dt;
      f.y += f.vy * dt;
      const a = Math.sin(Math.min(1, f.vida / f.dur) * Math.PI);
      const v = Math.hypot(f.vx, f.vy);
      const cola = f.largo * a;
      const colaX = f.x - (f.vx / v) * cola;
      const colaY = f.y - (f.vy / v) * cola;
      const grad = ctx.createLinearGradient(f.x, f.y, colaX, colaY);
      grad.addColorStop(0, "rgba(255, 255, 255, 1)");
      grad.addColorStop(1, "rgba(255, 255, 255, 0)");
      ctx.globalAlpha = a;
      ctx.strokeStyle = grad;
      ctx.lineWidth = 1.6 * esc;
      ctx.beginPath();
      ctx.moveTo(f.x, f.y);
      ctx.lineTo(colaX, colaY);
      ctx.stroke();
      const s = 14 * esc;
      ctx.drawImage(brilloBlanco, f.x - s / 2, f.y - s / 2, s, s);
    }
    fugaces = fugaces.filter((f) => f.vida < f.dur);
  }

  // ---------- Pétalos amarillos que caen ----------
  function cantidadPetalos() {
    return reducido ? 5 : W > H ? 16 : 10;
  }

  function nuevoPetalo() {
    return {
      x: Math.random() * W,
      y: -30 - Math.random() * H * 0.8,
      tam: (7 + Math.random() * 7) * esc,
      vy: (16 + Math.random() * 26) * esc,
      amp: (14 + Math.random() * 30) * esc,
      frec: 0.4 + Math.random() * 0.6,
      fase: Math.random() * TAU,
      rot: Math.random() * TAU,
      vrot: (Math.random() - 0.5) * 1.4,
      giro: Math.random() * TAU,
      vgiro: 1 + Math.random() * 2.2,
    };
  }

  function ajustarPetalos() {
    if (!enEscena) return;
    while (petalos.length < cantidadPetalos()) petalos.push(nuevoPetalo());
    petalos.length = cantidadPetalos();
  }

  function dibujarPetalos(dt) {
    for (const p of petalos) {
      p.y += p.vy * dt;
      p.rot += p.vrot * dt;
      p.giro += p.vgiro * dt;
      if (p.y > H + 40) Object.assign(p, nuevoPetalo(), { y: -30 });
      const voltear = Math.cos(p.giro); // simula que el pétalo gira en 3D
      ctx.save();
      ctx.translate(p.x + Math.sin(reloj * p.frec + p.fase) * p.amp, p.y);
      ctx.rotate(p.rot);
      ctx.scale(voltear, 1);
      ctx.translate(0, -p.tam);
      ctx.globalAlpha = 0.85;
      ctx.fillStyle = `hsl(${44 + 6 * voltear}, 100%, ${46 + 16 * Math.abs(voltear)}%)`;
      trazarPetalo(p.tam * 2, p.tam * 0.75);
      ctx.restore();
    }
  }

  // ---------- Flores de filotaxis donde se toca ----------
  function florecer(x, y) {
    floraciones.push({
      x,
      y,
      t: 0,
      n: 70 + Math.floor(Math.random() * 50),
      c: (2.6 + Math.random() * 1.2) * esc,
      giro: Math.random() * TAU,
    });
    if (floraciones.length > 10) floraciones.shift();
    puntero.x = x;
    puntero.y = y;
    puntero.hasta = reloj + 2;
  }

  function dibujarFloraciones(dt) {
    for (const f of floraciones) {
      f.t += dt;
      const crecer = Math.min(1, f.t / 1.1);
      const visibles = Math.floor(f.n * (1 - Math.pow(1 - crecer, 3)));
      const apagar = f.t < 1.6 ? 1 : Math.max(0, 1 - (f.t - 1.6) / 1.4);
      for (let k = 0; k < visibles; k++) {
        const ang = k * ANGULO_DORADO + f.giro + f.t * 0.4;
        const r = f.c * Math.sqrt(k) * (1 + f.t * 0.08);
        const q = k / f.n;
        const s = (3 + q * 7) * esc;
        ctx.globalAlpha = apagar * (0.35 + 0.65 * q);
        ctx.drawImage(q > 0.65 ? brilloDorado : brilloAmbar, f.x + Math.cos(ang) * r - s / 2, f.y + Math.sin(ang) * r - s / 2, s, s);
      }
    }
    floraciones = floraciones.filter((f) => f.t < 3);
  }

  // ---------- Ciclo principal ----------
  function redimensionar() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (capaEstrellas && window.innerWidth === W && window.innerHeight === H && dpr === DPR) return;
    W = window.innerWidth;
    H = window.innerHeight;
    DPR = dpr;
    esc = limitar(Math.min(W, H) / 700, 0.6, 1.4);
    canvas.width = Math.round(W * DPR);
    canvas.height = Math.round(H * DPR);
    pintarCielo();
    crearTitilantes();
    ajustarLuciernagas();
    ajustarPetalos();
    if (corazon.activo) calcularCorazon();
    else medirCorazon();
  }

  let ultimo = performance.now();
  function cuadro(ahora) {
    const dt = Math.min(0.05, Math.max(0, (ahora - ultimo) / 1000));
    ultimo = ahora;
    reloj += dt;
    requestAnimationFrame(cuadro);
    if (!W || !H) return redimensionar(); // la ventana todavía no tiene tamaño

    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
    ctx.clearRect(0, 0, W, H);
    ctx.drawImage(capaEstrellas, 0, 0, W, H);

    ctx.globalCompositeOperation = "lighter";
    dibujarTitilantes();
    ctx.globalCompositeOperation = "source-over";
    dibujarGirasol(dt);
    dibujarPetalos(dt);
    ctx.globalCompositeOperation = "lighter";
    dibujarFugaces(dt);
    dibujarCorazon();
    dibujarLuciernagas(dt);
    dibujarFloraciones(dt);
  }

  window.addEventListener("resize", redimensionar);
  window.addEventListener("pointermove", (e) => {
    puntero.x = e.clientX;
    puntero.y = e.clientY;
    puntero.hasta = reloj + 1.5;
  });
  window.addEventListener("pointerdown", (e) => {
    if (!e.target.closest("button")) florecer(e.clientX, e.clientY);
  });

  redimensionar();
  requestAnimationFrame(cuadro);

  return {
    // El girasol estalla y sus semillas se convierten en luciérnagas
    iniciarEscena() {
      if (enEscena) return;
      enEscena = true;
      girasol.explosion = 0;
      const medidas = medidasGirasol();
      const visibles = Math.max(1, Math.floor(girasol.semillas * (1 - Math.pow(1 - girasol.crecimiento, 3))));
      for (let i = 0, n = cantidadLuciernagas(); i < n; i++) {
        const s = semilla(Math.floor(Math.random() * visibles), medidas);
        const l = nuevaLuciernaga(s.x, s.y);
        const v = (120 + Math.random() * 260) * esc;
        l.vx = Math.cos(s.ang) * v;
        l.vy = Math.sin(s.ang) * v;
        luciernagas.push(l);
      }
      ajustarPetalos();
    },
    formarCorazon() {
      corazon.activo = true;
      calcularCorazon();
    },
    soltarCorazon,
    geometriaCorazon() {
      return {
        x: corazon.cx,
        y: corazon.cy - 1.5 * corazon.s,
        ancho: 32 * corazon.s,
        abajo: corazon.cy + 15 * corazon.s,
      };
    },
  };
})();
