// Sincronizar las letras con la canción
var audio = document.querySelector("audio");
var lyrics = document.querySelector("#lyrics");

// Array de objetos que contiene cada línea y su tiempo de aparición en segundos (en orden)
var lyricsData = [
  { text: "At the time", time: 15 },
  { text: "The whisper of birds", time: 18 },
  { text: "Lonely before the sun cried", time: 27 },
  { text: "Fell from the sky", time: 32 },
  { text: "Like water drops", time: 37 },
  { text: "Where I'm now? I don't know why", time: 41 },
  { text: "Nice butterflies in my hands", time: 47 },
  { text: "Too much light for twilight", time: 54 },
  { text: "In the mood for the flowers love", time: 59 },
  { text: "That vision", time: 67 },
  { text: "Really strong, blew my mind", time: 72 },
  { text: "Silence Let me see what it was", time: 78 },
  { text: "I only want to live in clouds", time: 83 },
  { text: "Where I'm now? I don't know why", time: 91 },
  { text: "Nice butterflies in my hands", time: 97 },
  { text: "Too much light for twilight", time: 104 },
  { text: "In the mood for the flowers love", time: 108 },
  { text: "At the time", time: 144 },
  { text: "The whisper of birds", time: 148 },
  { text: "Lonely before the sun cried", time: 153 },
  { text: "Fell from the sky", time: 158 },
  { text: "Like water drops", time: 164 },
  { text: "Where I'm now? I don't know why", time: 169 },
  { text: "Nice butterflies in my hands", time: 176 },
  { text: "Too much light for twilight", time: 183 },
  { text: "In the mood for the flowers", time: 188 },
  { text: "Love.", time: 193 },
];

var lineaActual = null;
var cambioPendiente = null;

// Cada línea se muestra desde su tiempo hasta la siguiente (máximo 6 segundos)
function lineaEn(time) {
  for (var i = 0; i < lyricsData.length; i++) {
    var line = lyricsData[i];
    var siguiente = lyricsData[i + 1];
    var fin = Math.min(line.time + 6, siguiente ? siguiente.time : Infinity);
    if (time >= line.time && time < fin) return line;
  }
  return null;
}

// Animar las letras: se desvanece la anterior y aparece la nueva
function updateLyrics() {
  var currentLine = audio.paused && audio.currentTime === 0 ? null : lineaEn(audio.currentTime);
  if (currentLine === lineaActual) return;
  lineaActual = currentLine;
  lyrics.classList.remove("visible");
  clearTimeout(cambioPendiente);
  if (currentLine) {
    cambioPendiente = setTimeout(function () {
      lyrics.textContent = currentLine.text;
      lyrics.classList.add("visible");
    }, 350);
  }
}

setInterval(updateLyrics, 200);
