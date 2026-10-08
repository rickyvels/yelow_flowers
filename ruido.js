// Herramientas matemáticas compartidas por el fondo y los capítulos
var Ruido = (function () {
  const TAU = Math.PI * 2;

  // Ruido de Perlin 3D ("improved noise", Ken Perlin 2002): valores suaves en [-1, 1]
  const perm = new Uint8Array(512);
  const p = [];
  for (let i = 0; i < 256; i++) p[i] = i;
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [p[i], p[j]] = [p[j], p[i]];
  }
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];

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

  function perlin(x, y, z) {
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

  return { perlin, gauss, TAU, ANGULO_DORADO: Math.PI * (3 - Math.sqrt(5)) };
})();
