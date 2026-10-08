// Orquesta la sorpresa: intro → música y flores → mensaje → corazones de luciérnagas
(function () {
  const intro = document.getElementById("intro");
  const saludo = document.getElementById("saludo");
  const mensaje = document.getElementById("mensaje");
  const corazonTexto = document.getElementById("corazonTexto");
  const pista = document.getElementById("pista");
  const musica = document.getElementById("musica");
  const repetir = document.getElementById("repetir");

  // ?para=Nombre en el enlace tiene prioridad sobre config.js
  const nombre = (new URLSearchParams(location.search).get("para") || CONFIG.nombre || "")
    .normalize("NFC")
    .trim()
    .slice(0, 30);

  // "Hola, Nombre!": cada letra brilla con un pequeño retraso
  saludo.textContent = "";
  saludo.setAttribute("aria-label", nombre ? `Hola, ${nombre}!` : "Hola!");
  let indiceLetra = 0;
  (nombre ? `Hola, ${nombre}!` : "Hola!").split(" ").forEach((texto, i) => {
    if (i) saludo.appendChild(document.createTextNode(" "));
    const palabra = document.createElement("span");
    palabra.className = "palabra";
    palabra.setAttribute("aria-hidden", "true");
    for (const letra of texto) {
      const span = document.createElement("span");
      span.textContent = letra;
      span.style.animationDelay = indiceLetra++ * 0.2 + "s";
      palabra.appendChild(span);
    }
    saludo.appendChild(palabra);
  });
  document.getElementById("dedicatoria").textContent = CONFIG.dedicatoria;

  function frase(i) {
    const f = CONFIG.frasesCorazon[i % CONFIG.frasesCorazon.length] || "";
    const texto = nombre ? f.replace("{nombre}", nombre) : f.replace(/,?\s*\{nombre\}/, "").trim();
    return texto || "Para ti 💛";
  }

  // El texto del corazón se coloca donde el fondo dibuja el corazón
  function ubicarCorazon() {
    const g = Fondo.geometriaCorazon();
    corazonTexto.style.left = g.x + "px";
    corazonTexto.style.top = g.y + "px";
    corazonTexto.style.maxWidth = g.ancho * 0.62 + "px";
    corazonTexto.style.fontSize = Math.max(22, Math.min(50, g.ancho * 0.125)) + "px";
  }
  window.addEventListener("resize", ubicarCorazon);
  ubicarCorazon();

  function escribirMensaje() {
    const letras = Array.from(CONFIG.mensaje);
    let i = 0;
    mensaje.classList.add("escribiendo");
    const escribir = setInterval(() => {
      mensaje.textContent = letras.slice(0, ++i).join("");
      if (i >= letras.length) {
        clearInterval(escribir);
        setTimeout(() => mensaje.classList.remove("escribiendo"), 1500);
      }
    }, 55);
  }

  function mostrarPista() {
    if (document.body.classList.contains("modo-corazon")) return;
    pista.classList.add("visible");
    setTimeout(() => pista.classList.remove("visible"), 3500);
  }

  let corazonId = 0;
  function formarCorazon(i, segundos) {
    const id = ++corazonId;
    pista.classList.remove("visible");
    corazonTexto.classList.remove("visible");
    document.body.classList.add("modo-corazon");
    Fondo.formarCorazon();
    setTimeout(() => {
      if (id !== corazonId) return;
      corazonTexto.textContent = frase(i);
      corazonTexto.classList.add("visible");
    }, 1800);
    if (!segundos) return; // el último corazón se queda
    setTimeout(() => {
      if (id !== corazonId) return;
      corazonTexto.classList.remove("visible");
      document.body.classList.remove("modo-corazon");
      Fondo.soltarCorazon();
    }, segundos * 1000);
  }

  function mostrarRepetir() {
    repetir.classList.add("visible");
  }

  // Momentos de la sorpresa (segundos de la canción); los corazones caen en el coro
  const eventos = [
    { en: 5, hacer: escribirMensaje },
    { en: 10.5, hacer: mostrarPista }, // antes de que empiece la letra (15 s)
    { en: 20, hacer: () => formarCorazon(0, 9) },
    { en: 57, hacer: () => formarCorazon(1, 11) },
    { en: 106, hacer: () => formarCorazon(2, 10) },
    { en: 186, hacer: () => formarCorazon(3, 0) },
    { en: 214, hacer: mostrarRepetir },
  ];

  let reloj = 0;
  let ultimo = 0;
  function avanzar(ahora) {
    const dt = Math.min(0.25, (ahora - ultimo) / 1000);
    ultimo = ahora;
    // Seguimos a la canción mientras suena; si no hay música, seguimos al reloj
    reloj = !audio.paused && audio.currentTime > 0 ? audio.currentTime : reloj + dt;
    while (eventos.length && reloj >= eventos[0].en) eventos.shift().hacer();
    requestAnimationFrame(avanzar);
  }

  document.getElementById("abrir").addEventListener("click", () => {
    if (!document.body.classList.contains("esperando")) return;
    audio.play().catch(() => {}); // si el navegador no deja reproducir, la escena sigue igual
    intro.classList.add("oculto");
    Fondo.iniciarEscena();
    document.body.classList.remove("esperando");
    ultimo = performance.now();
    requestAnimationFrame(avanzar);
  });

  musica.addEventListener("click", () => {
    if (audio.paused && !audio.ended) {
      audio.muted = false;
      audio.play().catch(() => {});
    } else {
      audio.muted = !audio.muted;
    }
    musica.setAttribute("aria-pressed", audio.muted);
    musica.setAttribute("aria-label", audio.muted ? "Activar música" : "Silenciar música");
  });

  audio.addEventListener("ended", mostrarRepetir);
  repetir.addEventListener("click", () => location.reload());
})();
