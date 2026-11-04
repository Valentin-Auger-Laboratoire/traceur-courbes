// Tests du moteur du traceur de courbes : node tests/test.js
const assert = require('assert');
const T = require('../traceur.js');
let n = 0;
const close = (a, b, tol, msg) => { n++; assert.ok(Math.abs(a - b) <= tol * (1 + Math.abs(b)), (msg || '') + ' : ' + a + ' ≠ ' + b); };
const ev = (s, x) => T.evaluate(s, { x });

// 1. Lecture et calcul des formules
close(ev('2x^2 + 3x - 1', 2), 13, 0, 'polynôme');
close(ev('-x^2', 3), -9, 0, 'signe et puissance');
close(ev('2^3^2'), 512, 0, 'puissance associative à droite');
close(ev('2^-1'), 0.5, 0, 'exposant négatif');
close(ev('(x+1)(x-1)', 3), 8, 0, 'produit implicite de parenthèses');
close(ev('x(x+1)', 2), 6, 0, 'variable suivie de parenthèses');
close(ev('2pi'), 2 * Math.PI, 1e-15, 'nombre suivi de pi');
close(ev('pix', 2), 2 * Math.PI, 1e-15, 'pi et x collés');
close(ev('sin(pi/2) + cos(0)'), 2, 1e-15, 'trigonométrie');
close(ev('ln(e^2)'), 2, 1e-15, 'ln et e');
close(ev('log(1000)'), 3, 1e-15, 'log décimal');
close(ev('sqrt(16) + abs(-3) + cbrt(27)'), 10, 1e-15, 'racines et valeur absolue');
close(ev('(-8)^(1/3)'), -2, 1e-12, 'racine cubique d’un négatif');
close(ev('3 · 2 − 1'), 5, 0, 'signes typographiques');
close(ev('x²', 3), 9, 0, 'exposant ²');
close(ev('1/2x', 4), 2, 0, '1/2x = (1/2)·x');
close(ev('sum(k, 1, 100, k)'), 5050, 0, 'somme');
close(ev('min(2, 3) + max(2, 3) + mod(7, 3)'), 6, 0, 'fonctions à deux arguments');
close(ev('2.5e3'), 2500, 0, 'notation scientifique');
for (const [src, code] of [['2+', 'end'], ['(1', 'paren'], ['sin x', 'fnParen'], ['sinx', 'fnParen'], ['2 $ 3', 'char'], ['max(1)', 'args'], ['1 2 )', 'unexpected']]) {
  n++;
  assert.throws(() => T.parse(src, new Set()), (e) => e.code === code, src + ' → ' + code);
}

// 2. Dérivation symbolique : comparaison aux différences finies sur des points tirés au hasard
const FORMS = ['x^3 - 3x', 'sin(x)·cos(2x)', 'exp(-x^2/2)', 'ln(x^2 + 1)', 'sqrt(x^2 + 4)', 'x/(x^2 + 1)', 'atan(3x)', 'tan(x/3)',
  'x^x', '2^x', 'sinh(x)/cosh(x)', 'abs(x - 0.3)^3', 'asin(x/4)', 'acos(x/5)', 'log(x^2 + 2)', 'cbrt(x^2 + 1)', 'exp(sin(x))·x^2', '1/(1 + exp(-x))', 'sum(k, 1, 5, sin(k x)/k)', 'x^2·ln(x^2 + 1) - 3/x'];
