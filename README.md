# Physics Visual Experience

A virtual physics laboratory for the browser. The goal is simple: when you open an
experiment, it should feel like you are standing at the bench — with the apparatus in
front of you, the beam switched on, and the data coming in live. Nothing is a video or
a canned animation. Every particle is computed in real time from the actual physics.

## Live experiments

| # | Experiment | Chapter | Link |
|---|------------|---------|------|
| 01 | Rutherford's Gold Foil Experiment | Modern Physics · Atomic Structure | [`experiments/gold-foil.html`](experiments/gold-foil.html) |
| 02 | Boolean Algebra & Logic Gates | Electronics · Logic Gates | [`experiments/boolean-algebra.html`](experiments/boolean-algebra.html) |

More chapters (projectile motion, interference & diffraction, electromagnetic induction,
photoelectric effect, simple harmonic motion) are listed on the home page as "in development".

### Boolean algebra lab

The logic lab has three live parts:

- **Gate bench** — the seven basic gates (NOT, AND, OR, NAND, NOR, XOR, XNOR) driven by three
  shared input switches, each with a live output LED and truth table.
- **Expression lab** — type any Boolean expression in A–D (operators `·` `+` `¬` `^`, plus `AND`
  `OR` `NOT` `XOR`, postfix `'`, and parentheses). The lab parses it, builds the truth table and
  Karnaugh map, and simplifies it to a minimal sum-of-products with the Quine–McCluskey method.
- **Law verifier** — proofs of the standard identities (including both De Morgan theorems) shown
  row by row, with both sides of each identity checked against every input combination.

## What makes it feel like a real lab

- **Real apparatus** — radium source, lead collimator, gold foil and a fluorescent (ZnS)
  screen, laid out the way they sat on the bench in the Geiger–Marsden experiment.
- **Real physics, not playback** — each α-particle is scattered using the Coulomb force.
  The angles you see are computed, not drawn.
- **Live data** — a live counter, an angle-resolved detector you can swing around the foil,
  and a scattering-angle histogram that fills as particles are recorded.
- **Guided observation** — an observation log notes the remarkable events as they happen,
  and the page closes with the conclusion Rutherford was forced to reach.

## The physics

An α-particle (charge +2e) approaching a gold nucleus (charge +Ze) feels the Coulomb
repulsion

```
F = k·q₁q₂ / r²
```

With the collision radius  r₀′ = k·(2e)(Ze) / (2E),  the scattering angle obeys the exact
Rutherford relation

```
tan(θ/2) = r₀′ / b                    (b = impact parameter)
```

and the total cross-section for scattering beyond angle θ is

```
σ(>θ) = π·r₀′²·cot²(θ/2)
```

The probability that one α-particle is deflected past θ while crossing the foil is
`σ(>θ) · n · t`, where `n` is the number density of atoms and `t` the foil thickness.
The differential cross-section follows the famous law

```
dσ/dΩ ∝ 1 / sin⁴(θ/2)
```

which the on-screen histogram reproduces.

For the microscopic (single-nucleus) view, trajectories are integrated with RK4 in the
dimensionless system where length is measured in r₀′ and speed in units of the incoming
speed v₀. There the equation of motion reduces to `d²x/dτ² = x̂ / x²`, which reproduces
`tan(θ/2) = r₀′/b` — verified numerically against the analytic result.

## Controls in the gold-foil lab

- **Foil material** — gold (Z=79), silver (47), copper (29) or aluminium (13)
- **α-particle energy** — 4 to 8 MeV
- **Foil thickness** — 0.1 to 3 µm
- **Beam intensity** — 10³ to 10⁶ α-particles per second
- **Detector angle** — swing the screen around the foil
- **Display toggles** — particle tracks, impact-parameter marker, single-nucleus zoom,
  log-scale histogram, pause
- **Fire one α** — a single deliberately close encounter, tracked slowly

## Run it locally

No build step and no dependencies. Just open `index.html` in a browser, or serve the
folder:

```bash
python3 -m http.server 8000
# then visit http://localhost:8000/
```

## Structure

```
index.html                        landing page + chapter index
experiments/gold-foil.html        Rutherford gold foil experiment
experiments/boolean-algebra.html  Boolean algebra & logic gates lab
assets/css/style.css              shared design system
assets/js/site.js                 small shared helpers
assets/js/gold-foil.js            gold-foil simulation engine
assets/js/boolean.js              Boolean parser, truth tables, Quine-McCluskey, K-map
```

## Hosting

The site is a set of static files and is served directly by GitHub Pages from the
`main` branch (root folder).
