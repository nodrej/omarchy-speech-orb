.pragma library

// Dot geometry for every pattern.
//
// create(pattern, N) lays out N dots once; frame(st, p, out) moves them for one
// frame and writes screen-space results into `out`. Nothing here touches a
// Canvas, so the renderer stays one bucketing loop and every pattern shares
// the same depth shading, outline and color handling.
//
// Coordinates are in orb units: x/y in roughly -1..1, y up, z toward the
// viewer. The renderer maps them to pixels.
//
// Volume arrives as p.LF, a small array of level per radial bin. With ripple
// off every bin holds the live level; with ripple on, bin r holds the level as
// it was r/(bins-1) * ripple ms ago, so loudness leaves the core and travels
// outward. Patterns look a dot's bin up from its *live* distance from the
// centre. Keying on a rest radius instead makes dots on elliptical paths answer
// late while sitting in the middle, which smears the wave away.

var LUT_SIZE = 4096
var LUT_MASK = 4095
var LUT_SCALE = 4096 / (Math.PI * 2)
var QUARTER = 1024

// The inner loops need many sines per dot per frame; a power-of-two table
// indexed by a masked integer is several times cheaper than Math.sin.
var SIN = (function() {
  var t = new Float32Array(LUT_SIZE)
  for (var k = 0; k < LUT_SIZE; k++) t[k] = Math.sin(k * Math.PI * 2 / LUT_SIZE)
  return t
})()

function sn(x) { return SIN[(x * LUT_SCALE) & LUT_MASK] }
function cs(x) { return SIN[((x * LUT_SCALE) + QUARTER) & LUT_MASK] }

var KNEE = 0.78

var names = ["nebula", "sphere", "ring", "vortex", "burst", "swarm", "logo"]

// The square Omarchy logo, read cell by cell off the 300x300 app icon
// (/usr/share/pixmaps/omarchy.png): every 20 px cell of it is uniformly inside
// or outside the mark, so this 15x15 grid is exact, not a tracing. Row 0 is
// the top. The mark is the icon's painted area -- the outer frame and inner
// bracket around a hollow centre; the transparent area is its negative.
var LOGO = [
  "###############",
  "#......#......#",
  "#.######...##.#",
  "#.#.........#.#",
  "#.#.........#.#",
  "#.#.........#.#",
  "#.#.........#.#",
  "###.........#.#",
  "#.#.........#.#",
  "#.#.........#.#",
  "#.#.........#.#",
  "#.#.........#.#",
  "#.###########.#",
  "#......#......#",
  "########.######"
]

