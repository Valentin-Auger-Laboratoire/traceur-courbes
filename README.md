# Traceur de courbes

🇫🇷 [Français](#français) · 🇬🇧 [English](#english)

**Essayer l'outil :** https://valentin-auger-laboratoire.github.io/portfolio/outils/traceur-courbes/

---

## Français

### Ce que fait l'outil
Traceur de courbes dans le navigateur, en HTML / CSS / JavaScript pur : aucune bibliothèque, aucun serveur et aucun `eval`. Les formules sont lues par un analyseur écrit à la main.

**Ce qu'on peut tracer**
- Fonctions : `y = x^2 - 2`, ou une fonction nommée `f(x) = sin(x)/x`, réutilisable dans les autres lignes (`g(x) = f(x - 1)`).
- Dérivées d'une fonction nommée dans une formule : `f'(x)`, `f''(x)`.
- Courbes paramétrées `(cos(3t), sin(2t))` et polaires `r = 1 + cos(θ)`, avec l'intervalle de `t` ou de `θ` réglable.
- Points `A = (1, 2)` et droites verticales `x = 3`.
- Sommes : `sum(k, 1, n, sin(k x)/k)`.
- Une ligne sans `x` est un simple calcul : `2 + 3·4` affiche `= 14`.

**Écriture naturelle des formules**
- Produits implicites : `2x`, `3(x + 1)`, `(x + 1)(x - 1)`, `2pi`.
- Signes `·`, `×`, `−`, `²` acceptés.
- Fonctions : `sin cos tan asin acos atan sinh cosh tanh exp ln log sqrt cbrt abs floor ceil round sign min max mod`.

**Curseurs**
- Un nom inconnu devient un curseur (`a·sin(b·x)` crée `a` et `b`). Une ligne `a = 2` le fixe.
- Bornes et pas modifiables, bouton « Animer ».

**Analyse de la courbe choisie** (sur la partie visible)
- **Dérivée exacte**, calculée par dérivation symbolique puis simplifiée pour l'affichage (`sqrt(x^2 + 1)` donne `x/sqrt(x^2 + 1)`).
- Zéros, extremums (max / min), points d'inflexion, intersections avec les autres fonctions.
- Tangente en x₀, avec son équation.
- Intégrale de a à b, aire hachurée, et aire géométrique ∫|f| quand la courbe change de signe.
- Tableau de valeurs de f et f′.

**Graphique**
- Déplacement à la souris ou au doigt, zoom à la molette ou par pincement.
- Repère orthonormé ou libre, graduations en fractions de π.
- Coordonnées au survol, avec accrochage sur les points remarquables.
- Export **PNG** et **SVG** (vectoriel).
- Lien de partage : toute la figure est enregistrée dans l'adresse de la page.

**Exemples prêts**
- Charge d'un condensateur (RC), avec la tangente à l'origine qui donne τ.
- Série de Fourier d'un signal carré.
- Résonance d'un système du second ordre.
- Position du piston d'un système bielle-manivelle.
- Courbes paramétrées et polaires.
- Loi normale, avec l'aire à ±1σ.

### Comment ça marche
| Étape | Méthode |
|---|---|
| Lecture | découpage en jetons puis descente récursive (priorités : somme < produit < signe < puissance, associative à droite) ; arbre syntaxique |
| Calcul | l'arbre est compilé en fonctions JavaScript imbriquées (pas d'`eval`) |
| Dérivée | règles de dérivation symbolique (produit, quotient, puissance, fonctions composées, fonctions de l'utilisateur), puis simplification ; différences finies seulement pour `min`, `max` et `mod` |
| Zéros | changements de signe affinés par dichotomie, et zéros doubles (minimum de \|f\| qui touche 0) ; les pôles (1/x, tan x) sont écartés |
| Extremums, inflexions | zéros de f′ et de f″ avec changement de signe |
| Intégrale | méthode de Simpson adaptative |
| Tracé | un échantillon par fraction de pixel, coupure aux discontinuités et aux asymptotes |

### Fichiers
| Fichier | Rôle |
|---|---|
| `traceur.js` | Moteur : lecture, dérivation, simplification, analyse numérique (aucune dépendance au navigateur, testable avec Node) |
| `index.html` | Interface, bilingue FR / EN |
| `tests/test.js` | Tests du moteur |

### Lancer les tests
```bash
node tests/test.js
```
Environ 8 900 vérifications :
- calculs connus et messages d'erreur ;
- **dérivées symboliques de 20 formules comparées aux différences finies** en points tirés au hasard (f′ et f″) ;
- le texte affiché de chaque dérivée se relit et redonne la même valeur ;
- zéros (√2, zéro double, tan sans ses pôles, 1/x sans zéro) ;
- extremums, inflexions, intersections, pulsation de résonance √(1 − 1/2Q²) ;
- intégrales exactes (sin, x², exp, loi normale à ±1σ) ;
- série de Fourier.

### Limites
- Pas de courbes implicites (`x^2 + y^2 = 1`) ni d'inéquations. Pour un cercle, utiliser une courbe paramétrée.
- Pas de calcul formel au-delà de la dérivée : pas de primitive exacte, pas de résolution d'équation sous forme exacte. Zéros et intégrales sont des valeurs numériques.
- La recherche des points remarquables porte sur la partie visible. Deux zéros très proches (moins d'un échantillon d'écart) peuvent être confondus.
- Nombres décimaux avec un point (`2.5`), car la virgule sépare les arguments.

### Utiliser en local
Ouvrir `index.html` dans un navigateur. Rien n'est envoyé sur Internet.

---

## English

### What the tool does
Browser-based curve plotter in plain HTML / CSS / JavaScript: no library, no server and no `eval`. Formulas are read by a hand-written parser.

- **Plots** functions (`y = …` or named `f(x) = …`, reusable in other lines), their derivatives `f'(x)`, parametric curves `(x(t), y(t))`, polar curves `r = …(θ)`, points, vertical lines and sums `sum(k, 1, n, …)`. A line without `x` is a plain calculation.
- **Natural input**: implicit products (`2x`, `3(x + 1)`, `2pi`), `·`, `×`, `−`, `²`, and the usual functions.
- **Sliders**: an unknown name becomes a slider; `a = 2` sets it. Bounds, step and animation are adjustable.
- **Analysis** of the selected curve in the visible range: **exact derivative** (symbolic differentiation, simplified for display), zeros, extrema, inflection points, intersections, tangent at x₀, integral from a to b with shaded area, and a table of values.
- **Graph**: pan, wheel or pinch zoom, equal axes, π ticks, hover readout, **PNG** and **SVG** export, and a share link that stores the whole figure in the page address.
- **Examples**: RC charging, Fourier series of a square wave, second-order resonance, slider-crank piston position, parametric and polar curves, normal distribution.

### Tests
```bash
node tests/test.js
```
About 8,900 checks:
- known values and error messages;
- **symbolic derivatives of 20 formulas compared with finite differences** at random points (f′ and f″);
- each displayed derivative reads back to the same value;
- zeros (including a double zero, and no false zeros at the poles of tan and 1/x);
- extrema, inflections, intersections, resonance frequency;
- exact integrals and a Fourier series.

### Limits
- No implicit curves or inequalities.
- No symbolic computation beyond the derivative: zeros and integrals are numerical.
- Special points are searched in the visible range only.
- Decimal point is `.`, because the comma separates arguments.

---

← [Portfolio](https://valentin-auger-laboratoire.github.io/portfolio/#projets)