let seed = 7;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
for (const src of FORMS) {
  const f = (x) => ev(src, x);
  const d1 = T.derivativeOf(src), d2 = T.simplify(T.diff(d1, 'x'));
  const g1 = (x) => T.compile(d1, { P: {}, call: () => NaN })({ x });
  const g2 = (x) => T.compile(d2, { P: {}, call: () => NaN })({ x });
  // le texte affiché se relit et donne la même dérivée
  const back = T.parse(T.toStr(d1), new Set());
  const g1b = (x) => T.compile(back, { P: {}, call: () => NaN })({ x });
  for (let k = 0; k < 150; k++) {
    const x = src.includes('x^x') ? 0.2 + 3 * rnd() : -3 + 6 * rnd();
    if (Math.abs(x) < 0.05) continue;
    const h = 1e-5, num = (f(x + h) - f(x - h)) / (2 * h);
    const num2 = (f(x + 1e-3) - 2 * f(x) + f(x - 1e-3)) / 1e-6;
    if (!Number.isFinite(num) || !Number.isFinite(g1(x))) continue;
    close(g1(x), num, 1e-5, "f' de " + src + ' en ' + x);
    close(g1b(x), g1(x), 1e-10, 'relecture de ' + T.toStr(d1));
    if (Number.isFinite(num2) && Number.isFinite(g2(x))) close(g2(x), num2, 2e-3, "f'' de " + src + ' en ' + x);
  }
}
// formes simplifiées attendues
for (const [src, want] of [['x^2', '2x'], ['sin(x)', 'cos(x)'], ['x^3 - 3x', '3x^2 - 3'], ['1/x', '-1/x^2'], ['sqrt(x^2+1)', 'x/sqrt(x^2 + 1)'],
  ['sin(2x)', '2cos(2x)'], ['x/(x+1)', '1/(x + 1)^2'], ['ln(x)', '1/x'], ['atan(x)', '1/(1 + x^2)']]) {
  n++; assert.strictEqual(T.toStr(T.derivativeOf(src)), want, 'forme de la dérivée de ' + src);
}

// 3. Modèle complet : fonctions nommées, dérivées f', curseurs, courbes, points, erreurs
const m = T.buildModel(['f(x) = x^2 - 2', 'g(x) = f(x) + a', "h(x) = f'(x)", '(cos(t), sin(t))', 'r = 1 + cos(θ)', 'A = (1, 2)', 'b = 3', '2 + 2', 'y = b x', 'x = 4']);
n++; assert.deepStrictEqual(m.items.map((i) => i.kind), ['func', 'func', 'func', 'curve', 'polar', 'point', 'param', 'calc', 'func', 'vline']);
n++; assert.deepStrictEqual(m.missing, ['a'], 'curseur créé pour a');
m.updateParams({ a: 5 });
close(m.items[1].fn(2), 7, 0, 'g utilise f et le curseur a');
close(m.items[2].fn(3), 6, 0, "h = f'");
close(m.items[8].fn(2), 6, 0, 'paramètre b défini dans une ligne');
close(m.items[7].value(), 4, 0, 'simple calcul');
close(m.items[5].fx(0) + m.items[5].fy(0), 3, 0, 'point');
n++; assert.strictEqual(m.derivativeText(m.items[0], 1), '2x');
n++; assert.strictEqual(m.derivativeText(m.items[1], 1), "f'(x)");
for (const [ls, code] of [[['f(x) = f(x) + 1'], 'cycle'], [['a = b', 'b = a'], 'cycle'], [['f(x) = x', 'f(x) = 2x'], 'dup'], [['f(x) = x', 'y = f + 1'], 'fnParen'], [['sin(x) = 2'], 'reserved'], [['f(x) = t'], 'unbound']]) {
  const mm = T.buildModel(ls);
  n++; assert.ok(mm.items.some((i) => i.kind === 'error' && i.error.code === code), ls.join(' ; ') + ' → ' + code);
}

