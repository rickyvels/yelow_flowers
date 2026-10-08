// Fondo algorítmico del cielo (canvas fijo detrás de toda la página):
//  - Girasol de la intro con filotaxis: cada semilla gira el ángulo dorado (≈137.5°),
//    igual que en los girasoles reales, y lleva 21 + 34 pétalos (números de Fibonacci).
//  - Cielo que pasa de noche a amanecer mientras se desliza la página.
//  - Vía láctea: polvo de estrellas con distribución normal (Box–Muller) alrededor de una curva.
//  - Pradera de flores amarillas que se mecen con ruido de Perlin y se apartan al pasar el dedo.
//  - Luciérnagas que flotan siguiendo un campo de flujo de ruido de Perlin 3D.
//  - Corazón paramétrico x = 16·sin³t, y = 13·cos t − 5·cos 2t − 2·cos 3t − cos 4t,
//    repartido por longitud de arco; las luciérnagas llegan a él con un resorte amortiguado.
//  - Fuegos artificiales con forma de rosa polar r = cos(kθ).
//  - Estrellas fugaces, pétalos que caen y flores de filotaxis donde se toca la pantalla.
var Fondo = (function () {
  const canvas = document.getElementById("cielo");
  const ctx = canvas.getContext("2d");
  const hero = document.getElementById("inicio");
  const { perlin: ruido, gauss, TAU, ANGULO_DORADO } = Ruido;
  const reducido = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  let W = 0;
  let H = 0;
  let DPR = 1;
  let esc = 1; // escala según el tamaño de pantalla
  let reloj = 0;
  let enEscena = false;
  let inicioEscena = 0;
  let capaEstrellas = null;
  let titilantes = [];
  let luciernagas = [];
  let fugaces = [];
  let petalos = [];
  let floraciones = [];
  let pradera = [];
  let cohetes = [];
  let chispas = [];
  let proximaFugaz = 2;
  let lluviaHasta = 0;
  let idCorazon = 0;
  const puntero = { x: 0, y: 0, vx: 0, hasta: 0, t: 0 };

  const girasol = { semillas: reducido ? 260 : 480, crecimiento: 0, giro: 0, explosion: -1, colores: [] };
  const corazon = { activo: false, fuerza: 0, cx: 0, cy: 0, s: 1, orden: [], ancla: null };

  function limitar(v, min, max) {
    return Math.max(min, Math.min(max, v));
  }

  function rebote(t) {
    const c = 1.70158;
    return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2);
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
  const brilloNaranja = crearBrillo("rgba(255, 120, 30, 0.95)", "rgba(255, 90, 0, 0.16)");

  // Cabeza de flor pre-dibujada: pétalos alrededor y centro de semillas en filotaxis
  function crearCabeza({ petalos = 13, hue = 48, luz = 56, ancho = 7, centro = "#6b3f10", rc = 12 } = {}) {
    const c = document.createElement("canvas");
    c.width = c.height = 96;
    const g = c.getContext("2d");
    g.translate(48, 48);
    const giro = Math.random() * TAU;
    for (let i = 0; i < petalos; i++) {
      g.save();
      g.rotate((i / petalos) * TAU + giro);
      g.fillStyle = `hsl(${hue + (i % 2) * 4}, 100%, ${luz + (i % 2) * 6}%)`;
      g.beginPath();
      g.ellipse(0, -24, ancho, 20, 0, 0, TAU);
      g.fill();
      g.restore();
    }
    g.fillStyle = centro;
    g.beginPath();
    g.arc(0, 0, rc, 0, TAU);
    g.fill();
    for (let k = 0; k < 70; k++) {
      const r = rc * 0.92 * Math.sqrt(k / 70);
      const a = k * ANGULO_DORADO;
      g.fillStyle = `rgba(255, 196, 80, ${0.2 + (0.55 * k) / 70})`;
      g.beginPath();
      g.arc(Math.cos(a) * r, Math.sin(a) * r, 1.3, 0, TAU);
      g.fill();
    }
    return c;
  }

  const cabezas = [
    crearCabeza({ petalos: 13, hue: 48, luz: 55, ancho: 7 }),
    crearCabeza({ petalos: 8, hue: 45, luz: 58, ancho: 10, centro: "#9a4f16", rc: 11 }),
    crearCabeza({ petalos: 21, hue: 44, luz: 52, ancho: 5, centro: "#4f2f0d", rc: 15 }),
    crearCabeza({ petalos: 5, hue: 51, luz: 62, ancho: 13, centro: "#e08a1e", rc: 9 }),
    crearCabeza({ petalos: 34, hue: 47, luz: 56, ancho: 3.6, centro: "#432709", rc: 17 }),
  ];

  // Pétalo: dos curvas cuadráticas desde la base (0,0) hasta la punta (0,largo)
  function trazarPetalo(largo, ancho) {
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(ancho, largo * 0.45, 0, largo);
    ctx.quadraticCurveTo(-ancho, largo * 0.45, 0, 0);
    ctx.fill();
  }

  // ---------- Cielo: degradado según el scroll + nebulosa, vía láctea y estrellas ----------
  const PALETAS = [
    [[20, 28, 66], [8, 12, 34], [0, 0, 0]], // noche
    [[28, 22, 72], [34, 16, 58], [10, 5, 22]], // violeta
    [[44, 48, 116], [112, 54, 100], [205, 118, 70]], // amanecer
  ];

  function colorCielo(p) {
    const tramo = Math.min(1.999, p * 2);
    const i = Math.floor(tramo);
    const f = (tramo - i) * (tramo - i) * (3 - 2 * (tramo - i));
    return PALETAS[i].map((c, k) => c.map((v, j) => Math.round(v + (PALETAS[i + 1][k][j] - v) * f)));
  }

  function dibujarCielo(p) {
    const [arriba, medio, abajo] = colorCielo(p);
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, `rgb(${arriba})`);
    g.addColorStop(0.5, `rgb(${medio})`);
    g.addColorStop(1, `rgb(${abajo})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    if (p > 0.55) {
      // El sol empieza a asomar al final del recorrido
      const q = (p - 0.55) / 0.45;
      const r = Math.max(W, H) * 0.65;
      const sol = ctx.createRadialGradient(W / 2, H * 1.08, 0, W / 2, H * 1.08, r);
      sol.addColorStop(0, `rgba(255, 214, 120, ${0.5 * q})`);
      sol.addColorStop(0.35, `rgba(255, 150, 80, ${0.2 * q})`);
      sol.addColorStop(1, "rgba(255, 150, 80, 0)");
      ctx.fillStyle = sol;
      ctx.fillRect(0, 0, W, H);
    }
    ctx.globalAlpha = 1 - 0.7 * p;
    ctx.drawImage(capaEstrellas, 0, 0, W, H);
    ctx.globalAlpha = 1;
  }

  function pintarEstrellas() {
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

  function dibujarTitilantes(p) {
    ctx.strokeStyle = "#e9f0ff";
    ctx.lineWidth = 0.6;
    const brillo = 1 - 0.6 * p;
    for (const e of titilantes) {
      const b = Math.pow(0.5 + 0.5 * Math.sin(reloj * e.f + e.fase), 3);
      const s = e.r * 7;
      ctx.globalAlpha = (0.25 + 0.75 * b) * brillo;
      ctx.drawImage(brilloBlanco, e.x - s / 2, e.y - s / 2, s, s);
      if (e.cruz && b > 0.55) {
        const l = e.r * 9 * b;
        ctx.globalAlpha = (b - 0.55) * 1.6 * brillo;
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

  // ---------- Suelo y pradera de flores amarillas del inicio ----------
  function crearPradera() {
    const n = Math.round(limitar(W / 18, 20, 56) * (reducido ? 0.6 : 1));
    pradera = [];
    for (let i = 0; i < n; i++) {
      const x = ((i + 0.15 + Math.random() * 0.7) / n) * W; // repartidas pero no en fila
      const lejos = Math.random(); // 1 = al fondo, más chica y más arriba
      pradera.push({
        x,
        base: 0.012 + lejos * 0.07,
        alto: (60 + Math.random() * 110) * esc * (1 - lejos * 0.35),
        tam: (9 + Math.random() * 8) * esc * (1 - lejos * 0.3),
        lejos,
        cabeza: cabezas[Math.floor(Math.random() * cabezas.length)],
        hoja: Math.random() < 0.5 ? -1 : 1,
        retraso: 1.2 + Math.abs(x / W - 0.5) * 4 + Math.random() * 0.8,
        crecer: enEscena ? 1 : 0,
        a: 0, // inclinación extra (resorte) cuando el dedo la empuja
        w: 0,
        fase: Math.random() * 100,
      });
    }
    pradera.sort((a, b) => b.lejos - a.lejos); // primero las del fondo
  }

  function dibujarSuelo(piso) {
    if (piso < -H * 0.35 || piso - H * 0.45 > H) return;
    const g = ctx.createLinearGradient(0, piso - H * 0.45, 0, piso + H * 0.35);
    g.addColorStop(0, "rgba(0, 0, 0, 0)");
    g.addColorStop(0.55, "rgba(0, 0, 0, 1)");
    g.addColorStop(0.62, "rgba(0, 0, 0, 1)");
    g.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, piso - H * 0.45, W, H * 0.8);
  }

  function dibujarPradera(dt, piso) {
    if (!enEscena || piso < -20 || piso - H * 0.5 > H) return;
    const tEscena = reloj - inicioEscena;
    const conPuntero = reloj < puntero.hasta;
    const radio = 90 * esc;
    ctx.lineCap = "round";
    for (const f of pradera) {
      if (tEscena > f.retraso) f.crecer = Math.min(1, f.crecer + dt / 1.6);
      if (f.crecer <= 0) continue;
      const bx = f.x;
      const by = piso - f.base * H;
      const alto = f.alto * Math.min(1, f.crecer * 1.4);

      if (conPuntero) {
        const dx = puntero.x - bx;
        const dy = puntero.y - (by - alto * 0.7);
        const d2 = dx * dx + dy * dy;
        if (d2 < radio * radio) f.w += limitar(puntero.vx, -2500, 2500) * 0.004 * dt * 60 * (1 - Math.sqrt(d2) / radio);
      }
      f.w += (-26 * f.a - 3.2 * f.w) * dt; // resorte amortiguado: vuelve a su lugar
      f.a += f.w * dt;
      f.a = limitar(f.a, -1.1, 1.1);

      const ang = ruido(f.x * 0.004, reloj * 0.35, 3.7) * 0.4 + f.a;
      const hx = bx + Math.sin(ang) * alto;
      const hy = by - Math.cos(ang) * alto;
      const qx = bx + Math.sin(ang * 0.35) * alto * 0.5;
      const qy = by - alto * 0.55;
      const tono = 1 - f.lejos * 0.45;

      ctx.globalAlpha = tono;
      ctx.strokeStyle = "#1c8f6a";
      ctx.lineWidth = Math.max(1, 2.2 * esc * (1 - f.lejos * 0.4));
      ctx.beginPath();
      ctx.moveTo(bx, by);
      ctx.quadraticCurveTo(qx, qy, hx, hy);
      ctx.stroke();

      // Una hoja a media altura
      const mx = (bx + 2 * qx + hx) / 4;
      const my = (by + 2 * qy + hy) / 4;
      ctx.fillStyle = "#2fb36c";
      ctx.save();
      ctx.translate(mx, my);
      ctx.rotate(ang + f.hoja * 1.1);
      ctx.scale(1, Math.min(1, f.crecer * 1.5));
      trazarPetalo(f.tam * 1.6, f.tam * 0.45);
      ctx.restore();

      // La flor se abre al final del crecimiento, con un pequeño rebote
      const abrir = limitar((f.crecer - 0.45) / 0.55, 0, 1);
      if (abrir > 0) {
        const s = f.tam * 2.2 * rebote(abrir);
        ctx.save();
        ctx.translate(hx, hy);
        ctx.rotate(ang + Math.sin(reloj * 0.8 + f.fase) * 0.15);
        ctx.drawImage(f.cabeza, -s / 2, -s / 2, s, s);
        ctx.restore();
      }
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
    if (corazon.ancla && f > 0.001) {
      const a = corazon.ancla();
      corazon.cx = a.x;
      corazon.cy = a.y;
      corazon.s = a.ancho / 34;
    }
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
  // Un "ancla" dice dónde va el corazón en cada cuadro: {x, y, ancho} en la pantalla
  function anclaHero() {
    const r = hero.getBoundingClientRect();
    const horizontal = r.width > r.height;
    const ancho = horizontal ? Math.min(r.width * 0.32, r.height * 0.38) : Math.min(r.width * 0.78, r.height * 0.38);
    return { x: r.left + r.width / 2, y: r.top + r.height * (horizontal ? 0.25 : 0.28), ancho };
  }

  function anclaPantalla() {
    return { x: W / 2, y: H * 0.42, ancho: Math.min(W * 0.75, H * 0.5) };
  }

  function anclaElemento(el, factor = 1) {
    return () => {
      const r = el.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2, ancho: Math.min(W * 0.94, r.width * factor) };
    };
  }

  function calcularCorazon() {
    const a = corazon.ancla();
    corazon.cx = a.x;
    corazon.cy = a.y;
    corazon.s = a.ancho / 34;
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

  function soltarCorazon(id) {
    if (id !== undefined && id !== idCorazon) return; // ya hay otro corazón formándose
    if (!corazon.activo) return;
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

  // ---------- Fuegos artificiales con forma de rosa polar r = cos(kθ) ----------
  function lanzarCohete(x, y) {
    cohetes.push({ x0: x + (Math.random() - 0.5) * W * 0.15, y0: H + 20, x, y, t: 0, dur: 0.8 + Math.random() * 0.35 });
  }

  function explotar(x, y) {
    const k = [2, 3, 4, 5, 6, 7][Math.floor(Math.random() * 6)];
    const rango = k % 2 ? Math.PI : TAU; // con k impar la rosa se cierra en media vuelta
    const n = reducido ? 50 : W < 600 ? 80 : 120;
    const R = (85 + Math.random() * 70) * esc;
    const giro = Math.random() * TAU;
    const azar = Math.random();
    const sprite = azar < 0.18 ? brilloNaranja : azar < 0.6 ? brilloDorado : azar < 0.85 ? brilloAmbar : brilloBlanco;
    for (let i = 0; i < n; i++) {
      const th = (i / n) * rango;
      const r = Math.cos(k * th);
      chispas.push({
        cx: x,
        cy: y,
        tx: r * Math.cos(th + giro) * R,
        ty: r * Math.sin(th + giro) * R,
        t: 0,
        vy: 0,
        sprite,
        tam: (6 + Math.random() * 5) * esc,
        vida: 2 + Math.random() * 0.8,
        fase: Math.random() * TAU,
      });
    }
    for (let i = 0; i < 16; i++) {
      // un anillo pequeño en el centro, como el corazón de la flor
      const th = (i / 16) * TAU;
      chispas.push({ cx: x, cy: y, tx: Math.cos(th) * R * 0.18, ty: Math.sin(th) * R * 0.18, t: 0, vy: 0, sprite: brilloBlanco, tam: 7 * esc, vida: 1.6, fase: 0 });
    }
    if (chispas.length > 1600) chispas.splice(0, chispas.length - 1600);
  }

  function dibujarFuegos(dt) {
    for (const c of cohetes) {
      c.t += dt;
      const e = 1 - Math.pow(1 - Math.min(1, c.t / c.dur), 2);
      const x = c.x0 + (c.x - c.x0) * e;
      const y = c.y0 + (c.y - c.y0) * e;
      for (let i = 0; i < 6; i++) {
        // estela
        const eAtras = 1 - Math.pow(1 - Math.max(0, Math.min(1, (c.t - i * 0.03) / c.dur)), 2);
        const s = (7 - i) * esc;
        ctx.globalAlpha = 0.8 - i * 0.12;
        ctx.drawImage(brilloAmbar, c.x0 + (c.x - c.x0) * eAtras - s / 2, c.y0 + (c.y - c.y0) * eAtras - s / 2, s, s);
      }
      if (c.t >= c.dur) explotar(x, y);
    }
    cohetes = cohetes.filter((c) => c.t < c.dur);

    for (const c of chispas) {
      c.t += dt;
      const e = 1 - Math.pow(1 - Math.min(1, c.t / 0.75), 3);
      if (c.t > 0.75) {
        c.vy += 70 * esc * dt; // después de abrirse, la flor de chispas cae despacio
        c.cy += c.vy * dt;
      }
      const a = c.t < 1 ? 1 : Math.max(0, 1 - (c.t - 1) / (c.vida - 1));
      ctx.globalAlpha = a * (0.65 + 0.35 * Math.sin(c.t * 25 + c.fase));
      const s = c.tam * (1.4 - 0.4 * e);
      ctx.drawImage(c.sprite, c.cx + c.tx * e - s / 2, c.cy + c.ty * e - s / 2, s, s);
    }
    chispas = chispas.filter((c) => c.t < c.vida);
  }

  // ---------- Estrellas fugaces ----------
  function dibujarFugaces(dt, p) {
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
      const a = Math.sin(Math.min(1, f.vida / f.dur) * Math.PI) * (1 - 0.6 * p);
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
    const base = reducido ? 5 : W > H ? 16 : 10;
    return reloj < lluviaHasta ? base * 3 : base;
  }

  function nuevoPetalo(arriba = -30 - Math.random() * H * 0.8) {
    return {
      x: Math.random() * W,
      y: arriba,
      tam: (7 + Math.random() * 7) * esc,
      vy: (16 + Math.random() * 26) * esc * (reloj < lluviaHasta ? 3.2 : 1), // la lluvia cae rápido y pasa
      amp: (14 + Math.random() * 30) * esc,
      frec: 0.4 + Math.random() * 0.6,
      fase: Math.random() * TAU,
      rot: Math.random() * TAU,
      vrot: (Math.random() - 0.5) * 1.4,
      giro: Math.random() * TAU,
      vgiro: 1 + Math.random() * 2.2,
    };
  }

  function dibujarPetalos(dt) {
    if (!enEscena) return;
    const objetivo = cantidadPetalos();
    for (let i = 0; i < 3 && petalos.length < objetivo; i++) {
      petalos.push(nuevoPetalo(petalos.length < 3 ? undefined : -20 - Math.random() * 60));
    }
    for (const p of petalos) {
      p.y += p.vy * dt;
      p.rot += p.vrot * dt;
      p.giro += p.vgiro * dt;
      if (p.y > H + 40) {
        if (petalos.length > objetivo) p.borrar = true;
        else Object.assign(p, nuevoPetalo(-30));
      }
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
    if (petalos.some((p) => p.borrar)) petalos = petalos.filter((p) => !p.borrar);
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
    if (floraciones.length > 14) floraciones.shift();
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
    const anchoAntes = W;
    W = window.innerWidth;
    H = window.innerHeight;
    DPR = dpr;
    esc = limitar(Math.min(W, H) / 700, 0.6, 1.4);
    canvas.width = Math.round(W * DPR);
    canvas.height = Math.round(H * DPR);
    pintarEstrellas();
    crearTitilantes();
    ajustarLuciernagas();
    if (W !== anchoAntes) crearPradera(); // en el celular la barra de direcciones solo cambia el alto
    if (corazon.activo) calcularCorazon();
  }

  let ultimo = performance.now();
  function cuadro(ahora) {
    const dt = Math.min(0.05, Math.max(0, (ahora - ultimo) / 1000));
    ultimo = ahora;
    reloj += dt;
    puntero.vx *= Math.pow(0.02, dt); // el empujón del dedo se apaga si deja de moverse
    requestAnimationFrame(cuadro);
    if (!W || !H) return redimensionar(); // la ventana todavía no tiene tamaño

    const maxScroll = document.documentElement.scrollHeight - H;
    const progreso = maxScroll > 0 ? limitar(window.scrollY / maxScroll, 0, 1) : 0;
    const piso = hero.getBoundingClientRect().bottom;

    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
    dibujarCielo(progreso);

    ctx.globalCompositeOperation = "lighter";
    dibujarTitilantes(progreso);
    ctx.globalCompositeOperation = "source-over";
    dibujarGirasol(dt);
    dibujarSuelo(piso);
    dibujarPradera(dt, piso);
    dibujarPetalos(dt);
    ctx.globalCompositeOperation = "lighter";
    dibujarFugaces(dt, progreso);
    dibujarFuegos(dt);
    dibujarCorazon();
    dibujarLuciernagas(dt);
    dibujarFloraciones(dt);
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
  }

  window.addEventListener("resize", redimensionar);
  window.addEventListener(
    "pointermove",
    (e) => {
      const ahora = performance.now();
      const dt = Math.max(8, ahora - puntero.t) / 1000;
      puntero.vx = (e.clientX - puntero.x) / dt;
      puntero.x = e.clientX;
      puntero.y = e.clientY;
      puntero.t = ahora;
      puntero.hasta = reloj + 1.5;
    },
    { passive: true }
  );
  window.addEventListener("pointerdown", (e) => {
    if (e.target.closest("button, a, input, label, .interactivo")) return;
    florecer(e.clientX, e.clientY);
  });

  redimensionar();
  requestAnimationFrame(cuadro);

  return {
    // El girasol estalla y sus semillas se convierten en luciérnagas
    iniciarEscena() {
      if (enEscena) return;
      enEscena = true;
      inicioEscena = reloj;
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
    },
    // Devuelve un id para soltar solo ese corazón (y no uno que se formó después)
    formarCorazon(ancla) {
      corazon.activo = true;
      corazon.ancla = ancla || anclaHero;
      calcularCorazon();
      return ++idCorazon;
    },
    soltarCorazon,
    anclaHero,
    anclaPantalla,
    anclaElemento,
    florecer,
    // Lanza un cohete que explota en (x, y) de la pantalla
    fuegos(x = W * (0.2 + Math.random() * 0.6), y = H * (0.15 + Math.random() * 0.3)) {
      lanzarCohete(x, y);
    },
    lluvia(segundos = 6) {
      lluviaHasta = reloj + segundos;
    },
    crearCabeza,
  };
})();
