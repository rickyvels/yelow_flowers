// Capítulos interactivos que aparecen al deslizar hacia abajo. Cada uno usa un algoritmo:
//  01 filotaxis + descenso de gradiente con momentum   02 caminatas aleatorias con ruido de Perlin
//  03 una terminal con intérprete de comandos          04 curva de crecimiento exponencial (Catmull-Rom)
//  05 plantas generativas, viento y mariposas          06 fuegos artificiales con rosas polares (en fondo.js)
//  07 su nombre hecho de partículas con resortes
var Secciones = (function () {
  const { perlin: ruido, TAU, ANGULO_DORADO } = Ruido;
  const GRADOS_DORADOS = 360 - 360 / ((1 + Math.sqrt(5)) / 2); // 137.5077…°
  const reducido = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const parametros = new URLSearchParams(location.search);
  const nombre = (parametros.get("para") || CONFIG.nombre || "").normalize("NFC").trim().slice(0, 30);
  const startup = (parametros.get("startup") || CONFIG.startup || "").normalize("NFC").trim().slice(0, 40);
  const suStartup = startup || "tu startup";

  const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
  const limitar = (v, min, max) => Math.max(min, Math.min(max, v));
  const rebote = (t) => 1 + 2.70158 * Math.pow(t - 1, 3) + 1.70158 * Math.pow(t - 1, 2);

  function vibrar(ms) {
    try {
      if (navigator.vibrate) navigator.vibrate(ms);
    } catch (e) {}
  }

  function centro(el) {
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }

  // ---------- Infraestructura: lienzos nítidos y animar solo lo que está en pantalla ----------
  function lienzo(canvas) {
    const l = { canvas, ctx: canvas.getContext("2d"), w: 0, h: 0, dpr: 1, alMedir: null };
    const medir = () => {
      l.dpr = Math.min(window.devicePixelRatio || 1, 2);
      l.w = canvas.clientWidth;
      l.h = canvas.clientHeight;
      canvas.width = Math.round(l.w * l.dpr);
      canvas.height = Math.round(l.h * l.dpr);
      if (l.alMedir) l.alMedir();
    };
    new ResizeObserver(medir).observe(canvas);
    medir();
    l.limpiar = () => {
      l.ctx.setTransform(l.dpr, 0, 0, l.dpr, 0, 0);
      l.ctx.globalAlpha = 1;
      l.ctx.globalCompositeOperation = "source-over";
      l.ctx.clearRect(0, 0, l.w, l.h);
    };
    // Coordenadas del toque dentro del lienzo (aunque esté escalado por una animación CSS)
    l.punto = (e) => {
      const r = canvas.getBoundingClientRect();
      return { x: ((e.clientX - r.left) * l.w) / r.width, y: ((e.clientY - r.top) * l.h) / r.height };
    };
    return l;
  }

  const widgets = [];
  const observador = new IntersectionObserver(
    (entradas) => {
      for (const e of entradas) {
        const w = widgets.find((x) => x.el === e.target);
        w.visible = e.isIntersecting;
        if (w.visible && !w.visto) {
          w.visto = true;
          if (w.alVer) w.alVer();
        }
        if (w.alCambiar) w.alCambiar(w.visible);
      }
    },
    { threshold: 0.25 }
  );

  function registrar(el, w) {
    Object.assign(w, { el, visible: false, visto: false });
    widgets.push(w);
    observador.observe(el);
  }

  const revelador = new IntersectionObserver(
    (entradas) => {
      for (const e of entradas) {
        if (!e.isIntersecting) continue;
        e.target.classList.add("visto");
        revelador.unobserve(e.target);
      }
    },
    { threshold: 0.12, rootMargin: "0px 0px -6% 0px" }
  );
  document.querySelectorAll(".revelar").forEach((el) => revelador.observe(el));

  let ultimo = performance.now();
  let reloj = 0;
  function cuadro(ahora) {
    const dt = Math.min(0.05, Math.max(0, (ahora - ultimo) / 1000));
    ultimo = ahora;
    reloj += dt;
    for (const w of widgets) if (w.visible && w.cuadro) w.cuadro(dt, reloj);
    requestAnimationFrame(cuadro);
  }
  requestAnimationFrame(cuadro);

  function trazarPetalo(ctx, largo, ancho) {
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(ancho, largo * 0.45, 0, largo);
    ctx.quadraticCurveTo(-ancho, largo * 0.45, 0, 0);
    ctx.fill();
  }

  // =====================================================================
  // 01 · La proporción perfecta: filotaxis con el ángulo que ella elija
  // =====================================================================
  (function dorado() {
    const canvas = document.getElementById("doradoLienzo");
    const L = lienzo(canvas);
    const control = document.getElementById("angulo");
    const valor = document.getElementById("anguloValor");
    const estado = document.getElementById("doradoEstado");
    const exito = document.getElementById("doradoExito");
    const boton = document.getElementById("optimizar");
    const n = reducido || window.innerWidth < 600 ? 380 : 560;
    const colores = [];
    for (let k = 0; k < n; k++) colores.push(`hsl(${28 + (20 * k) / n}, 92%, ${26 + (34 * k) / n}%)`);

    let angulo = +control.value;
    let encontrado = false;
    let apertura = 0;
    let giro = 0;
    let optimizando = null;

    function mostrar() {
      valor.textContent = angulo.toFixed(2) + "°";
      if (!optimizando) estado.textContent = `loss = (θ − 137.51°)² = ${((angulo - GRADOS_DORADOS) ** 2).toFixed(4)}`;
      const distancia = Math.abs(angulo - GRADOS_DORADOS);
      if (distancia < 0.12 && !encontrado && !optimizando) celebrar();
      if (distancia > 0.6 && encontrado) {
        encontrado = false;
        exito.classList.remove("visible");
      }
    }

    function celebrar() {
      encontrado = true;
      exito.classList.add("visible");
      vibrar(40);
      const c = centro(canvas);
      Fondo.florecer(c.x, c.y);
      Fondo.lluvia(3);
    }

    function detener() {
      clearInterval(optimizando);
      optimizando = null;
    }

    control.addEventListener("input", () => {
      detener();
      angulo = +control.value;
      mostrar();
    });

    // Al soltar el control cerca del ángulo dorado, un pequeño imán lo ayuda a llegar
    control.addEventListener("change", () => {
      if (Math.abs(angulo - GRADOS_DORADOS) < 0.35) {
        angulo = GRADOS_DORADOS;
        control.value = angulo;
        mostrar();
      }
    });

    // Descenso de gradiente con momentum sobre loss(θ) = (θ − ángulo dorado)²
    boton.addEventListener("click", () => {
      detener();
      if (Math.abs(angulo - GRADOS_DORADOS) < 1) angulo = 123 + Math.random() * 5; // para que se vea el viaje
      encontrado = false;
      exito.classList.remove("visible");
      let velocidad = 0;
      let iteracion = 0;
      optimizando = setInterval(() => {
        const gradiente = 2 * (angulo - GRADOS_DORADOS);
        velocidad = 0.8 * velocidad - 0.06 * gradiente;
        angulo += velocidad;
        iteracion++;
        const perdida = (angulo - GRADOS_DORADOS) ** 2;
        estado.textContent = `iter ${iteracion} · lr 0.06 · momentum 0.8 · loss ${perdida.toFixed(5)}`;
        if ((perdida < 1e-6 && Math.abs(velocidad) < 1e-3) || iteracion > 300) {
          detener();
          angulo = GRADOS_DORADOS;
          estado.textContent = `✓ convergió en ${iteracion} iteraciones · loss ≈ 0`;
          celebrar();
        }
        control.value = angulo;
        mostrar();
      }, 60);
    });

    mostrar();

    registrar(canvas, {
      cuadro(dt) {
        const { ctx, w, h } = L;
        L.limpiar();
        giro += dt * 0.08;
        apertura += ((encontrado ? 1 : 0) - apertura) * Math.min(1, dt * 2.5);
        const cx = w / 2;
        const cy = h / 2;
        const Rs = (Math.min(w, h) / 2) * (0.94 - 0.26 * apertura);
        const c = Rs / Math.sqrt(n);
        const a = (angulo * Math.PI) / 180;
        const cerca = limitar(1 - Math.abs(angulo - GRADOS_DORADOS) / 2, 0, 1);

        if (cerca > 0) {
          const halo = ctx.createRadialGradient(cx, cy, 0, cx, cy, Rs * 1.3);
          halo.addColorStop(0, `rgba(255, 200, 60, ${0.22 * cerca})`);
          halo.addColorStop(1, "rgba(255, 200, 60, 0)");
          ctx.fillStyle = halo;
          ctx.fillRect(0, 0, w, h);
        }

        if (apertura > 0.01) {
          for (const capa of [
            { n: 21, largo: 0.5, ancho: 0.1, color: "hsl(40, 95%, 42%)", desfase: 0.5 },
            { n: 34, largo: 0.44, ancho: 0.075, color: "hsl(48, 100%, 56%)", desfase: 0 },
          ]) {
            ctx.fillStyle = capa.color;
            for (let i = 0; i < capa.n; i++) {
              const ang = ((i + capa.desfase) / capa.n) * TAU + giro;
              ctx.save();
              ctx.translate(cx + Math.cos(ang) * Rs * 0.9, cy + Math.sin(ang) * Rs * 0.9);
              ctx.rotate(ang - Math.PI / 2);
              ctx.scale(1, apertura);
              trazarPetalo(ctx, Rs * capa.largo, Rs * capa.ancho);
              ctx.restore();
            }
          }
        }

        for (let k = 0; k < n; k++) {
          const ang = k * a + giro;
          const r = c * Math.sqrt(k);
          ctx.fillStyle = colores[k];
          ctx.beginPath();
          ctx.arc(cx + Math.cos(ang) * r, cy + Math.sin(ang) * r, c * (0.42 + (0.18 * k) / n), 0, TAU);
          ctx.fill();
        }
      },
    });
  })();

  // =====================================================================
  // 02 · Modo debug: los bugs caminan con ruido de Perlin; al tocarlos florecen
  // =====================================================================
  (function juego() {
    const canvas = document.getElementById("juegoLienzo");
    const L = lienzo(canvas);
    const elBugs = document.getElementById("juegoBugs");
    const elNivel = document.getElementById("juegoNivel");
    const elTiempo = document.getElementById("juegoTiempo");
    const fin = document.getElementById("juegoFin");
    const resumen = document.getElementById("juegoResumen");
    const siguiente = document.getElementById("juegoSiguiente");
    const variantes = [
      Fondo.crearCabeza({ petalos: 5, hue: 50, luz: 60, ancho: 13, centro: "#e08a1e", rc: 9 }),
      Fondo.crearCabeza({ petalos: 8, hue: 46, luz: 57, ancho: 10, centro: "#9a4f16", rc: 11 }),
      Fondo.crearCabeza({ petalos: 13, hue: 48, luz: 55, ancho: 7 }),
      Fondo.crearCabeza({ petalos: 21, hue: 44, luz: 52, ancho: 5, centro: "#4f2f0d", rc: 15 }),
    ];

    let nivel = 1;
    let bugs = [];
    let flores = [];
    let chispas = [];
    let tiempo = 0;
    let corriendo = false;
    let terminado = false;

    function leerRecords() {
      try {
        return JSON.parse(localStorage.getItem("flores-records") || "{}");
      } catch (e) {
        return {};
      }
    }

    function guardarRecords(r) {
      try {
        localStorage.setItem("flores-records", JSON.stringify(r));
      } catch (e) {}
    }

    function crearBugs() {
      const cantidad = Math.min(30, (L.w < 500 ? 4 : 7) + nivel * 3);
      const tam = L.w < 500 ? 1.05 : 1.45;
      bugs = [];
      for (let i = 0; i < cantidad; i++) {
        bugs.push({
          x: 30 + Math.random() * (L.w - 60),
          y: 30 + Math.random() * (L.h - 60),
          dir: Math.random() * TAU,
          vel: (34 + nivel * 13 + Math.random() * 26) * (L.w < 500 ? 0.8 : 1),
          semilla: Math.random() * 100,
          paso: Math.random() * TAU,
          tam,
        });
      }
      tiempo = 0;
      corriendo = false;
      terminado = false;
      fin.classList.remove("visible");
      barra();
    }

    function barra() {
      elBugs.textContent = `🐞 ${bugs.length} bug${bugs.length === 1 ? "" : "s"} · 🌻 ${flores.length}`;
      elNivel.textContent = `nivel ${nivel}`;
      elTiempo.textContent = `${tiempo.toFixed(1)} s`;
    }

    function terminar() {
      corriendo = false;
      terminado = true;
      const records = leerRecords();
      const anterior = records[nivel];
      const nuevo = !anterior || tiempo < anterior;
      if (nuevo) {
        records[nivel] = tiempo;
        guardarRecords(records);
      }
      resumen.textContent =
        `✓ build passing\n0 bugs · ${flores.length} flores en producción\n` +
        `tiempo: ${tiempo.toFixed(1)} s` +
        (nuevo ? " · ¡nuevo récord! 🏆" : ` · récord: ${anterior.toFixed(1)} s`);
      siguiente.textContent = `Nivel ${nivel + 1} →`;
      fin.classList.add("visible");
      Fondo.lluvia(4);
      const c = centro(canvas);
      Fondo.fuegos(c.x, Math.max(80, c.y - L.h * 0.3));
    }

    siguiente.addEventListener("click", () => {
      nivel++;
      crearBugs();
    });

    canvas.addEventListener("pointerdown", (e) => {
      if (terminado) return;
      const p = L.punto(e);
      let elegido = null;
      let distancia = L.w < 500 ? 40 : 32; // generoso con los dedos
      for (const b of bugs) {
        const d = Math.hypot(b.x - p.x, b.y - p.y);
        if (d < distancia) {
          distancia = d;
          elegido = b;
        }
      }
      if (!elegido) {
        chispas.push({ x: p.x, y: p.y, vx: 0, vy: 0, t: 0, anillo: true });
        return;
      }
      corriendo = true;
      bugs.splice(bugs.indexOf(elegido), 1);
      flores.push({
        x: elegido.x,
        y: elegido.y,
        t: 0,
        tam: (13 + Math.random() * 9) * elegido.tam,
        giro: Math.random() * TAU,
        sprite: variantes[Math.floor(Math.random() * variantes.length)],
      });
      if (flores.length > 120) flores.shift();
      for (let i = 0; i < 14; i++) {
        const a = (i / 14) * TAU;
        const v = 80 + Math.random() * 90;
        chispas.push({ x: elegido.x, y: elegido.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, t: 0 });
      }
      vibrar(15);
      barra();
      if (!bugs.length) terminar();
    });

    function dibujarBug(ctx, b) {
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.rotate(b.dir);
      ctx.scale(b.tam, b.tam);
      ctx.strokeStyle = "#1b1b1b";
      ctx.lineWidth = 1.6;
      ctx.lineCap = "round";
      for (let j = 0; j < 3; j++) {
        for (const lado of [-1, 1]) {
          const mov = Math.sin(b.paso + j * 2.1 + (lado > 0 ? Math.PI : 0)) * 3;
          const x = -4 + j * 5;
          ctx.beginPath();
          ctx.moveTo(x, lado * 5);
          ctx.lineTo(x + mov, lado * 11);
          ctx.stroke();
        }
      }
      ctx.fillStyle = "#ff4d4d";
      ctx.beginPath();
      ctx.ellipse(0, 0, 10, 8, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = "rgba(255, 255, 255, 0.35)";
      ctx.beginPath();
      ctx.ellipse(-2, -4, 4, 2, -0.3, 0, TAU);
      ctx.fill();
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(-10, 0);
      ctx.lineTo(7, 0);
      ctx.stroke();
      ctx.fillStyle = "#1b1b1b";
      for (const [x, y] of [[-5, -4], [-5, 4], [1, -4], [1, 4], [-8, 0]]) {
        ctx.beginPath();
        ctx.arc(x, y, 1.7, 0, TAU);
        ctx.fill();
      }
      ctx.beginPath();
      ctx.arc(10, 0, 4.5, 0, TAU);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(13, -2);
      ctx.lineTo(17, -5);
      ctx.moveTo(13, 2);
      ctx.lineTo(17, 5);
      ctx.stroke();
      ctx.restore();
    }

    registrar(canvas, {
      alVer() {
        crearBugs();
      },
      cuadro(dt, t) {
        const { ctx, w, h } = L;
        L.limpiar();
        if (corriendo) {
          tiempo += dt;
          elTiempo.textContent = `${tiempo.toFixed(1)} s`;
        }

        for (const f of flores) {
          f.t += dt;
          const s = f.tam * 2 * rebote(Math.min(1, f.t / 0.6));
          ctx.save();
          ctx.translate(f.x, f.y);
          ctx.rotate(f.giro + Math.sin(t * 1.3 + f.giro) * 0.12);
          ctx.drawImage(f.sprite, -s / 2, -s / 2, s, s);
          ctx.restore();
        }

        for (const b of bugs) {
          // El rumbo cambia suave pero impredecible: ruido de Perlin en el tiempo
          b.dir += ruido(b.semilla, t * 0.6, 0) * dt * 4;
          b.x += Math.cos(b.dir) * b.vel * dt;
          b.y += Math.sin(b.dir) * b.vel * dt;
          if (b.x < 16 || b.x > w - 16) {
            b.dir = Math.PI - b.dir;
            b.x = limitar(b.x, 16, w - 16);
          }
          if (b.y < 16 || b.y > h - 16) {
            b.dir = -b.dir;
            b.y = limitar(b.y, 16, h - 16);
          }
          b.paso += dt * b.vel * 0.25;
          dibujarBug(ctx, b);
        }

        ctx.globalCompositeOperation = "lighter";
        for (const c of chispas) {
          c.t += dt;
          if (c.anillo) {
            ctx.globalAlpha = Math.max(0, 1 - c.t / 0.4) * 0.6;
            ctx.strokeStyle = "#ffeaa0";
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.arc(c.x, c.y, 6 + c.t * 60, 0, TAU);
            ctx.stroke();
            continue;
          }
          c.x += c.vx * dt;
          c.y += c.vy * dt;
          c.vx *= 0.92;
          c.vy *= 0.92;
          ctx.globalAlpha = Math.max(0, 1 - c.t / 0.6);
          ctx.fillStyle = "#ffd84a";
          ctx.fillRect(c.x - 2, c.y - 2, 4, 4);
        }
        chispas = chispas.filter((c) => c.t < 0.6);
      },
    });
  })();

  // =====================================================================
  // 03 · Una terminal solo para ella
  // =====================================================================
  (function terminal() {
    const caja = document.getElementById("terminal");
    const salida = document.getElementById("terminalSalida");
    const form = document.getElementById("terminalForm");
    const input = document.getElementById("terminalInput");
    const chips = document.getElementById("terminalChips");
    const usuario = (nombre || "ella")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "")
      .slice(0, 16) || "ella";
    document.getElementById("terminalTitulo").textContent = `${usuario}@flores — zsh`;

    let cola = Promise.resolve();
    const historial = [];
    let posicion = 0;

    function linea(texto = "", clase = "") {
      const div = document.createElement("div");
      if (clase) div.className = clase;
      div.textContent = texto;
      salida.appendChild(div);
      salida.scrollTop = salida.scrollHeight;
      return div;
    }

    async function teclear(texto, clase, velocidad = 7) {
      const div = linea("", clase);
      if (reducido) {
        div.textContent = texto;
        return div;
      }
      for (const letra of Array.from(texto)) {
        div.textContent += letra;
        salida.scrollTop = salida.scrollHeight;
        await esperar(velocidad);
      }
      return div;
    }

    async function imprimir(lineas) {
      for (const [texto, clase] of lineas) await teclear(texto, clase);
    }

    function encolar(tarea) {
      cola = cola.then(tarea).catch(() => {});
      return cola;
    }

    const logros = () => [
      [`✓ fundaste ${suStartup} desde cero`, "ok"],
      ["✓ entraste a Y Combinator", "ok"],
      ["✓ conviertes café en código y sueños en producto", "ok"],
      ["✓ haces que lo difícil se vea fácil", "ok"],
      ["✓ me inspiras todos los días", "ok"],
    ];

    const ayuda = () => [
      ["comandos disponibles:", "tenue"],
      ["  whoami        quién eres ✨"],
      ["  cat logros    tus logros"],
      ["  cat carta     una carta para ti"],
      ["  flores        flores en el cielo"],
      ["  lluvia        lluvia de pétalos"],
      ["  corazon       mira el cielo 💛"],
      ["  deploy        sube tu sonrisa"],
      ["  yc            ya sabes 😉"],
      ["  sudo abrazo   requiere permisos"],
      ["  clear         limpia la pantalla"],
    ];

    function corazon() {
      const id = Fondo.formarCorazon(Fondo.anclaPantalla);
      setTimeout(() => Fondo.soltarCorazon(id), 6500);
    }

    async function deploy() {
      await teclear("▸ compilando sueños…", "tenue");
      await esperar(300);
      await teclear("▸ corriendo tests ……… 128 passed ✓", "ok");
      const barraDiv = linea("", "oro");
      for (let i = 0; i <= 20; i++) {
        barraDiv.textContent = `▸ subiendo a producción [${"█".repeat(i)}${"░".repeat(20 - i)}] ${i * 5}%`;
        salida.scrollTop = salida.scrollHeight;
        await esperar(reducido ? 0 : 70);
      }
      await teclear("✓ deploy exitoso: tu sonrisa ya está en producción 🚀", "ok");
      for (let i = 0; i < 4; i++) setTimeout(() => Fondo.fuegos(), i * 350);
    }

    const comandos = {
      help: () => imprimir(ayuda()),
      ayuda: () => imprimir(ayuda()),
      whoami: () => imprimir([[`${nombre || "tú"} — founder de ${suStartup} · builder · la persona más brillante que conozco ✨`, "oro"]]),
      ls: () => imprimir([["flores/  sueños/  startup/  logros.txt  carta.txt", ""]]),
      "cat logros": () => imprimir(logros()),
      logros: () => imprimir(logros()),
      "cat carta": () => imprimir(CONFIG.carta.split("\n").map((t) => [t, "oro"])),
      carta: () => imprimir(CONFIG.carta.split("\n").map((t) => [t, "oro"])),
      flores: () => {
        for (let i = 0; i < 14; i++) {
          setTimeout(() => Fondo.florecer(Math.random() * innerWidth, innerHeight * (0.08 + Math.random() * 0.8)), i * 110);
        }
        return imprimir([["🌻 plantando 14 flores en el cielo… listo", "ok"]]);
      },
      lluvia: () => {
        Fondo.lluvia(8);
        return imprimir([["🌼 está lloviendo pétalos amarillos", "ok"]]);
      },
      corazon: () => {
        corazon();
        return imprimir([["💛 mira el cielo", "oro"]]);
      },
      deploy,
      yc: () => {
        Fondo.fuegos();
        return imprimir([
          ["Y Combinator ✓", "ok"],
          ['lema: "Make something people want"', "tenue"],
          ["y tú hiciste algo que yo quiero: verte brillar 🌻", "oro"],
        ]);
      },
      "sudo abrazo": async () => {
        await teclear(`[sudo] contraseña para ${usuario}: ••••••••`, "tenue");
        await esperar(400);
        await imprimir([["✓ permiso concedido. abrazo enviado 🤗 (no expira)", "ok"]]);
        corazon();
      },
      sudo: () => imprimir([["uso: sudo abrazo", "tenue"]]),
      "te quiero": () => {
        corazon();
        return imprimir([["yo más 💛", "oro"]]);
      },
      "git push": () => imprimir([["✓ 1 commit enviado: \"te quiero\" — 1 file changed, ∞ insertions(+)", "ok"]]),
      "npm install": () => imprimir([["added 1 package: flores-amarillas@∞ in 0.1s", "ok"]]),
      "rm -rf": () => imprimir([["nop 🌻 estas flores están protegidas", "error"]]),
      exit: () => imprimir([["no puedes salir de aquí 🙃 bueno, sí… pero ¿para qué?", "tenue"]]),
      date: () =>
        imprimir([
          [new Date().toLocaleDateString("es", { weekday: "long", day: "numeric", month: "long", year: "numeric" }), ""],
          ["un día perfecto para recordarte lo increíble que eres", "oro"],
        ]),
      clear: () => {
        salida.textContent = "";
      },
    };
    const alias = { "?": "help", fecha: "date", cls: "clear", love: "te quiero", tequiero: "te quiero", heart: "corazon", rain: "lluvia", bloom: "flores", "sudo hug": "sudo abrazo", "git commit": "git push" };

    function normalizar(texto) {
      return texto
        .toLowerCase()
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .replace(/\.txt\b/g, "")
        .replace(/\s+/g, " ")
        .trim();
    }

    function ejecutar(texto) {
      const limpio = normalizar(texto);
      if (!limpio) return;
      historial.push(texto);
      posicion = historial.length;
      encolar(async () => {
        linea(texto, "cmd");
        const nombreNormal = normalizar(nombre);
        let clave = alias[limpio] || limpio;
        if (!comandos[clave]) {
          // "git commit -m ..." o "help me" también cuentan
          const conocido = [...Object.keys(comandos), ...Object.keys(alias)].find((k) => clave.startsWith(k + " "));
          if (conocido) clave = alias[conocido] || conocido;
        }
        if (nombreNormal && limpio === nombreNormal) {
          await imprimir([["✨ la founder más linda y brillante del mundo", "oro"]]);
        } else if (comandos[clave]) {
          await comandos[clave]();
        } else {
          await imprimir([[`zsh: command not found: ${texto.slice(0, 40)} — prueba "help" 💛`, "error"]]);
        }
      });
    }

    form.addEventListener("submit", (e) => {
      e.preventDefault();
      ejecutar(input.value);
      input.value = "";
    });

    input.addEventListener("keydown", (e) => {
      if (e.key === "ArrowUp" && historial.length) {
        posicion = Math.max(0, posicion - 1);
        input.value = historial[posicion];
        e.preventDefault();
      } else if (e.key === "ArrowDown") {
        posicion = Math.min(historial.length, posicion + 1);
        input.value = historial[posicion] || "";
      }
    });

    caja.addEventListener("click", () => {
      if (!window.getSelection().toString()) input.focus({ preventScroll: true });
    });

    for (const c of ["help", "whoami", "cat carta", "flores", "lluvia", "corazon", "deploy", "yc", "sudo abrazo", "clear"]) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "chip mono";
      b.textContent = c;
      b.addEventListener("click", () => ejecutar(c));
      chips.appendChild(b);
    }

    // Al llegar, la terminal "se escribe sola" con su presentación
    registrar(caja, {
      alVer() {
        encolar(async () => {
          for (const [comando, accion] of [
            ["whoami", comandos.whoami],
            ["cat logros.txt", comandos["cat logros"]],
            ["help", comandos.help],
          ]) {
            const div = linea("", "cmd");
            for (const letra of comando) {
              div.textContent += letra;
              await esperar(reducido ? 0 : 70);
            }
            await esperar(250);
            await accion();
            await esperar(350);
          }
        });
      },
    });
  })();

  // =====================================================================
  // 04 · Dashboard: contadores y una curva que crece "up and to the right"
  // =====================================================================
  (function metricas() {
    document.querySelectorAll(".kpi__valor").forEach((el) => {
      registrar(el, {
        alVer() {
          const desde = +(el.dataset.desde || 0);
          const hasta = +el.dataset.hasta;
          const sufijo = el.dataset.sufijo || "";
          const inicio = performance.now();
          const paso = (ahora) => {
            const t = Math.min(1, (ahora - inicio) / 1800);
            const e = t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
            el.textContent = Math.round(desde + (hasta - desde) * e) + sufijo;
            if (t < 1) requestAnimationFrame(paso);
            else if (el.dataset.final) el.textContent = el.dataset.final;
          };
          requestAnimationFrame(paso);
        },
      });
    });

    const svg = document.getElementById("grafica");
    const N = 80;
    const puntos = [];
    const valores = [];
    for (let i = 0; i <= N; i++) {
      const x = i / N;
      let y = 0.06 + (0.86 * (Math.exp(3.6 * x) - 1)) / (Math.exp(3.6) - 1);
      y -= 0.07 * Math.exp(-Math.pow((x - 0.3) / 0.05, 2)); // los días difíciles
      y += ruido(x * 8, 0.5, 0.5) * 0.03 * (1 - x);
      valores.push(y);
      puntos.push([40 + x * 520, 280 - y * 250]);
    }

    // Curva suave que pasa por todos los puntos (Catmull-Rom convertida a Bézier cúbicas)
    const f = (p) => p.map((v) => v.toFixed(1)).join(",");
    let d = `M${f(puntos[0])}`;
    for (let i = 0; i < puntos.length - 1; i++) {
      const p0 = puntos[i - 1] || puntos[i];
      const p1 = puntos[i];
      const p2 = puntos[i + 1];
      const p3 = puntos[i + 2] || p2;
      const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
      const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
      d += ` C${f(c1)} ${f(c2)} ${f(p2)}`;
    }

    const dificil = puntos[Math.round(0.3 * N)];
    const yc = puntos[Math.round(0.62 * N)];
    const fin = puntos[N];
    let petalos = "";
    for (let i = 0; i < 21; i++) {
      petalos += `<ellipse cx="${fin[0]}" cy="${fin[1] - 15}" rx="4" ry="11" fill="hsl(${46 + (i % 2) * 4}, 100%, ${55 + (i % 2) * 6}%)" transform="rotate(${(i * 360) / 21} ${fin[0]} ${fin[1]})"/>`;
    }
    let rejilla = "";
    for (let j = 0; j <= 4; j++) rejilla += `<line x1="40" x2="560" y1="${30 + j * 62.5}" y2="${30 + j * 62.5}" stroke="rgba(255,255,255,0.07)"/>`;

    svg.innerHTML = `
      <defs>
        <linearGradient id="gArea" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#ffd84a" stop-opacity="0.35"/>
          <stop offset="1" stop-color="#ffd84a" stop-opacity="0"/>
        </linearGradient>
      </defs>
      ${rejilla}
      <text x="40" y="304">día 1</text>
      <text x="560" y="304" text-anchor="end">hoy</text>
      <path class="area" d="${d} L560,280 L40,280 Z" fill="url(#gArea)"/>
      <path class="linea" d="${d}"/>
      <text class="nota" x="${dificil[0]}" y="${dificil[1] + 26}" text-anchor="middle">días difíciles 🌧️</text>
      <text class="nota" x="${yc[0] - 6}" y="${yc[1] - 18}" text-anchor="end">Y Combinator ✓</text>
      <circle class="nota" cx="${yc[0]}" cy="${yc[1]}" r="5" fill="#ff7a1a"/>
      <text class="nota" x="${fin[0] - 30}" y="${fin[1] + 6}" text-anchor="end">y apenas empieza ✨</text>
      <g class="flor-final">${petalos}<circle cx="${fin[0]}" cy="${fin[1]}" r="8" fill="#5a3510"/></g>
      <g class="cursor">
        <line class="cursor__linea" y1="20" y2="280" stroke="rgba(255,234,160,0.4)" stroke-dasharray="4 4"/>
        <circle class="cursor__punto" r="6" fill="#fff4c4" stroke="#ffb300" stroke-width="3"/>
        <text class="cursor__texto" text-anchor="middle" style="fill:#fff4c4;font-size:13px"></text>
      </g>`;

    const linea = svg.querySelector(".linea");
    const largo = linea.getTotalLength();
    linea.style.strokeDasharray = largo;
    linea.style.strokeDashoffset = largo;

    registrar(svg, {
      alVer() {
        svg.getBoundingClientRect(); // fuerza el estilo inicial antes de animar
        svg.classList.add("dibujada");
        linea.style.strokeDashoffset = 0;
        svg.querySelectorAll(".nota").forEach((n, i) => setTimeout(() => (n.style.opacity = 1), 1200 + i * 500));
      },
    });

    // Al pasar el dedo o el mouse se lee el valor de cada punto
    const cursor = svg.querySelector(".cursor");
    const cLinea = svg.querySelector(".cursor__linea");
    const cPunto = svg.querySelector(".cursor__punto");
    const cTexto = svg.querySelector(".cursor__texto");
    function leer(e) {
      const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(svg.getScreenCTM().inverse());
      const i = Math.round(limitar((p.x - 40) / 520, 0, 1) * N);
      const [x, y] = puntos[i];
      const mes = i === N ? "hoy" : `mes ${1 + Math.round((i / N) * 23)}`;
      cLinea.setAttribute("x1", x);
      cLinea.setAttribute("x2", x);
      cPunto.setAttribute("cx", x);
      cPunto.setAttribute("cy", y);
      cTexto.textContent = `${mes}: +${Math.round(valores[i] * 1000)}% orgullo`;
      const mitad = cTexto.getComputedTextLength() / 2 + 4;
      cTexto.setAttribute("x", limitar(x, mitad, 600 - mitad));
      cTexto.setAttribute("y", Math.max(18, y - 18));
      cursor.classList.add("visible");
    }
    svg.addEventListener("pointermove", leer);
    svg.addEventListener("pointerdown", leer);
    svg.addEventListener("pointerleave", () => cursor.classList.remove("visible"));
  })();

  // =====================================================================
  // 05 · Jardín generativo: cada toque planta una flor única
  // =====================================================================
  (function jardin() {
    const canvas = document.getElementById("jardinLienzo");
    const L = lienzo(canvas);
    const cuenta = document.getElementById("jardinCuenta");
    const aviso = document.getElementById("jardinAviso");
    const FIBONACCI = new Set([8, 13, 21, 34, 55, 89]);
    const TIPOS = [
      { peso: 3, petalos: [21, 34], hue: [44, 50], luz: [50, 58], ancho: [3.5, 5], centro: "#4a2a0a", rc: [15, 18], tam: [24, 34], alto: [0.42, 0.66] },
      { peso: 3, petalos: [13], hue: [46, 54], luz: [56, 66], ancho: [6, 8], centro: "#c46a12", rc: [10, 12], tam: [17, 23], alto: [0.25, 0.46] },
      { peso: 2, petalos: [8], hue: [42, 48], luz: [52, 60], ancho: [9, 11], centro: "#7a3c0c", rc: [9, 11], tam: [15, 21], alto: [0.3, 0.52] },
      { peso: 2, petalos: [5], hue: [48, 54], luz: [55, 64], ancho: [12, 14], centro: "#e09a1e", rc: [8, 10], tam: [11, 15], alto: [0.16, 0.32] },
    ];
    const rango = ([a, b]) => a + Math.random() * (b - a);
    const elegir = (lista) => lista[Math.floor(Math.random() * lista.length)];

    let flores = [];
    let mariposas = [];
    let briznas = [];
    let rafagaHasta = 0;
    let plantadasPorElla = 0;
    let avisoHasta = null;
    const puntero = { x: -999, vx: 0, t: 0, hasta: 0 };

    const suelo = (x) => L.h * 0.86 + ruido(x * 0.004, 7.7, 0.3) * L.h * 0.06;

    function crearBriznas() {
      briznas = [];
      for (let i = 0, n = Math.round(L.w / 5); i < n; i++) {
        briznas.push({ x: Math.random() * L.w, alto: 8 + Math.random() * 22, fase: Math.random() * TAU, tono: Math.random() });
      }
    }
    L.alMedir = crearBriznas;
    crearBriznas();

    function avisar(texto) {
      aviso.textContent = texto;
      aviso.classList.add("visible");
      clearTimeout(avisoHasta);
      avisoHasta = setTimeout(() => aviso.classList.remove("visible"), 2600);
    }

    function plantar(x, porElla) {
      let r = Math.random() * TIPOS.reduce((s, t) => s + t.peso, 0);
      const tipo = TIPOS.find((t) => (r -= t.peso) < 0) || TIPOS[0];
      const escala = L.w < 500 ? 0.8 : 1;
      flores.push({
        x,
        alto: rango(tipo.alto) * L.h * 0.86,
        tam: rango(tipo.tam) * escala,
        curva: (Math.random() - 0.5) * 0.5,
        hojas: Array.from({ length: 1 + Math.floor(Math.random() * 3) }, (_, i) => ({
          pos: 0.25 + i * 0.2 + Math.random() * 0.1,
          lado: i % 2 ? 1 : -1,
          tam: (10 + Math.random() * 8) * escala,
        })),
        cabeza: Fondo.crearCabeza({
          petalos: elegir(tipo.petalos),
          hue: rango(tipo.hue),
          luz: rango(tipo.luz),
          ancho: rango(tipo.ancho),
          centro: tipo.centro,
          rc: rango(tipo.rc),
        }),
        t: 0,
        a: 0,
        w: 0,
        fase: Math.random() * 100,
        vida: 1,
        hx: x,
        hy: suelo(x),
      });
      const vivas = flores.filter((f) => !f.marchita);
      if (vivas.length > 70) vivas[0].marchita = true;
      const total = flores.filter((f) => !f.marchita).length;
      cuenta.textContent = `🌻 ${total} flor${total === 1 ? "" : "es"}`;
      if (porElla) {
        plantadasPorElla++;
        if (plantadasPorElla === 1) avisar("🌱 Así se planta. Cada flor es única");
        else if (FIBONACCI.has(total)) avisar(`🌻 ${total} flores: ¡${total} es un número de Fibonacci!`);
      }
    }

    function plantarVarias(n, porElla) {
      for (let i = 0; i < n; i++) setTimeout(() => plantar(L.w * (0.04 + Math.random() * 0.92), porElla), i * 180);
    }

    canvas.addEventListener("pointerdown", (e) => {
      plantar(L.punto(e).x, true);
      vibrar(10);
    });
    canvas.addEventListener("pointermove", (e) => {
      const p = L.punto(e);
      const ahora = performance.now();
      puntero.vx = (p.x - puntero.x) / (Math.max(8, ahora - puntero.t) / 1000);
      puntero.x = p.x;
      puntero.t = ahora;
      puntero.hasta = ahora + 300;
    });
    document.getElementById("jardinPlantar").addEventListener("click", () => plantarVarias(10, true));
    document.getElementById("jardinViento").addEventListener("click", () => {
      rafagaHasta = reloj + 4;
      for (const f of flores) f.w += 2 + Math.random() * 2;
      Fondo.lluvia(4);
    });

    function crearMariposas() {
      const colores = [["#ffd84a", "#ffb300"], ["#fff6d6", "#ffe58a"], ["#ffa630", "#ff7a1a"]];
      mariposas = colores.map((c) => ({
        x: Math.random() * L.w,
        y: L.h * (0.15 + Math.random() * 0.3),
        vx: 0,
        vy: 0,
        c,
        fase: Math.random() * TAU,
        semilla: Math.random() * 100,
        objetivo: null,
        posada: 0,
        tam: (L.w < 500 ? 0.8 : 1) * (0.9 + Math.random() * 0.4),
      }));
    }

    function dibujarMariposa(ctx, m, t) {
      const aleteo = 0.25 + 0.75 * Math.abs(Math.sin(t * (m.posada > 0 ? 2.5 : 13) + m.fase));
      ctx.save();
      ctx.translate(m.x, m.y);
      ctx.rotate(limitar(m.vx / 300, -0.5, 0.5));
      ctx.scale(m.tam, m.tam);
      ctx.fillStyle = m.c[0];
      for (const lado of [-1, 1]) {
        ctx.beginPath();
        ctx.ellipse(lado * 6 * aleteo, -3, 7 * aleteo, 6, lado * 0.4, 0, TAU);
        ctx.fill();
      }
      ctx.fillStyle = m.c[1];
      for (const lado of [-1, 1]) {
        ctx.beginPath();
        ctx.ellipse(lado * 4 * aleteo, 4, 4.5 * aleteo, 4, -lado * 0.3, 0, TAU);
        ctx.fill();
      }
      ctx.strokeStyle = "#2b1d00";
      ctx.lineWidth = 2;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(0, -6);
      ctx.lineTo(0, 7);
      ctx.stroke();
      ctx.restore();
    }

    registrar(canvas, {
      alVer() {
        crearMariposas();
        plantarVarias(L.w < 500 ? 6 : 9, false);
      },
      cuadro(dt, t) {
        const { ctx, w, h } = L;
        L.limpiar();
        const rafaga = reloj < rafagaHasta ? 3.5 : 1;
        const empujando = performance.now() < puntero.hasta;

        // Suelo ondulado y pasto
        ctx.beginPath();
        ctx.moveTo(0, h);
        for (let x = 0; x <= w + 10; x += 10) ctx.lineTo(x, suelo(x));
        ctx.lineTo(w, h);
        ctx.closePath();
        const tierra = ctx.createLinearGradient(0, h * 0.8, 0, h);
        tierra.addColorStop(0, "rgba(16, 70, 52, 0.95)");
        tierra.addColorStop(1, "rgba(2, 8, 10, 1)");
        ctx.fillStyle = tierra;
        ctx.fill();
        ctx.lineCap = "round";
        ctx.lineWidth = 1.5;
        for (const b of briznas) {
          const y = suelo(b.x);
          const lean = ruido(b.x * 0.01, t * 0.5, 2) * 0.5 * rafaga;
          ctx.strokeStyle = `hsla(${140 + b.tono * 30}, 60%, ${30 + b.tono * 20}%, 0.9)`;
          ctx.beginPath();
          ctx.moveTo(b.x, y + 2);
          ctx.quadraticCurveTo(b.x + lean * b.alto * 0.4, y - b.alto * 0.5, b.x + lean * b.alto, y - b.alto);
          ctx.stroke();
        }

        for (const f of flores) {
          f.t += dt;
          if (f.marchita) f.vida -= dt / 1.5;
          if (empujando && Math.abs(puntero.x - f.x) < 70) f.w += limitar(puntero.vx, -2500, 2500) * 0.0035 * dt * 60;
          f.w += (-22 * f.a - 3 * f.w) * dt;
          f.a = limitar(f.a + f.w * dt, -1, 1);

          const crecer = limitar(f.t / 1.8, 0, 1);
          const e = 1 - Math.pow(1 - crecer, 3);
          const by = suelo(f.x);
          const alto = f.alto * e;
          const vaiven = ruido(f.x * 0.003, t * 0.4, 1.3) * 0.18 * rafaga + f.a;
          const ang = vaiven + f.curva * 0.5;
          const hx = f.x + Math.sin(ang) * alto;
          const hy = by - Math.cos(ang) * alto;
          const qx = f.x + Math.sin(f.curva + vaiven * 0.4) * alto * 0.5;
          const qy = by - alto * 0.5;
          f.hx = hx;
          f.hy = hy;

          ctx.globalAlpha = Math.max(0, f.vida);
          ctx.strokeStyle = "#2e9e5b";
          ctx.lineWidth = Math.max(2, f.tam * 0.12);
          ctx.beginPath();
          ctx.moveTo(f.x, by);
          ctx.quadraticCurveTo(qx, qy, hx, hy);
          ctx.stroke();

          ctx.fillStyle = "#3cba6f";
          for (const hoja of f.hojas) {
            // Punto y dirección sobre la curva de Bézier del tallo
            const u = hoja.pos;
            const x = (1 - u) * (1 - u) * f.x + 2 * (1 - u) * u * qx + u * u * hx;
            const y = (1 - u) * (1 - u) * by + 2 * (1 - u) * u * qy + u * u * hy;
            const tx = 2 * (1 - u) * (qx - f.x) + 2 * u * (hx - qx);
            const ty = 2 * (1 - u) * (qy - by) + 2 * u * (hy - qy);
            ctx.save();
            ctx.translate(x, y);
            ctx.rotate(Math.atan2(ty, tx) - Math.PI / 2 + hoja.lado * 1.1);
            ctx.scale(e, e);
            trazarPetalo(ctx, hoja.tam * 1.6, hoja.tam * 0.45);
            ctx.restore();
          }

          const abrir = limitar((crecer - 0.6) / 0.4, 0, 1);
          if (abrir > 0) {
            const s = f.tam * 2 * rebote(abrir);
            ctx.save();
            ctx.translate(hx, hy);
            ctx.rotate(ang + Math.sin(t + f.fase) * 0.1);
            ctx.drawImage(f.cabeza, -s / 2, -s / 2, s, s);
            ctx.restore();
          }
        }
        ctx.globalAlpha = 1;
        flores = flores.filter((f) => f.vida > 0);

        // Mariposas: vuelan entre las flores abiertas y a veces se posan en ellas
        const abiertas = flores.filter((f) => f.t > 2 && !f.marchita);
        for (const m of mariposas) {
          if (m.posada > 0 && m.objetivo) {
            m.posada -= dt;
            m.x += (m.objetivo.hx - m.x) * Math.min(1, dt * 8);
            m.y += (m.objetivo.hy - 4 - m.y) * Math.min(1, dt * 8);
            if (m.posada <= 0) {
              m.objetivo = null;
              m.vy = -60;
            }
          } else {
            if ((!m.objetivo || Math.random() < 0.003) && abiertas.length) m.objetivo = elegir(abiertas);
            let tx = w / 2 + ruido(m.semilla, t * 0.2, 0) * w * 0.6;
            let ty = h * 0.35 + ruido(m.semilla, t * 0.2, 5) * h * 0.3;
            if (m.objetivo) {
              tx = m.objetivo.hx;
              ty = m.objetivo.hy - 4;
            }
            const dx = tx - m.x;
            const dy = ty - m.y;
            const d = Math.hypot(dx, dy) || 1;
            const deseoX = (dx / d) * 70 + ruido(m.semilla, t * 1.5, 1) * 60;
            const deseoY = (dy / d) * 70 + ruido(m.semilla, t * 1.5, 2) * 60;
            m.vx += (deseoX - m.vx) * Math.min(1, dt * 2);
            m.vy += (deseoY - m.vy) * Math.min(1, dt * 2);
            m.x += m.vx * dt;
            m.y += m.vy * dt;
            if (m.objetivo && d < 8) m.posada = 2 + Math.random() * 3;
          }
          dibujarMariposa(ctx, m, t);
        }
      },
    });
  })();

  // =====================================================================
  // 06 · Demo Day: cada lanzamiento es un fuego artificial con forma de rosa polar
  // =====================================================================
  (function demoDay() {
    const boton = document.getElementById("lanzar");
    const texto = document.getElementById("lanzamientos");
    const frases = [
      "🚀 ¡Lanzado! El mundo ya lo está viendo.",
      "📈 Los usuarios aman lo que construiste.",
      "🏆 Demo Day: la sala entera de pie aplaudiéndote.",
      "💸 Ronda cerrada: inversión total de mi corazón.",
    ];
    let lanzamientos = 0;

    boton.addEventListener("click", () => {
      lanzamientos++;
      Fondo.fuegos();
      vibrar(20);
      if (lanzamientos <= frases.length) {
        texto.textContent = frases[lanzamientos - 1];
      } else if (lanzamientos === frases.length + 1) {
        texto.textContent = `🎉 ¡Gran final! Esto es por ti, ${nombre || "founder"}.`;
        for (let i = 0; i < 12; i++) setTimeout(() => Fondo.fuegos(), i * 260);
        Fondo.lluvia(8);
      } else {
        texto.textContent = `🎆 ${lanzamientos} lanzamientos y contando.\nNunca dejes de lanzar cosas increíbles.`;
      }
    });

    registrar(boton, {
      alVer() {
        setTimeout(() => Fondo.fuegos(), 500);
        setTimeout(() => Fondo.fuegos(), 1200);
      },
    });
  })();

  // =====================================================================
  // 07 · Su nombre hecho de partículas de luz (con resortes; el dedo las aparta)
  // =====================================================================
  (function final() {
    const canvas = document.getElementById("nombreLienzo");
    const L = lienzo(canvas);
    const mensaje = document.getElementById("finalMensaje");
    const texto = nombre || "Para ti";
    const puntero = { x: -999, y: -999 };
    let particulas = [];
    let listo = false;
    let idCorazon = null;

    // Destello pre-dibujado para que cada partícula brille como luciérnaga
    const brillo = document.createElement("canvas");
    brillo.width = brillo.height = 32;
    const gb = brillo.getContext("2d");
    const grad = gb.createRadialGradient(16, 16, 0, 16, 16, 16);
    grad.addColorStop(0, "rgba(255, 250, 220, 1)");
    grad.addColorStop(0.25, "rgba(255, 216, 90, 0.85)");
    grad.addColorStop(1, "rgba(255, 170, 30, 0)");
    gb.fillStyle = grad;
    gb.fillRect(0, 0, 32, 32);

    function muestrear() {
      const w = Math.round(L.w);
      const h = Math.round(L.h);
      if (!w || !h) return;
      const off = document.createElement("canvas");
      off.width = w;
      off.height = h;
      const g = off.getContext("2d");
      let tam = h * 0.78;
      g.font = `700 ${tam}px "Dancing Script", cursive`;
      const ancho = g.measureText(texto).width;
      if (ancho > w * 0.5) {
        // el nombre cabe dentro del corazón de luciérnagas
        tam *= (w * 0.5) / ancho;
        g.font = `700 ${tam}px "Dancing Script", cursive`;
      }
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillStyle = "#fff";
      g.fillText(texto, w / 2, h / 2);
      const datos = g.getImageData(0, 0, w, h).data;
      const maximo = reducido ? 700 : w < 600 ? 1400 : 2600;
      let paso = Math.max(2, Math.round(tam / 28));
      let puntos;
      do {
        puntos = [];
        for (let y = 0; y < h; y += paso) {
          for (let x = 0; x < w; x += paso) if (datos[(y * w + x) * 4 + 3] > 128) puntos.push([x, y]);
        }
        paso++;
      } while (puntos.length > maximo);
      particulas = puntos.map(([x, y], i) => {
        const antes = particulas[i];
        return {
          x: antes ? antes.x : Math.random() * w,
          y: antes ? antes.y : h + Math.random() * h,
          vx: 0,
          vy: 0,
          tx: x,
          ty: y,
          fase: Math.random() * TAU,
          tam: (2.2 + Math.random() * 1.6) * Math.max(1, paso / 4),
        };
      });
      listo = true;
    }

    L.alMedir = () => {
      if (listo) muestrear();
    };

    async function preparar() {
      try {
        await document.fonts.load('700 100px "Dancing Script"');
      } catch (e) {}
      muestrear();
    }

    async function escribirMensaje() {
      const letras = Array.from(CONFIG.mensajeFinal);
      await esperar(1200);
      for (let i = 1; i <= letras.length; i++) {
        mensaje.textContent = letras.slice(0, i).join("");
        if (!reducido) await esperar(32);
      }
    }

    function mover(e) {
      const p = L.punto(e);
      puntero.x = p.x;
      puntero.y = p.y;
    }
    canvas.addEventListener("pointermove", mover);
    canvas.addEventListener("pointerdown", (e) => {
      mover(e);
      for (const q of particulas) {
        // un toque las hace saltar como chispas
        const dx = q.x - puntero.x;
        const dy = q.y - puntero.y;
        const d = Math.hypot(dx, dy) || 1;
        if (d < 140) {
          q.vx += (dx / d) * (1 - d / 140) * 900;
          q.vy += (dy / d) * (1 - d / 140) * 900;
        }
      }
      vibrar(15);
    });
    canvas.addEventListener("pointerleave", () => {
      puntero.x = puntero.y = -999;
    });

    document.getElementById("volverArriba").addEventListener("click", () => window.scrollTo({ top: 0, behavior: "smooth" }));
    document.getElementById("verOtraVez").addEventListener("click", () => {
      window.scrollTo(0, 0);
      location.reload();
    });

    registrar(canvas, {
      alVer() {
        preparar();
        escribirMensaje();
      },
      // Mientras se ve el final, las luciérnagas le dibujan un corazón alrededor del nombre
      alCambiar(visible) {
        if (visible && idCorazon === null) idCorazon = Fondo.formarCorazon(Fondo.anclaElemento(canvas, 0.68));
        if (!visible && idCorazon !== null) {
          Fondo.soltarCorazon(idCorazon);
          idCorazon = null;
        }
      },
      cuadro(dt, t) {
        if (!listo) return;
        const { ctx } = L;
        L.limpiar();
        ctx.globalCompositeOperation = "lighter";
        const amortiguar = Math.exp(-5.5 * dt);
        for (const q of particulas) {
          let ax = (q.tx - q.x) * 14;
          let ay = (q.ty - q.y) * 14;
          const dx = q.x - puntero.x;
          const dy = q.y - puntero.y;
          const d2 = dx * dx + dy * dy;
          if (d2 < 4900) {
            const d = Math.sqrt(d2) || 1;
            const fuerza = (1 - d / 70) * 2600;
            ax += (dx / d) * fuerza;
            ay += (dy / d) * fuerza;
          }
          q.vx = (q.vx + ax * dt) * amortiguar;
          q.vy = (q.vy + ay * dt) * amortiguar;
          q.x += q.vx * dt;
          q.y += q.vy * dt;
          const s = q.tam * 2.4;
          ctx.globalAlpha = 0.55 + 0.45 * Math.sin(t * 3 + q.fase);
          ctx.drawImage(brillo, q.x - s / 2, q.y - s / 2, s, s);
        }
      },
    });
  })();

  return { nombre, startup };
})();