// 4. Zéros, extremums, inflexions, intersections
const zs = (f, a, b) => T.zeros(f, a, b);
n++; assert.strictEqual(zs((x) => x * x - 2, -3, 3).length, 2);
zs((x) => x * x - 2, -3, 3).forEach((x) => close(Math.abs(x), Math.SQRT2, 1e-13, '±√2'));
n++; assert.strictEqual(zs((x) => (x - 1) ** 2, -3, 3).length, 1, 'zéro double');
close(zs((x) => (x - 1) ** 2, -3, 3)[0], 1, 1e-6, 'zéro double en 1');
n++; assert.deepStrictEqual(zs(Math.tan, -4, 4).map((x) => +x.toFixed(10)), [-3.1415926536, 0, 3.1415926536], 'tan : zéros sans les pôles');
n++; assert.strictEqual(zs((x) => 1 / x, -3, 3).length, 0, '1/x n’a pas de zéro');
n++; assert.strictEqual(zs(Math.sin, -0.5, 10).length, 4, 'sin sur [−0,5 ; 10] : 0, π, 2π, 3π');
n++; assert.strictEqual(zs(() => 0, -1, 1).length, 0, 'fonction nulle : pas de liste infinie');
const ex = T.extrema((x) => x ** 3 - 3 * x, (x) => 3 * x * x - 3, -3, 3);
n++; assert.deepStrictEqual(ex.map((p) => [p.type, +p.x.toFixed(12), +p.y.toFixed(12)]), [['max', -1, 2], ['min', 1, -2]]);
const exAbs = T.extrema(Math.abs, Math.sign, -2, 3);
n++; assert.ok(exAbs.length === 1 && exAbs[0].type === 'min' && Math.abs(exAbs[0].x) < 1e-12, '|x| : minimum en 0');
n++; assert.strictEqual(T.extrema(Math.tan, (x) => 1 / Math.cos(x) ** 2, -4, 4).length, 0, 'tan : pas d’extremum');
const inf = T.inflections((x) => x ** 3, (x) => 6 * x, -2, 2);
n++; assert.ok(inf.length === 1 && Math.abs(inf[0].x) < 1e-12, 'x³ : inflexion en 0');
const it = T.intersections((x) => x * x, (x) => x + 2, -5, 5);
n++; assert.deepStrictEqual(it.map((p) => +p.x.toFixed(12)), [-1, 2], 'x² = x + 2');
// pic de résonance d'un second ordre : x = √(1 − 1/(2Q²))
const Q = 2, H = (x) => 1 / Math.sqrt((1 - x * x) ** 2 + (x / Q) ** 2);
const mr = T.buildModel(['H(x) = 1/sqrt((1 - x^2)^2 + (x/Q)^2)', 'Q = 2']);
const pk = T.extrema(H, mr.derivative(mr.items[0], 1), 0.01, 3).filter((p) => p.type === 'max');
close(pk[0].x, Math.sqrt(1 - 1 / (2 * Q * Q)), 1e-10, 'pulsation de résonance');

// 5. Intégrales
close(T.integral(Math.sin, 0, Math.PI), 2, 1e-12, '∫ sin sur [0, π]');
close(T.integral((x) => x * x, 0, 1), 1 / 3, 1e-13, '∫ x²');
close(T.integral(Math.exp, 0, 1), Math.E - 1, 1e-13, '∫ exp');
close(T.integral(Math.sin, 0, 2 * Math.PI), 0, 1e-12, '∫ sin sur une période');
close(T.integral((x) => x * x, 1, 0), -1 / 3, 1e-13, 'bornes inversées');
close(T.area(Math.sin, 0, 2 * Math.PI), 4, 1e-11, 'aire de |sin|');
close(T.integral((x) => Math.exp(-x * x / 2) / Math.sqrt(2 * Math.PI), -1, 1), 0.682689492137086, 1e-11, 'loi normale à ±1σ');
n++; assert.ok(Number.isNaN(T.integral((x) => 1 / x, -1, 1)), 'intégrale sur un pôle : NaN');

// 6. Exemple « série de Fourier » : la somme tend vers le signal carré
const mf = T.buildModel(['s(x) = 4/π · sum(k, 0, n, sin((2k+1)x)/(2k+1))', 'n = 200']);
close(mf.items[0].fn(Math.PI / 2), 1, 5e-3, 'Fourier au milieu du créneau');

// 7. Graduations
n++; assert.strictEqual(T.niceStep(20, 10), 2);
n++; assert.strictEqual(T.piLabel(3, 1, 2), '3π/2');
n++; assert.strictEqual(T.piLabel(-2, 1, 4), '-π/2');

console.log('OK : ' + n + ' vérifications passent');
