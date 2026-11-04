/* Traceur de courbes : moteur (lecture des formules, dérivation symbolique, analyse numérique).
   Aucune dépendance, aucun eval : les formules sont lues par un analyseur écrit à la main.
   Utilisable dans le navigateur (window.Traceur) et avec Node (module.exports). */
(function (root, factory) {
  const M = factory();
  if (typeof module === 'object' && module.exports) module.exports = M;
  else root.Traceur = M;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ---------- Fonctions et constantes connues ----------
  const F1 = {
    sin: Math.sin, cos: Math.cos, tan: Math.tan,
    asin: Math.asin, acos: Math.acos, atan: Math.atan, arcsin: Math.asin, arccos: Math.acos, arctan: Math.atan,
    sinh: Math.sinh, cosh: Math.cosh, tanh: Math.tanh,
    exp: Math.exp, ln: Math.log, log: Math.log10, sqrt: Math.sqrt, cbrt: Math.cbrt, abs: Math.abs,
    floor: Math.floor, ceil: Math.ceil, round: Math.round, sign: Math.sign,
  };
  const F2 = { min: Math.min, max: Math.max, mod: (a, b) => a - b * Math.floor(a / b), atan2: Math.atan2 };
  const CONSTS = { pi: Math.PI, 'π': Math.PI, e: Math.E };
  const BOUND = ['x', 't', 'θ'];
  const RESERVED = new Set([...Object.keys(F1), ...Object.keys(F2), 'pi', 'π', 'e', 'sum', 'x', 'y', 'r', 't', 'θ']);

  // Erreur de lecture : code traduit par l'interface, position dans la ligne, argument éventuel
  class FormulaError extends Error {
    constructor(code, pos, arg) { super(code + (arg ? ' ' + arg : '')); this.code = code; this.pos = pos; this.arg = arg; }
  }
  const fail = (code, pos, arg) => { throw new FormulaError(code, pos, arg); };

  // ---------- Découpage en jetons ----------
  function normalize(s) {
    return String(s).replace(/[−–]/g, '-').replace(/[·×∙]/g, '*').replace(/÷/g, '/')
      .replace(/²/g, '^2').replace(/³/g, '^3').replace(/\btheta\b/g, 'θ');
  }
  // Un identifiant inconnu fait de variables et de constantes collées (« pix », « xe ») est découpé
  const SPLIT = ['pi', 'π', 'x', 't', 'θ', 'e'];
  function splitIdent(id, min = 2) {
    const out = [];
    let i = 0;
    while (i < id.length) {
      const p = SPLIT.find((k) => id.startsWith(k, i));
      if (!p) return null;
      out.push(p); i += p.length;
    }
    return out.length >= min ? out : null;
  }
  function tokenize(src) {
    const s = normalize(src), out = [];
    let i = 0, m;
    while (i < s.length) {
      const c = s[i];
      if (/\s/.test(c)) { i++; continue; }
      const rest = s.slice(i);
      if ((m = /^(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?/.exec(rest))) { out.push({ k: 'num', v: parseFloat(m[0]), p: i }); i += m[0].length; continue; }
      if ((m = /^[A-Za-z_Ͱ-Ͽ][A-Za-z0-9_Ͱ-Ͽ]*/.exec(rest))) {
        const id = m[0], p = i;
        i += id.length;
        let d = 0;
        while (s[i] === "'") { d++; i++; }
        out.push({ k: 'id', v: id, d, p });
        continue;
      }
      if ('+-*/^(),='.includes(c)) { out.push({ k: c, p: i }); i++; continue; }
      fail('char', i, c);
    }
    out.push({ k: 'end', p: s.length });
    return out;
  }

  // ---------- Analyse syntaxique (descente récursive) ----------
  // Priorités : somme < produit (et multiplication implicite) < signe < puissance (associative à droite)
  function parseTokens(tokens, fnNames) {
    let i = 0;
    const peek = () => tokens[i];
    const next = () => tokens[i++];
    const expect = (k) => { const t = next(); if (t.k !== k) fail(t.k === 'end' ? 'end' : 'expected', t.p, k); return t; };
    const startsPrimary = (t) => t.k === 'num' || t.k === 'id' || t.k === '(';

    function sum() {
      let a = prod();
      while (peek().k === '+' || peek().k === '-') { const op = next().k; a = { t: 'bin', op, a, b: prod() }; }
      return a;
    }
    function prod() {
      let a = unary();
      for (;;) {
        const t = peek();
        if (t.k === '*' || t.k === '/') { next(); a = { t: 'bin', op: t.k, a, b: unary() }; }
        else if (startsPrimary(t)) a = { t: 'bin', op: '*', a, b: power() };
        else return a;
      }
    }
    function unary() {
      if (peek().k === '-') { next(); return { t: 'neg', a: unary() }; }
      if (peek().k === '+') { next(); return unary(); }
      return power();
    }
    function power() {
      const base = primary();
      if (peek().k === '^') { next(); return { t: 'bin', op: '^', a: base, b: unary() }; }
      return base;
    }
    function args(n, name, p) {
      expect('(');
      const list = [sum()];
      while (peek().k === ',') { next(); list.push(sum()); }
      const close = next();
      if (close.k !== ')') fail(close.k === 'end' ? 'paren' : 'expected', close.p, ')');
      if (list.length !== n) fail('args', p, name + ':' + n);
      return list;
    }
    function primary() {
      const t = next();
      if (t.k === 'num') return { t: 'num', v: t.v };
      if (t.k === '(') {
        const first = sum();
        if (peek().k === ',') {
          const items = [first];
          while (peek().k === ',') { next(); items.push(sum()); }
          const c = next(); if (c.k !== ')') fail(c.k === 'end' ? 'paren' : 'expected', c.p, ')');
          return { t: 'tuple', items, p: t.p };
        }
        const c = next(); if (c.k !== ')') fail(c.k === 'end' ? 'paren' : 'expected', c.p, ')');
        return first;
      }
      if (t.k === 'id') {
        const id = t.v;
        if (id === 'sum' || id === 'somme') {
          expect('(');
          const v = next(); if (v.k !== 'id') fail('sumVar', v.p);
          expect(','); const from = sum(); expect(','); const to = sum(); expect(','); const body = sum();
          const c = next(); if (c.k !== ')') fail(c.k === 'end' ? 'paren' : 'expected', c.p, ')');
          return { t: 'sum', v: v.v, from, to, body };
        }
        if (F1[id] || F2[id]) {
          if (t.d) fail('primeBuiltin', t.p, id);
          if (peek().k !== '(') fail('fnParen', t.p, id);
          return { t: 'call', f: id, args: args(F1[id] ? 1 : 2, id, t.p) };
        }
        if (fnNames && fnNames.has(id)) {
          if (peek().k !== '(') fail('fnParen', t.p, id);
          return { t: 'ucall', n: id, d: t.d, args: args(1, id, t.p) };
        }
        if (t.d) fail('unknownFn', t.p, id);
        if (CONSTS[id] !== undefined) return { t: 'const', n: id };
        if (id.length > 1) {
          const fn = [...Object.keys(F1), ...Object.keys(F2)].find((f) => id.startsWith(f) && id.length > f.length && splitIdent(id.slice(f.length), 1));
          if (fn) fail('fnParen', t.p, fn);
          const parts = splitIdent(id);
          if (parts) return parts.map((n) => (CONSTS[n] !== undefined ? { t: 'const', n } : { t: 'var', n })).reduce((a, b) => ({ t: 'bin', op: '*', a, b }));
        }
        return { t: 'var', n: id };
      }
      fail(t.k === 'end' ? 'end' : 'unexpected', t.p, t.k);
    }
    const tree = sum();
    return { tree, rest: i };
  }

  function parse(src, fnNames) {
    const tokens = tokenize(src);
    const { tree, rest } = parseTokens(tokens, fnNames);
    const t = tokens[rest];
    if (t.k !== 'end') fail('unexpected', t.p, t.k === 'id' ? t.v : t.k);
    return tree;
  }

  // ---------- Parcours de l'arbre ----------
  function freeVars(n, bound = new Set(), out = new Set()) {
    switch (n.t) {
      case 'var': if (!bound.has(n.n)) out.add(n.n); break;
      case 'neg': freeVars(n.a, bound, out); break;
      case 'bin': freeVars(n.a, bound, out); freeVars(n.b, bound, out); break;
      case 'call': case 'ucall': n.args.forEach((a) => freeVars(a, bound, out)); break;
      case 'tuple': n.items.forEach((a) => freeVars(a, bound, out)); break;
      case 'sum': {
        freeVars(n.from, bound, out); freeVars(n.to, bound, out);
        const b2 = new Set(bound); b2.add(n.v); freeVars(n.body, b2, out); break;
      }
    }
    return out;
  }
  function userCalls(n, out = new Set()) {
    if (n.t === 'ucall') out.add(n.n);
    for (const c of children(n)) userCalls(c, out);
    return out;
  }
  function children(n) {
    switch (n.t) {
      case 'neg': return [n.a];
      case 'bin': return [n.a, n.b];
      case 'call': case 'ucall': return n.args;
      case 'tuple': return n.items;
      case 'sum': return [n.from, n.to, n.body];
      default: return [];
    }
  }
  function dependsOn(n, v) {
    if (n.t === 'var') return n.n === v;
    if (n.t === 'sum' && n.v === v) return dependsOn(n.from, v) || dependsOn(n.to, v);
    return children(n).some((c) => dependsOn(c, v));
  }

  // ---------- Dérivation symbolique ----------
  const num = (v) => ({ t: 'num', v });
  const bin = (op, a, b) => ({ t: 'bin', op, a, b });
  const call = (f, a) => ({ t: 'call', f, args: [a] });
  const neg = (a) => ({ t: 'neg', a });
  class NoDiff extends Error {}

  function diff(n, v) {
    switch (n.t) {
      case 'num': case 'const': return num(0);
      case 'var': return num(n.n === v ? 1 : 0);
      case 'neg': return neg(diff(n.a, v));
      case 'tuple': throw new NoDiff();
      case 'bin': {
        const { a, b } = n, da = () => diff(a, v), db = () => diff(b, v);
        switch (n.op) {
          case '+': case '-': return bin(n.op, da(), db());
          case '*': return bin('+', bin('*', da(), b), bin('*', a, db()));
          case '/':
            if (!dependsOn(b, v)) return bin('/', da(), b);
            if (!dependsOn(a, v)) return neg(bin('/', bin('*', a, db()), bin('^', b, num(2))));
            return bin('/', bin('-', bin('*', da(), b), bin('*', a, db())), bin('^', b, num(2)));
          case '^':
            if (!dependsOn(b, v)) return bin('*', bin('*', b, bin('^', a, bin('-', b, num(1)))), da());
            if (!dependsOn(a, v)) return bin('*', bin('*', n, call('ln', a)), db());
            return bin('*', n, bin('+', bin('*', db(), call('ln', a)), bin('/', bin('*', b, da()), a)));
        }
        break;
      }
      case 'call': {
        if (n.args.length !== 1) throw new NoDiff();
        const u = n.args[0], du = diff(u, v);
        let g;
        switch (n.f) {
          case 'sin': g = call('cos', u); break;
          case 'cos': g = neg(call('sin', u)); break;
          case 'tan': g = bin('/', num(1), bin('^', call('cos', u), num(2))); break;
          case 'asin': case 'arcsin': g = bin('/', num(1), call('sqrt', bin('-', num(1), bin('^', u, num(2))))); break;
          case 'acos': case 'arccos': g = neg(bin('/', num(1), call('sqrt', bin('-', num(1), bin('^', u, num(2)))))); break;
          case 'atan': case 'arctan': g = bin('/', num(1), bin('+', num(1), bin('^', u, num(2)))); break;
          case 'sinh': g = call('cosh', u); break;
          case 'cosh': g = call('sinh', u); break;
          case 'tanh': g = bin('/', num(1), bin('^', call('cosh', u), num(2))); break;
          case 'exp': g = call('exp', u); break;
          case 'ln': g = bin('/', num(1), u); break;
          case 'log': g = bin('/', num(1), bin('*', u, call('ln', num(10)))); break;
          case 'sqrt': g = bin('/', num(1), bin('*', num(2), call('sqrt', u))); break;
          case 'cbrt': g = bin('/', num(1), bin('*', num(3), bin('^', call('cbrt', u), num(2)))); break;
          case 'abs': g = call('sign', u); break;
          case 'floor': case 'ceil': case 'round': case 'sign': return num(0);
          default: throw new NoDiff();
        }
        return bin('*', g, du);
      }
      case 'ucall': {
        const u = n.args[0];
        return bin('*', { t: 'ucall', n: n.n, d: n.d + 1, args: [u] }, diff(u, v));
      }
      case 'sum':
        if (dependsOn(n.from, v) || dependsOn(n.to, v) || n.v === v) throw new NoDiff();
        return { t: 'sum', v: n.v, from: n.from, to: n.to, body: diff(n.body, v) };
    }
    throw new NoDiff();
  }

  // ---------- Simplification (pour un affichage lisible) ----------
  const isNum = (n, v) => n.t === 'num' && (v === undefined || n.v === v);
  const intLike = (x) => Number.isFinite(x) && Math.abs(x - Math.round(x)) < 1e-12 && Math.abs(x) < 1e15;
  function same(a, b) { return JSON.stringify(a) === JSON.stringify(b); }

  function simplify(n) {
    switch (n.t) {
      case 'neg': {
        const a = simplify(n.a);
        if (isNum(a)) return num(-a.v);
        if (a.t === 'neg') return a.a;
        if (a.t === 'bin' && a.op === '*' && isNum(a.a)) return simplify(bin('*', num(-a.a.v), a.b));
        return neg(a);
      }
      case 'call': {
        const args = n.args.map(simplify);
        if (args.every((a) => isNum(a))) {
          const r = (F1[n.f] || F2[n.f])(...args.map((a) => a.v));
          if (intLike(r)) return num(Math.round(r));
        }
        return { t: 'call', f: n.f, args };
      }
      case 'ucall': return { t: 'ucall', n: n.n, d: n.d, args: n.args.map(simplify) };
      case 'tuple': return { t: 'tuple', items: n.items.map(simplify) };
      case 'sum': {
        const body = simplify(n.body);
        if (isNum(body, 0)) return num(0);
        return { t: 'sum', v: n.v, from: simplify(n.from), to: simplify(n.to), body };
      }
      case 'bin': {
        let a = simplify(n.a), b = simplify(n.b);
        const op = n.op;
        if (isNum(a) && isNum(b)) {
          const r = op === '+' ? a.v + b.v : op === '-' ? a.v - b.v : op === '*' ? a.v * b.v : op === '/' ? a.v / b.v : Math.pow(a.v, b.v);
          if (op === '+' || op === '-' || op === '*' ? Number.isFinite(r) : intLike(r)) return num(r);
        }
        switch (op) {
          case '+':
            if (isNum(a, 0)) return b;
            if (isNum(b, 0)) return a;
            if (b.t === 'neg') return simplify(bin('-', a, b.a));
            if (isNum(b) && b.v < 0) return bin('-', a, num(-b.v));
            if (same(a, b)) return simplify(bin('*', num(2), a));
            break;
          case '-':
            if (isNum(b, 0)) return a;
            if (isNum(a, 0)) return simplify(neg(b));
            if (b.t === 'neg') return simplify(bin('+', a, b.a));
            if (same(a, b)) return num(0);
            // (p + q) - p → q ; (p + q) - q → p
            if (a.t === 'bin' && a.op === '+' && same(a.a, b)) return a.b;
            if (a.t === 'bin' && a.op === '+' && same(a.b, b)) return a.a;
            break;
          case '*':
            if (isNum(a, 0) || isNum(b, 0)) return num(0);
            if (isNum(a, 1)) return b;
            if (isNum(b, 1)) return a;
            if (isNum(a, -1)) return simplify(neg(b));
            if (isNum(b, -1)) return simplify(neg(a));
            if (isNum(b) && !isNum(a)) return simplify(bin('*', b, a));
            if (a.t === 'neg') return simplify(neg(bin('*', a.a, b)));
            if (b.t === 'neg') return simplify(neg(bin('*', a, b.a)));
            if (isNum(a) && b.t === 'bin' && b.op === '*' && isNum(b.a)) return simplify(bin('*', num(a.v * b.a.v), b.b));
            if (b.t === 'bin' && b.op === '*' && isNum(b.a) && !isNum(a)) return simplify(bin('*', b.a, bin('*', a, b.b)));
            if (a.t === 'bin' && a.op === '*' && isNum(a.a) && !isNum(b)) return simplify(bin('*', a.a, bin('*', a.b, b)));
            if (isNum(a, 1) === false && b.t === 'bin' && b.op === '/' && isNum(b.a, 1)) return simplify(bin('/', a, b.b));
            if (same(a, b)) return simplify(bin('^', a, num(2)));
            if (b.t === 'bin' && b.op === '^' && same(a, b.a)) return simplify(bin('^', a, bin('+', b.b, num(1))));
            // a·(p/q) → (a·p)/q et (p/q)·a → (p·a)/q
            if (b.t === 'bin' && b.op === '/') return simplify(bin('/', bin('*', a, b.a), b.b));
            if (a.t === 'bin' && a.op === '/') return simplify(bin('/', bin('*', a.a, b), a.b));
            break;
          case '/':
            if (isNum(a, 0)) return num(0);
            if (isNum(b, 1)) return a;
            if (same(a, b)) return num(1);
            if (a.t === 'neg') return simplify(neg(bin('/', a.a, b)));
            // (A·B)/B → A, (B·A)/B → A, (p/q)/r → p/(q·r)
            if (a.t === 'bin' && a.op === '*' && same(a.b, b)) return a.a;
            if (a.t === 'bin' && a.op === '*' && same(a.a, b)) return a.b;
            if (a.t === 'bin' && a.op === '/') return simplify(bin('/', a.a, bin('*', a.b, b)));
            {
              // facteur numérique commun : (2·A)/(2·B) → A/B, 2/(2·B) → 1/B
              const ka = isNum(a) ? a.v : a.t === 'bin' && a.op === '*' && isNum(a.a) ? a.a.v : null;
              const kb = isNum(b) ? b.v : b.t === 'bin' && b.op === '*' && isNum(b.a) ? b.a.v : null;
              if (ka !== null && kb !== null && ka !== 0 && kb !== 0 && !(isNum(a) && isNum(b)) && intLike(ka / kb)) {
                const q = Math.round(ka / kb);
                const top = isNum(a) ? num(q) : bin('*', num(q), a.b);
                return simplify(bin('/', top, isNum(b) ? num(1) : b.b));
              }
            }
            break;
          case '^':
            if (isNum(b, 0)) return num(1);
            if (isNum(b, 1)) return a;
            if (isNum(a, 1)) return num(1);
            if (a.t === 'call' && a.f === 'sqrt' && isNum(b, 2)) return a.args[0];
            if (a.t === 'bin' && a.op === '^' && isNum(a.b) && isNum(b)) return simplify(bin('^', a.a, num(a.b.v * b.v)));
            break;
        }
        return bin(op, a, b);
      }
    }
    return n;
  }

  // ---------- Écriture d'un arbre en texte (relisible par parse) ----------
  function fmtNum(v) {
    if (!Number.isFinite(v)) return String(v);
    if (intLike(v)) return String(Math.round(v));
    return String(+v.toPrecision(12));
  }
  const PREC = { '+': 1, '-': 1, '*': 2, '/': 2, neg: 3, '^': 4 };
  function prec(n) {
    if (n.t === 'bin') return PREC[n.op];
    if (n.t === 'neg') return PREC.neg;
    if (n.t === 'num' && n.v < 0) return PREC.neg;
    return 5;
  }
  function toStr(n) {
    switch (n.t) {
      case 'num': return fmtNum(n.v);
      case 'const': return n.n === 'pi' ? 'π' : n.n;
      case 'var': return n.n;
      case 'neg': { const s = toStr(n.a); return '-' + (prec(n.a) <= 1 || n.a.t === 'neg' || (n.a.t === 'num' && n.a.v < 0) ? '(' + s + ')' : s); }
      case 'call': return n.f + '(' + n.args.map(toStr).join(', ') + ')';
      case 'ucall': return n.n + "'".repeat(n.d) + '(' + toStr(n.args[0]) + ')';
      case 'tuple': return '(' + n.items.map(toStr).join(', ') + ')';
      case 'sum': return 'sum(' + n.v + ', ' + toStr(n.from) + ', ' + toStr(n.to) + ', ' + toStr(n.body) + ')';
      case 'bin': {
        const p = PREC[n.op];
        const wrap = (c, right) => {
          const cp = prec(c);
          const need = n.op === '^' ? (right ? cp < 4 : cp <= 4) : right ? (cp < p || (cp === p && (n.op === '-' || n.op === '/'))) : cp < p;
          return need ? '(' + toStr(c) + ')' : toStr(c);
        };
        const sa = wrap(n.a, false), sb = wrap(n.b, true);
        if (n.op === '*') {
          // « 2x », « 3x^2 », « 2cos(x) » : nombre suivi d'un terme qui commence par une lettre
          if (n.a.t === 'num' && /^[A-Za-zπθ]/.test(sb) && !/^e/.test(sb) && prec(n.b) >= 4) return sa + sb;
          return sa + '·' + sb;
        }
        if (n.op === '^') return sa + '^' + sb;
        if (n.op === '/') return sa + '/' + sb;
        return sa + ' ' + n.op + ' ' + sb;
      }
    }
    return '?';
  }

  // ---------- Compilation en fonctions JavaScript (sans eval) ----------
  // env = { P: valeurs des paramètres, call(nom, ordre, valeur) : appel d'une fonction utilisateur }
  function compile(n, env) {
    switch (n.t) {
      case 'num': { const v = n.v; return () => v; }
      case 'const': { const v = CONSTS[n.n]; return () => v; }
      case 'var': {
        const name = n.n, P = env.P;
        return (L) => (name in L ? L[name] : name in P ? P[name] : NaN);
      }
      case 'neg': { const a = compile(n.a, env); return (L) => -a(L); }
      case 'bin': {
        const a = compile(n.a, env), b = compile(n.b, env);
        switch (n.op) {
          case '+': return (L) => a(L) + b(L);
          case '-': return (L) => a(L) - b(L);
          case '*': return (L) => a(L) * b(L);
          case '/': return (L) => a(L) / b(L);
          case '^': return (L) => {
            const x = a(L), y = b(L);
            // racine impaire d'un négatif : (-8)^(1/3) = -2
            if (x < 0 && !Number.isInteger(y)) {
              const inv = 1 / y, k = Math.round(inv);
              if (Math.abs(inv - k) < 1e-9 && k % 2 !== 0) return -Math.pow(-x, y);
            }
            return Math.pow(x, y);
          };
        }
        break;
      }
      case 'call': {
        const f = F1[n.f] || F2[n.f], args = n.args.map((c) => compile(c, env));
        if (args.length === 1) { const a = args[0]; return (L) => f(a(L)); }
        const [a, b] = args; return (L) => f(a(L), b(L));
      }
      case 'ucall': {
        const a = compile(n.args[0], env), name = n.n, d = n.d;
        return (L) => env.call(name, d, a(L));
      }
      case 'sum': {
        const from = compile(n.from, env), to = compile(n.to, env), body = compile(n.body, env), v = n.v;
        return (L) => {
          const lo = Math.round(from(L)), hi = Math.round(to(L));
          if (!Number.isFinite(lo) || !Number.isFinite(hi) || hi - lo > 100000) return NaN;
          const L2 = Object.assign({}, L);
          let s = 0;
          for (let k = lo; k <= hi; k++) { L2[v] = k; s += body(L2); }
          return s;
        };
      }
      case 'tuple': throw new FormulaError('tupleHere', n.p || 0);
    }
    throw new FormulaError('unexpected', 0);
  }

  // ---------- Lecture d'une ligne de la liste ----------
  const HEAD_FN = /^\s*([A-Za-z_Ͱ-Ͽ][A-Za-z0-9_Ͱ-Ͽ]*)\s*\(\s*([A-Za-z_Ͱ-Ͽ][A-Za-z0-9_Ͱ-Ͽ]*)\s*\)\s*=/;
  function fnNamesOf(lines) {
    const s = new Set();
    lines.forEach((l) => { const m = HEAD_FN.exec(normalize(l)); if (m && !RESERVED.has(m[1])) s.add(m[1]); });
    return s;
  }
  // Renvoie { kind, name, v (variable), ast (ou x/y pour une courbe paramétrique ou un point) }
  // kind : empty | func | param | polar | curve | point | vline | calc
  function parseLine(src, fnNames) {
    const s = normalize(src);
    if (!s.trim() || /^\s*(#|\/\/)/.test(s)) return { kind: 'empty' };
    const eq = s.indexOf('=');
    if (eq >= 0 && s.indexOf('=', eq + 1) >= 0) fail('twoEq', s.indexOf('=', eq + 1));
    if (eq < 0) {
      const ast = parse(s, fnNames);
      return classifyRhs(null, ast);
    }
    const lhs = s.slice(0, eq).trim(), rhs = s.slice(eq + 1);
    if (!rhs.trim()) fail('end', s.length);
    const off = (e) => { if (e instanceof FormulaError) e.pos += eq + 1; return e; };
    let ast;
    try { ast = parse(rhs, fnNames); } catch (e) { throw off(e); }
    let m;
    if ((m = HEAD_FN.exec(s))) {
      const name = m[1], v = m[2] === 'theta' ? 'θ' : m[2];
      if (RESERVED.has(name)) fail('reserved', 0, name);
      if (ast.t === 'tuple') fail('tupleHere', eq + 1);
      return { kind: 'func', name, v, ast };
    }
    if (!/^[A-Za-z_Ͱ-Ͽ][A-Za-z0-9_Ͱ-Ͽ]*$/.test(lhs)) fail('lhs', 0);
    if (lhs === 'y') { if (ast.t === 'tuple') fail('tupleHere', eq + 1); return { kind: 'func', name: null, v: 'x', ast }; }
    if (lhs === 'r') { if (ast.t === 'tuple') fail('tupleHere', eq + 1); return { kind: 'polar', name: null, v: 'θ', ast }; }
    if (lhs === 'x') {
      if (ast.t === 'tuple' || dependsOn(ast, 'x')) fail('vline', eq + 1);
      return { kind: 'vline', name: null, ast };
    }
    if (RESERVED.has(lhs)) fail('reserved', 0, lhs);
    return classifyRhs(lhs, ast);
  }
  function classifyRhs(name, ast) {
    if (ast.t === 'tuple') {
      if (ast.items.length !== 2) fail('tuple2', ast.p || 0);
      const isCurve = ast.items.some((c) => dependsOn(c, 't'));
      return { kind: isCurve ? 'curve' : 'point', name, v: isCurve ? 't' : null, x: ast.items[0], y: ast.items[1] };
    }
    if (dependsOn(ast, 'x')) return { kind: 'func', name, v: 'x', ast };
    if (dependsOn(ast, 'θ')) return { kind: 'polar', name, v: 'θ', ast };
    if (name) return { kind: 'param', name, ast };
    return { kind: 'calc', ast };
  }

  // ---------- Modèle complet (toutes les lignes) ----------
  // lines : textes ; renvoie items, paramètres manquants, fonctions évaluables
  function buildModel(lines) {
    const fnNames = fnNamesOf(lines);
    const items = lines.map((src, i) => {
      try { return Object.assign({ i, src }, parseLine(src, fnNames)); }
      catch (e) { if (e instanceof FormulaError) return { i, src, kind: 'error', error: e }; throw e; }
    });
    const P = {};
    const funcs = {};
    const derivCache = {};
    let depth = 0;
    const env = {
      P,
      call(name, d, v) {
        const f = funcs[name];
        if (!f) return NaN;
        if (++depth > 64) { depth--; return NaN; }
        try { return deriv(name, d)(v); } finally { depth--; }
      },
    };
    // Dérivée d'ordre d d'une fonction utilisateur : symbolique si possible, sinon différences finies
    function deriv(name, d) {
      const key = name + "'" + d;
      if (derivCache[key]) return derivCache[key].fn;
      const f = funcs[name];
      let entry;
      if (d === 0) entry = { fn: f.fn, ast: f.ast };
      else {
        const prev = deriv(name, d - 1), prevEntry = derivCache[name + "'" + (d - 1)];
        let ast = null;
        if (prevEntry.ast) { try { ast = simplify(diff(prevEntry.ast, f.v)); } catch (e) { if (!(e instanceof NoDiff)) throw e; } }
        if (ast) {
          const c = compile(ast, env), v = f.v;
          entry = { fn: (x) => c({ [v]: x }), ast };
        } else {
          entry = { fn: (x) => { const h = 1e-5 * (1 + Math.abs(x)); return (prev(x + h) - prev(x - h)) / (2 * h); }, ast: null };
        }
      }
      derivCache[key] = entry;
      return entry.fn;
    }
    // Noms définis : fonctions, paramètres ; doublons et cycles
    const defined = new Map();
    items.forEach((it) => {
      if (!it.name || it.kind === 'error') return;
      if (defined.has(it.name)) { it.kind = 'error'; it.error = new FormulaError('dup', 0, it.name); return; }
      defined.set(it.name, it);
    });
    const deps = (it) => {
      const set = new Set();
      const add = (n) => { freeVars(n).forEach((v) => set.add(v)); userCalls(n).forEach((v) => set.add(v)); };
      if (it.ast) add(it.ast);
      if (it.x) { add(it.x); add(it.y); }
      return set;
    };
    // cycles (f qui appelle f, a = b et b = a…)
    const state = new Map();
    function visit(name, stack) {
      const it = defined.get(name);
      if (!it || it.kind === 'error') return false;
      if (state.get(name) === 1) return true;
      if (state.get(name) === 2) return false;
      state.set(name, 1);
      let cyc = false;
      for (const d of deps(it)) if (defined.has(d) && d !== it.v && visit(d, stack)) cyc = true;
      state.set(name, 2);
      if (cyc) { it.kind = 'error'; it.error = new FormulaError('cycle', 0, name); }
      return cyc;
    }
    [...defined.keys()].forEach((n) => visit(n));
    // Paramètres manquants : noms libres jamais définis (hors variables de tracé)
    const missing = new Set();
    items.forEach((it) => {
      if (it.kind === 'error' || it.kind === 'empty') return;
      const bound = new Set(it.v ? [it.v] : []);
      const fv = new Set();
      if (it.ast) freeVars(it.ast, bound, fv);
      if (it.x) { freeVars(it.x, bound, fv); freeVars(it.y, bound, fv); }
      for (const v of fv) {
        if (defined.has(v) && defined.get(v).kind === 'param') continue;
        if (defined.has(v) && defined.get(v).kind !== 'error') { it.kind = 'error'; it.error = new FormulaError('fnAsVar', 0, v); break; }
        if (BOUND.includes(v)) { it.kind = 'error'; it.error = new FormulaError('unbound', 0, v); break; }
        if (!defined.has(v)) missing.add(v);
      }
    });
    // Compilation
    items.forEach((it) => {
      if (it.kind === 'error') return;
      try {
        if (it.kind === 'func' || it.kind === 'polar') {
          const c = compile(it.ast, env), v = it.v;
          it.fn = (x) => c({ [v]: x });
          if (it.name) funcs[it.name] = { fn: it.fn, ast: it.ast, v };
        } else if (it.kind === 'curve' || it.kind === 'point') {
          const cx = compile(it.x, env), cy = compile(it.y, env), v = it.v || 't';
          it.fx = (t) => cx({ [v]: t }); it.fy = (t) => cy({ [v]: t });
        } else if (it.kind === 'param' || it.kind === 'vline' || it.kind === 'calc') {
          const c = compile(it.ast, env);
          it.value = () => c({});
          it.isNumber = it.ast.t === 'num' || (it.ast.t === 'neg' && it.ast.a.t === 'num');
        }
      } catch (e) {
        if (e instanceof FormulaError) { it.kind = 'error'; it.error = e; } else throw e;
      }
    });
    // Ordre d'évaluation des paramètres (dépendances)
    const params = items.filter((it) => it.kind === 'param');
    function updateParams(values) {
      Object.keys(P).forEach((k) => delete P[k]);
      for (const k of missing) P[k] = values && k in values ? values[k] : 1;
      const done = new Set();
      const evalParam = (it) => {
        if (done.has(it.name)) return;
        done.add(it.name);
        deps(it).forEach((d) => { const o = defined.get(d); if (o && o.kind === 'param') evalParam(o); });
        P[it.name] = values && it.isNumber && it.name in values ? values[it.name] : it.value();
      };
      params.forEach(evalParam);
    }
    updateParams();
    const derivative = (it, d) => {
      if (it.name && funcs[it.name]) return deriv(it.name, d);
      // fonction anonyme (y = …) : on l'enregistre sous un nom interne
      const key = '#' + it.i;
      if (!funcs[key]) funcs[key] = { fn: it.fn, ast: it.ast, v: it.v };
      return deriv(key, d);
    };
    const derivativeText = (it, d) => {
      derivative(it, d);
      const key = (it.name && funcs[it.name] ? it.name : '#' + it.i) + "'" + d;
      const e = derivCache[key];
      return e && e.ast ? toStr(e.ast) : null;
    };
    return { items, missing: [...missing], P, updateParams, derivative, derivativeText, funcs };
  }

  // ---------- Analyse numérique ----------
  const finite = Number.isFinite;
  function bisect(f, a, b, fa) {
    for (let k = 0; k < 200; k++) {
      const m = (a + b) / 2;
      if (m <= a || m >= b) return m;
      const fm = f(m);
      if (fm === 0) return m;
      if ((fm < 0) === (fa < 0)) { a = m; fa = fm; } else b = m;
    }
    return (a + b) / 2;
  }
  function golden(g, a, b) {
    const r = (Math.sqrt(5) - 1) / 2;
    let c = b - r * (b - a), d = a + r * (b - a), gc = g(c), gd = g(d);
    for (let k = 0; k < 200 && b - a > 1e-15 * (1 + Math.abs(a)); k++) {
      if (gc < gd) { b = d; d = c; gd = gc; c = b - r * (b - a); gc = g(c); }
      else { a = c; c = d; gc = gd; d = a + r * (b - a); gd = g(d); }
    }
    return (a + b) / 2;
  }
  function sample(f, a, b, n) {
    const xs = new Array(n + 1), ys = new Array(n + 1);
    for (let i = 0; i <= n; i++) { xs[i] = a + ((b - a) * i) / n; ys[i] = f(xs[i]); }
    return { xs, ys };
  }
  function dedupe(list, eps) {
    list.sort((p, q) => p - q);
    const out = [];
    for (const x of list) if (!out.length || Math.abs(x - out[out.length - 1]) > eps) out.push(x);
    return out;
  }
  // Zéros de f sur [a, b] : changements de signe (dichotomie) + zéros doubles (minimum de |f| qui touche 0).
  // Les pôles (1/x, tan) sont écartés : |f| y reste grand.
  function zeros(f, a, b, opts = {}) {
    const n = opts.n || 2000, signOnly = !!opts.signOnly;
    const { xs, ys } = sample(f, a, b, n);
    let scale = 0, nZero = 0;
    for (const y of ys) { if (finite(y)) scale = Math.max(scale, Math.abs(y)); if (y === 0) nZero++; }
    if (nZero > n / 20) return [];
    const out = [];
    for (let i = 0; i < n; i++) {
      const ya = ys[i], yb = ys[i + 1];
      if (!finite(ya) || !finite(yb)) continue;
      if (ya === 0) { out.push(xs[i]); continue; }
      if (ya * yb < 0) {
        const r = bisect(f, xs[i], xs[i + 1], ya), fr = f(r);
        if (finite(fr) && Math.abs(fr) <= 1e-6 * (Math.abs(ya) + Math.abs(yb))) out.push(r);
      }
    }
    if (finite(ys[n]) && ys[n] === 0) out.push(xs[n]);
    if (!signOnly) {
      for (let i = 1; i < n; i++) {
        const y0 = ys[i - 1], y1 = ys[i], y2 = ys[i + 1];
        if (!finite(y0) || !finite(y1) || !finite(y2) || y1 === 0) continue;
        if (Math.abs(y1) <= Math.abs(y0) && Math.abs(y1) <= Math.abs(y2) && y0 * y1 > 0 && y1 * y2 > 0) {
          const m = golden((x) => Math.abs(f(x)), xs[i - 1], xs[i + 1]);
          if (Math.abs(f(m)) < 1e-9 * (1 + scale)) out.push(m);
        }
      }
    }
    return dedupe(out, ((b - a) / n) * 0.5);
  }
  // Extremums : la dérivée change de signe
  function extrema(f, df, a, b) {
    const n = 2000, h = ((b - a) / n) * 0.25;
    return zeros(df, a, b, { n, signOnly: true }).map((x) => {
      const l = df(x - h), r = df(x + h);
      return { x, y: f(x), type: l > 0 && r < 0 ? 'max' : l < 0 && r > 0 ? 'min' : null };
    }).filter((p) => p.type && finite(p.y));
  }
  function inflections(f, d2f, a, b) {
    return zeros(d2f, a, b, { signOnly: true }).map((x) => ({ x, y: f(x) })).filter((p) => finite(p.y));
  }
  function intersections(f, g, a, b) {
    return zeros((x) => f(x) - g(x), a, b).map((x) => ({ x, y: f(x) })).filter((p) => finite(p.y));
  }
  // Intégrale de Simpson adaptative
  function integral(f, a, b, eps = 1e-10) {
    if (a === b) return 0;
    if (a > b) return -integral(f, b, a, eps);
    let bad = false;
    const F = (x) => { const y = f(x); if (!finite(y)) bad = true; return y; };
    const simpson = (a, b, fa, fm, fb) => ((b - a) / 6) * (fa + 4 * fm + fb);
    function rec(a, b, fa, fm, fb, whole, eps, depth) {
      const m = (a + b) / 2, lm = (a + m) / 2, rm = (m + b) / 2;
      const flm = F(lm), frm = F(rm);
      const left = simpson(a, m, fa, flm, fm), right = simpson(m, b, fm, frm, fb);
      if (bad) return NaN;
      if (depth <= 0 || Math.abs(left + right - whole) <= 15 * eps) return left + right + (left + right - whole) / 15;
      return rec(a, m, fa, flm, fm, left, eps / 2, depth - 1) + rec(m, b, fm, frm, fb, right, eps / 2, depth - 1);
    }
    // découpage initial pour ne pas rater une oscillation
    const N = 64;
    let s = 0;
    for (let k = 0; k < N; k++) {
      const x0 = a + ((b - a) * k) / N, x1 = a + ((b - a) * (k + 1)) / N, xm = (x0 + x1) / 2;
      const f0 = F(x0), fm = F(xm), f1 = F(x1);
      s += rec(x0, x1, f0, fm, f1, simpson(x0, x1, f0, fm, f1), eps / N, 40);
      if (bad) return NaN;
    }
    return s;
  }
  // Aire géométrique : somme des |intégrales| entre zéros consécutifs
  function area(f, a, b) {
    if (a > b) [a, b] = [b, a];
    const z = zeros(f, a, b, { signOnly: true }).filter((x) => x > a && x < b);
    const pts = [a, ...z, b];
    let s = 0;
    for (let i = 0; i < pts.length - 1; i++) s += Math.abs(integral(f, pts[i], pts[i + 1]));
    return s;
  }

  // ---------- Graduations ----------
  function niceStep(range, target) {
    const raw = range / Math.max(1, target), mag = Math.pow(10, Math.floor(Math.log10(raw))), r = raw / mag;
    return (r < 1.5 ? 1 : r < 3.5 ? 2 : r < 7.5 ? 5 : 10) * mag;
  }
  // Pas en fractions de π : π/12, π/6, π/4, π/2, π, 2π…
  const PI_STEPS = [[1, 12], [1, 6], [1, 4], [1, 2], [1, 1], [2, 1], [5, 1], [10, 1], [20, 1], [50, 1]];
  function piStep(range, target) {
    const raw = range / Math.max(1, target);
    for (const [k, d] of PI_STEPS) if ((k / d) * Math.PI >= raw) return { step: (k / d) * Math.PI, k, d };
    return { step: niceStep(range / Math.PI, target) * Math.PI, k: niceStep(range / Math.PI, target), d: 1 };
  }
  function piLabel(i, k, d) {
    // valeur = i * k/d * π, réduite
    let p = i * k, q = d;
    const g = (a, b) => (b ? g(b, a % b) : Math.abs(a));
    const c = g(p, q) || 1; p /= c; q /= c;
    if (p === 0) return '0';
    const s = (p === 1 ? '' : p === -1 ? '-' : String(p)) + 'π';
    return q === 1 ? s : s + '/' + q;
  }

  return {
    FormulaError, tokenize, parse, parseLine, buildModel, diff, simplify, toStr, compile,
    freeVars, dependsOn, zeros, extrema, inflections, intersections, integral, area,
    niceStep, piStep, piLabel, F1, F2, CONSTS, fmtNum,
    evaluate(src, vars = {}) {
      const ast = parse(src, new Set());
      return compile(ast, { P: {}, call: () => NaN })(vars);
    },
    derivativeOf(src, v = 'x') { return simplify(diff(parse(src, new Set()), v)); },
  };
});
