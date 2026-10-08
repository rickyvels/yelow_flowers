# ✅ Sorprende a tu Novia con este Proyecto de Flor Amarilla 🌻 | HTML CSS JS
### Video del tutorial: [https://youtu.be/ZSSOiJaMIk0](https://youtu.be/ZSSOiJaMIk0)

![image](https://github.com/user-attachments/assets/899d1b33-bc87-45f8-8cb9-e11cf992a9d6)

## ✨ Qué tiene esta versión

- **Todo en una sola página** (`index.html`): al tocar el botón empiezan la música y las flores a la vez, también en iPhone y Android (los navegadores bloquean la música si no se toca algo antes).
- **Fondo algorítmico** (`fondo.js`, canvas):
  - 🌻 Un girasol de **filotaxis** en la intro: cada semilla gira el ángulo dorado (≈137.5°) como en los girasoles reales, con 21 + 34 pétalos (números de Fibonacci). Al tocar el botón, sus semillas se convierten en luciérnagas.
  - 🌌 Vía láctea con distribución normal (Box–Muller), estrellas que titilan y estrellas fugaces.
  - ✨ Luciérnagas que vuelan siguiendo un campo de flujo de **ruido de Perlin**.
  - 💛 Varias veces durante la canción las luciérnagas forman un **corazón paramétrico** (`x = 16·sin³t`, `y = 13·cos t − 5·cos 2t − 2·cos 3t − cos 4t`) que late, con un mensaje dentro.
  - 🌼 Al tocar el cielo nace una flor de luz donde pusiste el dedo, y las luciérnagas se acercan.
- **Responsive**: se adapta a celulares (vertical y horizontal), tablets y computadoras.
- Botón para silenciar la música y botón para verlo otra vez al final.

## 💌 Personalízalo

Edita `config.js`:

```js
var CONFIG = {
  nombre: "María",                       // aparece en el saludo y en el corazón
  dedicatoria: "Este detalle es para ti :)",
  mensaje: "Estas flores amarillas son...", // se escribe letra por letra
  frasesCorazon: ["Para ti, {nombre}", "Eres mi flor favorita", "Gracias por existir", "Te quiero 💛"],
};
```

También puedes dejar `nombre` vacío y poner su nombre en el enlace:
`https://TU-USUARIO.github.io/yelow_flowers/?para=María`

## 🚀 Publicarlo gratis con GitHub Pages

1. Sube los archivos a tu repositorio (rama `main`).
2. En GitHub: **Settings → Pages → Build and deployment → Source: Deploy from a branch**, elige `main` y la carpeta `/ (root)` y guarda.
3. En 1–2 minutos estará en `https://TU-USUARIO.github.io/yelow_flowers/`.
4. Para la vista previa al compartir por WhatsApp, cambia la URL de `og:image` en `index.html` si tu usuario o repositorio tienen otro nombre.

Para probarlo en tu computadora basta con abrir `index.html` en el navegador (o usar la extensión *Live Server* de VS Code).
