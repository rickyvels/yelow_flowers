// ✏️ Personaliza aquí tu sorpresa
var CONFIG = {
  // Su nombre: aparece en el saludo, en el corazón de luciérnagas, en la terminal y al final.
  // También puedes dejarlo vacío y compartir el enlace así:
  //   https://TU-USUARIO.github.io/yelow_flowers/?para=María
  nombre: "",

  // El nombre de su startup (si lo dejas vacío dice "tu startup").
  // También funciona en el enlace: ?para=María&startup=Acme
  startup: "",

  dedicatoria: "Este detalle es para ti :)",

  // Mensaje que se escribe letra por letra sobre las flores.
  mensaje:
    "Estas flores amarillas son un reflejo de la alegría que traes a mi vida.\n\n" +
    "Gracias por iluminar mis días con tu presencia.",

  // Frases dentro del corazón (aparece varias veces durante la canción).
  // {nombre} se reemplaza por su nombre; si no hay nombre se omite.
  frasesCorazon: [
    "Para ti, {nombre}",
    "Eres mi flor favorita",
    "Gracias por existir",
    "Te quiero 💛",
  ],

  // Lo que responde la terminal con el comando "cat carta.txt".
  carta:
    "Gracias por dejarme ver de cerca cómo construyes tus sueños.\n" +
    "Cada línea de código, cada desvelo, cada 'no' que convertiste en 'sí'.\n" +
    "Te admiro muchísimo. 💛",

  // El mensaje del final de la página.
  mensajeFinal:
    "Qué orgullo verte brillar. Construiste algo desde cero, te atreviste cuando nadie miraba " +
    "y ahora el mundo empieza a ver lo que yo siempre vi.\n\nEsto apenas empieza. 💛",
};