// Seeded so a pattern looks the same every time it appears, and so tests are
// deterministic. mulberry32.
function rng(seed) {
  var a = seed >>> 0
  return function() {
    a = (a + 0x6D2B79F5) >>> 0
    var t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function gauss(r) {
  return (r() + r() + r() - 1.5) * 1.15
}

function newOut(N) {
  return {
    n: 0,
    x: new Float32Array(N), y: new Float32Array(N),
    s: new Float32Array(N), a: new Float32Array(N), c: new Float32Array(N)
  }
}

// Shared per-dot traits: how hard it answers the level, its base size, and
// which of three ways it answers -- 0 moves, 1 grows, 2 brightens. Mixing the
// three is what keeps a loud orb from looking like a uniformly scaled one.
function traits(st, r) {
  var N = st.N
  st.answer = new Float32Array(N)
  st.dot = new Float32Array(N)
  st.mode = new Uint8Array(N)
  for (var i = 0; i < N; i++) {
    st.answer[i] = 0.35 + r() * 1.25
    st.dot[i] = r() < 0.14 ? 2.0 + r() * 1.5 : 1.0 + r() * 0.7
    var m = r()
    st.mode[i] = m < 0.42 ? 0 : (m < 0.72 ? 1 : 2)
  }
}

function create(pattern, N) {
  if (names.indexOf(pattern) < 0) pattern = "nebula"
  var st = { pattern: pattern, N: N }
  var r = rng(0x5eed + names.indexOf(pattern) * 7919)
  traits(st, r)
  var i
  var A = function() { return new Float32Array(N) }

  if (pattern === "nebula") {
    st.semiA = A(); st.semiB = A(); st.ci = A(); st.si = A(); st.cn = A(); st.sn = A()
    st.omega = A(); st.th0 = A()
    // Four loose preferred planes, widely jittered: fully isotropic
    // inclinations give an undifferentiated puffball, bands give streams.
    var bands = [[0.30, 0.0], [1.05, 2.1], [1.85, 4.0], [2.55, 5.4]]
    for (i = 0; i < N; i++) {
      // Radii spread continuously and thin toward the edge, so the cloud
      // has no silhouette and never reads as a ball.
      var a = 0.14 + 0.86 * Math.sqrt(r())
      st.semiA[i] = a
      st.semiB[i] = a * (0.55 + r() * 0.45)
      var band = bands[(r() * 4) | 0]
      var inc = band[0] + (r() - 0.5) * 0.95
      var node = band[1] + (r() - 0.5) * 1.5
      st.ci[i] = Math.cos(inc); st.si[i] = Math.sin(inc)
      st.cn[i] = Math.cos(node); st.sn[i] = Math.sin(node)
      // Inner dots sweep faster; a minority run retrograde, which makes the
      // cloud shear and swirl rather than turn as one rigid body.
      var w = 0.45 / Math.sqrt(a + 0.05)
      st.omega[i] = (r() < 0.30 ? -1 : 1) * w * (0.7 + r() * 0.6)
      st.th0[i] = r() * Math.PI * 2
    }
  } else if (pattern === "sphere") {
    st.nx = A(); st.ny = A(); st.nz = A()
    var golden = Math.PI * (3 - Math.sqrt(5))
    for (i = 0; i < N; i++) {
      var yv = 1 - 2 * (i + 0.5) / N
      var rr = Math.sqrt(1 - yv * yv)
      var phi = i * golden
      st.nx[i] = Math.cos(phi) * rr; st.ny[i] = yv; st.nz[i] = Math.sin(phi) * rr
    }
  } else if (pattern === "ring") {
    st.ang = A(); st.v = A(); st.side = A()
    for (i = 0; i < N; i++) {
      st.ang[i] = r() * Math.PI           // 0 = top (newest) .. PI = bottom (oldest)
      st.side[i] = r() < 0.5 ? -1 : 1     // mirrored left/right
      // Most dots fill the band either side of the baseline; one in six
      // hold the baseline itself so the ring stays legible in silence.
      st.v[i] = r() < 0.16 ? (r() - 0.5) * 0.15 : (r() * 2 - 1)
    }
  } else if (pattern === "vortex") {
    st.rad = A(); st.ang0 = A(); st.z0 = A(); st.core = new Uint8Array(N)
    var arms = 3
    for (i = 0; i < N; i++) {
      if (r() < 0.12) {
        // A small spherical core, so the middle has body when viewed flat.
        st.core[i] = 1
        st.rad[i] = 0.02 + 0.16 * Math.sqrt(r())
        st.ang0[i] = r() * Math.PI * 2
        st.z0[i] = gauss(r) * 0.10
        continue
      }
      var rv = 0.10 + 0.90 * Math.sqrt(r())
      var arm = (r() * arms) | 0
      st.rad[i] = rv
      st.ang0[i] = arm * Math.PI * 2 / arms + rv * 3.4 + gauss(r) * 0.32 * (1.15 - rv * 0.5)
      st.z0[i] = gauss(r) * 0.05 * (1.1 - rv)
    }
  } else if (pattern === "burst") {
    var rays = Math.max(24, Math.min(160, Math.round(N / 30)))
    st.rays = rays
    st.rdx = new Float32Array(rays); st.rdy = new Float32Array(rays); st.rdz = new Float32Array(rays)
    st.rgain = new Float32Array(rays); st.rph = new Float32Array(rays)
    var g2 = Math.PI * (3 - Math.sqrt(5))
    for (var k = 0; k < rays; k++) {
      var y2 = 1 - 2 * (k + 0.5) / rays
      var r2 = Math.sqrt(1 - y2 * y2)
      st.rdx[k] = Math.cos(k * g2) * r2; st.rdy[k] = y2; st.rdz[k] = Math.sin(k * g2) * r2
      st.rgain[k] = 0.45 + r() * 1.0
      st.rph[k] = r() * Math.PI * 2
    }
    st.ray = new Uint16Array(N); st.f = A(); st.jx = A(); st.jy = A(); st.jz = A()
    for (i = 0; i < N; i++) {
      st.ray[i] = (r() * rays) | 0
      st.f[i] = Math.pow(r(), 0.8)
      st.jx[i] = (r() - 0.5) * 0.05; st.jy[i] = (r() - 0.5) * 0.05; st.jz[i] = (r() - 0.5) * 0.05
    }
  } else if (pattern === "logo") {
    // Every filled cell of the logo, then dots spread evenly across them with
    // a random position inside the cell, so the mark reads as solid shapes
    // made of dots rather than as a grid.
    var cells = []
    for (var gy = 0; gy < LOGO.length; gy++)
      for (var gx = 0; gx < LOGO[gy].length; gx++)
        if (LOGO[gy].charAt(gx) === "#") cells.push(gx, gy)
    var G = LOGO.length, span = 1.62, cell = span / G
    st.lx = A(); st.ly = A(); st.lz = A(); st.dx = A(); st.dy = A()
    for (i = 0; i < N; i++) {
      var c = ((r() * cells.length / 2) | 0) * 2
      st.lx[i] = -span / 2 + (cells[c] + r()) * cell
      st.ly[i] = span / 2 - (cells[c + 1] + r()) * cell
      st.lz[i] = (r() - 0.5) * 0.08
      // A private direction to scatter along when loud, so the logo
      // sparkles apart instead of only scaling up as a block.
      var ang = r() * Math.PI * 2
      st.dx[i] = Math.cos(ang); st.dy[i] = Math.sin(ang)
    }
  } else if (pattern === "swarm") {
    st.fx = A(); st.fy = A(); st.fz = A(); st.px = A(); st.py = A(); st.pz = A(); st.amp = A()
    for (i = 0; i < N; i++) {
      st.fx[i] = 0.3 + r(); st.fy[i] = 0.3 + r(); st.fz[i] = 0.3 + r()
      st.px[i] = r() * 6.283; st.py[i] = r() * 6.283; st.pz[i] = r() * 6.283
      st.amp[i] = 0.35 + 0.65 * Math.sqrt(r())
    }
  }
  return st
}

// Writes one visible dot. z is -1 (back) .. 1 (front). The steep depth curve
// is what gives a flat scatter of dots its volume: the near side reads bright
// and the far side nearly vanishes.
function emit(p, out, x, y, z, size, bright, rad, push) {
  // Soft radial limit. Loud speech at high movement throws dots well past the
  // canvas, where they used to be clipped into a hard square edge. Past KNEE
  // the distance is compressed so it approaches 1 but never reaches it, which
  // keeps the silhouette round at any setting.
  // The logo is limited by its square instead, or its corners would round.
  var len = p.squareLimit ? Math.max(Math.abs(x), Math.abs(y)) : Math.sqrt(x * x + y * y)
  if (len > KNEE) {
    var over = (len - KNEE) / (1 - KNEE)
    var k = (KNEE + (1 - KNEE) * (over / (1 + over))) / len
    x *= k; y *= k
  }
  var d = z * 0.5 + 0.5
  if (d < 0) d = 0; else if (d > 1) d = 1
  var dp = d * d * (3 - 2 * d)
  var a = (0.05 + 0.95 * dp) * 0.55 * bright * p.alpha
  if (a <= 0.02) return
  if (a > 1) a = 1
  var s = size * p.dotScale * (0.62 + 0.62 * d)
  var o = out.n++
  out.x[o] = x; out.y[o] = y; out.s[o] = s; out.a[o] = a
  // Color position 0..1, meaning depends on the color mode.
  var c = 0
  if (p.colorKind === 1) c = rad
  else if (p.colorKind === 2) c = push
  else if (p.colorKind === 3) c = Math.atan2(y, x) / 6.2832 + 0.5
  out.c[o] = c < 0 ? 0 : (c > 1 ? 1 : c)
}

function bin(p, rad) {
  var q = (rad * p.RBm1) | 0
  return q > p.RBm1 ? p.RBm1 : (q < 0 ? 0 : q)
}

// Whole-object spin about Y, then a slow shared tilt about X. Written into
// p.rx/ry/rz rather than returned, to keep allocation out of the inner loop.
function view(p, x, y, z) {
  var x3 = x * p.cg + z * p.sg
  var z3 = z * p.cg - x * p.sg
  p.rx = x3
  p.ry = y * p.ct - z3 * p.st
  p.rz = y * p.st + z3 * p.ct
}

// p (per frame): t, spin, swarm, vortex (phases), turb, move, grow, glow,
// alpha, dotScale, colorKind, LF, RBm1, hist, histHead, histSize, histDt
function frame(st, p, out) {
  out.n = 0
  p.cg = Math.cos(p.spin); p.sg = Math.sin(p.spin)
  var ta = Math.sin(p.t * 0.17) * 0.40 + 0.30
  p.st = Math.sin(ta); p.ct = Math.cos(ta)
  p.squareLimit = st.pattern === "logo"
  switch (st.pattern) {
  case "sphere": sphere(st, p, out); break
  case "ring": ring(st, p, out); break
  case "vortex": vortex(st, p, out); break
  case "burst": burst(st, p, out); break
  case "swarm": swarm(st, p, out); break
  case "logo": logo(st, p, out); break
  default: nebula(st, p, out)
  }
  return out
}

function nebula(st, p, out) {
  var N = st.N, t = p.t, LF = p.LF
  var S = SIN, K = LUT_SCALE, M = LUT_MASK, Q = QUARTER
  // Fractal turbulence: three octaves at doubling frequency and halving
  // amplitude, each axis driven by a different axis of the position. The
  // cross-coupling is what makes the field swirl into eddies rather than
  // wobble. This is ambient flow; volume is expressed radially, not here.
  var turb = (0.055 + p.level * 0.05) * p.turb
  var F1 = 2.1, F2 = 4.3, F3 = 8.7
  var mg = 0.78 * p.move, zg = 1.25 * p.grow, bg = 1.85 * p.glow
  var R = 0.86

  for (var i = 0; i < N; i++) {
    var m = st.mode[i]
    var th = (st.th0[i] + st.omega[i] * t) * K
    var ax = st.semiA[i] * S[(th + Q) & M]
    var ay = st.semiB[i] * S[th & M]
    // Rotations preserve length, so the in-plane distance is already the
    // dot's true distance from the centre.
    var rad = Math.sqrt(ax * ax + ay * ay)
    var push = LF[bin(p, rad)] * st.answer[i]

    var kick = m === 0 ? 1 + push * mg : 1
    var x0 = ax * kick, y0 = ay * kick
    var y1 = y0 * st.ci[i], z1 = y0 * st.si[i]
    var x2 = x0 * st.cn[i] - y1 * st.sn[i]
    var y2 = x0 * st.sn[i] + y1 * st.cn[i]

    if (turb > 0) {
      x2 += turb * (S[(y2 * F1 + t * 0.9) * K & M] + 0.5 * S[(y2 * F2 - t * 1.7) * K & M]
                    + 0.25 * S[(y2 * F3 + t * 3.1) * K & M]) * 0.5714
      y2 += turb * (S[(z1 * F1 - t * 1.1) * K & M] + 0.5 * S[(z1 * F2 + t * 2.0) * K & M]
                    + 0.25 * S[(z1 * F3 - t * 3.6) * K & M]) * 0.5714
      z1 += turb * (S[(x2 * F1 + t * 1.3) * K & M] + 0.5 * S[(x2 * F2 - t * 2.3) * K & M]
                    + 0.25 * S[(x2 * F3 + t * 4.1) * K & M]) * 0.5714
    }
    view(p, x2, y2, z1)
    var size = st.dot[i] * (m === 1 ? 1 + push * zg : 1)
    var bright = m === 2 ? 1 + push * bg : 1
    emit(p, out, p.rx * R, p.ry * R, p.rz, size, bright, rad, push)
  }
}

function sphere(st, p, out) {
  var N = st.N, t = p.t, LF = p.LF, turb = p.turb
  var base = 0.60
  for (var i = 0; i < N; i++) {
    var nx = st.nx[i], ny = st.ny[i], nz = st.nz[i], m = st.mode[i]
    // With ripple on, the wave sweeps pole to pole rather than outward --
    // every point on a shell is the same distance from the centre.
    var push = LF[bin(p, (1 - ny) * 0.5)] * st.answer[i]
    var wob = turb * 0.07 * (sn(ny * 3.1 + t * 0.7) + 0.5 * sn(nx * 5.3 - t * 1.1)
                             + 0.25 * sn(nz * 9.7 + t * 1.9))
    var rr = base * (1 + wob + (m === 0 ? push * 0.42 : push * 0.12) * p.move)
    view(p, nx * rr, ny * rr, nz * rr)
    var size = st.dot[i] * (m === 1 ? 1 + push * 1.25 * p.grow : 1)
    var bright = (m === 2 ? 1 + push * 1.85 * p.glow : 1) * 1.15
    emit(p, out, p.rx, p.ry, p.rz / base, size, bright, rr / (base * 1.6), push)
  }
}

// A waveform wrapped into a circle, mirrored left and right: the top of the
// ring is this instant, and older audio runs down both sides to the bottom.
// The whole ring also breathes with the live level so it answers immediately
// even though most of its outline is history.
function ring(st, p, out) {
  var N = st.N, t = p.t
  var H = p.hist, HS = p.histSize, HH = p.histHead
  var windowSteps = (1.1 / p.histDt) | 0
  var base = 0.56 * (1 + p.level * 0.08 * p.move)
  var amp = 0.30 * p.move
  for (var i = 0; i < N; i++) {
    var ang = st.ang[i]
    var back = ((ang / Math.PI) * windowSteps) | 0
    var idx = HH - back
    if (idx < 0) idx += HS
    var l = H[idx]
    var v = st.v[i]
    var jit = p.turb * 0.012 * sn(i * 1.7 + t * 2.3)
    var rr = base + v * (0.02 + l * amp * st.answer[i] * 0.8) + jit
    var x = st.side[i] * Math.sin(ang) * rr
    var y = Math.cos(ang) * rr
    var av = v < 0 ? -v : v
    var size = (0.8 + st.dot[i] * 0.4) * (1 + l * 0.35 * p.grow)
    var bright = (1.35 - av * 0.55) * (1 + l * 1.2 * p.glow)
    emit(p, out, x, y, 0.55, size, bright, av, l)
  }
}

function vortex(st, p, out) {
  var N = st.N, t = p.t, LF = p.LF, ph = p.vortex
  var tilt = 0.85 + Math.sin(t * 0.21) * 0.12
  var ct = Math.cos(tilt), stl = Math.sin(tilt)
  for (var i = 0; i < N; i++) {
    var rad = st.rad[i], m = st.mode[i]
    var push = LF[bin(p, rad)] * st.answer[i]
    // Slight differential rotation: inner dots lap the outer ones, which
    // keeps the arms alive without winding them up into a disc.
    var a = st.ang0[i] + ph * (1 + 0.18 / (rad + 0.2))
    var rr = rad * (1 + (m === 0 ? push * 0.32 : push * 0.08) * p.move)
    var x = Math.cos(a) * rr
    var yd = Math.sin(a) * rr
    var z = st.z0[i] * (1 + push * 3 * p.move) + p.turb * 0.02 * sn(rad * 9 + t * 1.3 + i)
    // Disc plane -> view: tip the disc toward the viewer about X.
    var y = yd * ct - z * stl
    var zz = yd * stl + z * ct
    var size = st.dot[i] * (m === 1 ? 1 + push * 1.25 * p.grow : 1)
    var bright = (m === 2 ? 1 + push * 1.85 * p.glow : 1) * (st.core[i] ? 1.4 : 1.1)
    emit(p, out, x * 0.9, y * 0.9, zz * 1.4, size, bright, rad, push)
  }
}

function burst(st, p, out) {
  var N = st.N, t = p.t, LF = p.LF
  var live = LF[0]
  for (var i = 0; i < N; i++) {
    var k = st.ray[i], f = st.f[i], m = st.mode[i]
    // Each ray flickers on its own phase, so a steady tone still reads as a
    // spectrum of lengths rather than a uniformly scaled ball.
    var flick = 0.6 + 0.4 * sn(t * 6.5 + st.rph[k])
    var pushR = live * st.rgain[k] * flick
    var len = 0.16 + pushR * 0.72 * p.move
    var rr = 0.08 + f * len
    var push = LF[bin(p, f)] * st.answer[i]
    var jt = p.turb
    var x = st.rdx[k] * rr + st.jx[i] * jt
    var y = st.rdy[k] * rr + st.jy[i] * jt
    var z = st.rdz[k] * rr + st.jz[i] * jt
    view(p, x, y, z)
    var size = st.dot[i] * (m === 1 ? 1 + push * 1.25 * p.grow : 1) * (1.2 - f * 0.5)
    var bright = (m === 2 ? 1 + push * 1.85 * p.glow : 1) * (1.3 - f * 0.7)
    emit(p, out, p.rx, p.ry, p.rz / Math.max(0.2, rr), size, bright, f, push)
  }
}

function swarm(st, p, out) {
  var N = st.N, tt = p.swarm, LF = p.LF, t = p.t
  for (var i = 0; i < N; i++) {
    var A = st.amp[i], m = st.mode[i]
    var x = sn(st.fx[i] * tt + st.px[i])
    var y = sn(st.fy[i] * tt + st.py[i])
    var z = sn(st.fz[i] * tt + st.pz[i])
    // Lissajous paths fill a cube; pushing each point onto its own sphere
    // keeps the wandering but gives the swarm a round silhouette.
    var len = Math.sqrt(x * x + y * y + z * z) + 1e-3
    var k = A / len
    x *= k; y *= k; z *= k
    var rad = A
    var push = LF[bin(p, rad)] * st.answer[i]
    var sc = 0.62 * (1 + (m === 0 ? push * 0.55 : push * 0.15) * p.move)
    var tj = p.turb * 0.03
    x = x * sc + tj * sn(y * 7 + t * 1.9)
    y = y * sc + tj * sn(z * 7 - t * 2.1)
    z = z * sc
    view(p, x, y, z)
    var size = st.dot[i] * (m === 1 ? 1 + push * 1.25 * p.grow : 1)
    var bright = (m === 2 ? 1 + push * 1.85 * p.glow : 1) * 1.1
    emit(p, out, p.rx, p.ry, p.rz / 0.62, size, bright, rad, push)
  }
}

// The square Omarchy logo. It sways rather than spins -- a flat mark turned
// edge-on would vanish -- and speaking pushes its pieces out from the centre,
// so the gaps in the frame open up and the logo breathes apart with your
// voice, while each dot also sparkles off along its own direction.
function logo(st, p, out) {
  var N = st.N, t = p.t, LF = p.LF
  var sway = Math.sin(p.spin * 2.2) * 0.38
  var cy = Math.cos(sway), sy = Math.sin(sway)
  var tilt = Math.sin(t * 0.23) * 0.10
  var ct = Math.cos(tilt), stl = Math.sin(tilt)
  var jit = p.turb * 0.010
  for (var i = 0; i < N; i++) {
    var x = st.lx[i], y = st.ly[i], m = st.mode[i]
    var rad = Math.sqrt(x * x + y * y) / 1.15
    var push = LF[bin(p, rad)] * st.answer[i]
    var grow = 1 + (m === 0 ? push * 0.22 : push * 0.06) * p.move
    var spark = (m === 0 ? push * 0.07 : push * 0.02) * p.move
    x = x * grow + st.dx[i] * spark + jit * sn(i * 1.3 + t * 2.1)
    y = y * grow + st.dy[i] * spark + jit * sn(i * 0.7 - t * 1.7)
    var z = st.lz[i]
    // Sway about Y, then a slight nod about X.
    var x2 = x * cy + z * sy
    var z2 = z * cy - x * sy
    var y2 = y * ct - z2 * stl
    var z3 = y * stl + z2 * ct
    var size = st.dot[i] * 0.85 * (m === 1 ? 1 + push * 1.1 * p.grow : 1)
    var bright = (m === 2 ? 1 + push * 1.6 * p.glow : 1) * 1.25
    emit(p, out, x2 * 0.92, y2 * 0.92, 0.45 + z3 * 1.5, size, bright, rad > 1 ? 1 : rad, push)
  }
}
