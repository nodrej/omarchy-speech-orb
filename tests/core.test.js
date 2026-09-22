// Unit tests for the QML-free core. Run: node --test tests/
//
// The libraries are QML JavaScript (`.pragma library`), so they are loaded
// into a vm context with that line stripped rather than require()d.
const test = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const vm = require("node:vm")

function load(name) {
  const src = fs.readFileSync(path.join(__dirname, "..", name), "utf8").replace(/^\.pragma library\s*$/m, "")
  const ctx = { Math, Float32Array, Uint8Array, Uint16Array, Int32Array, Uint32Array, JSON, isFinite, Number, String }
  vm.createContext(ctx)
  vm.runInContext(src, ctx)
  return ctx
}

const Settings = load("Settings.js")
const Level = load("Level.js")
const Patterns = load("Patterns.js")

test("defaults cover every schema key and resolve round-trips", () => {
  const d = Settings.defaults()
  for (const f of Settings.schema) assert.ok(f.key in d, f.key)
  assert.deepEqual(JSON.parse(JSON.stringify(Settings.resolve({}))), JSON.parse(JSON.stringify(d)))
})

test("resolve clamps, drops junk, and keeps good values", () => {
  const s = Settings.resolve({
    id: "io.github.nodrej.speech-orb",
    size: 99999, movement: "1.5", pattern: "nope", colorMode: "rainbow",
    color: "#ABCDEF", color2: "red", autoGain: "false", bogus: 1
  })
  assert.equal(s.size, 800)
  assert.equal(s.movement, 1.5)
  assert.equal(s.pattern, "nebula")
  assert.equal(s.colorMode, "rainbow")
  assert.equal(s.color, "#abcdef")
  assert.equal(s.color2, "#c77dff")
  assert.equal(s.autoGain, false)
  assert.ok(!("bogus" in s))
})

test("diff saves only non-defaults", () => {
  const s = Settings.defaults()
  s.movement = 2
  s.transcribingColor = ""
  assert.deepEqual(JSON.parse(JSON.stringify(Settings.diff(s))), { movement: 2 })
})

test("every preset is valid and is recognized after applying", () => {
  for (const p of Settings.presets) {
    for (const k of Object.keys(p.values)) {
      const f = Settings.field(k)
      assert.ok(f, `${p.id}: unknown key ${k}`)
      assert.equal(Settings.coerce(f, p.values[k]), p.values[k], `${p.id}.${k} out of range`)
    }
    const s = Settings.applyPreset(Settings.defaults(), p.id)
    assert.equal(Settings.matchingPreset(s), p.id)
  }
})

test("presets keep placement and mic", () => {
  const base = Settings.resolve({ position: "top-left", micNode: "alsa_input.x", size: 200 })
  const s = Settings.applyPreset(base, "party")
  assert.equal(s.position, "top-left")
  assert.equal(s.micNode, "alsa_input.x")
  assert.equal(s.size, 200)
})

test("normalize maps dB range to 0..1 and respects sensitivity", () => {
  assert.equal(Level.normalize(-60, -50, -12, 1), 0)
  assert.equal(Level.normalize(-5, -50, -12, 1), 1)
  const mid = Level.normalize(-31, -50, -12, 1)
  assert.ok(mid > 0.5 && mid < 0.8, `mid ${mid}`)   // expansion lifts the middle
  assert.ok(Level.normalize(-31, -50, -12, 2) > mid)
  assert.equal(Level.toDb(0), Level.SILENT_DB)
  assert.ok(Math.abs(Level.toDb(0.1) + 20) < 1e-9)
})

test("smooth: attack 0 snaps up the same frame, release eases down", () => {
  assert.equal(Level.smooth(0, 1, 0.016, 0, 140), 1)
  const down = Level.smooth(1, 0, 0.016, 0, 140)
  assert.ok(down > 0.8 && down < 1, `down ${down}`)
  const slowAttack = Level.smooth(0, 1, 0.016, 30, 140)
  assert.ok(slowAttack > 0.3 && slowAttack < 0.5, `attack30 ${slowAttack}`)
})

test("auto gain learns a quiet room and a speaking level", () => {
  const ag = Level.newAutoGain()
  // 3 s of room noise around -70 dBFS.
  for (let i = 0; i < 140; i++) Level.updateAutoGain(ag, -70 + Math.sin(i) * 2, 0.021)
  const quiet = Level.autoRange(ag)
  assert.ok(quiet.floorDb < -58, `floor ${quiet.floorDb}`)
  // Room noise must read as silence.
  assert.equal(Level.normalize(-69, quiet.floorDb, quiet.ceilDb, 1), 0)
  // Talk at -20 for 5 s with gaps; speech must land high, noise must not climb to it.
  for (let i = 0; i < 240; i++) Level.updateAutoGain(ag, i % 4 === 0 ? -68 : -20, 0.021)
  const r = Level.autoRange(ag)
  assert.ok(r.floorDb < -55, `floor after talking ${r.floorDb}`)
  assert.ok(Level.normalize(-20, r.floorDb, r.ceilDb, 1) > 0.9)
})

test("auto gain adapts to a hot mic too", () => {
  const ag = Level.newAutoGain()
  for (let i = 0; i < 100; i++) Level.updateAutoGain(ag, -38, 0.021)   // noisy room / hot preamp
  for (let i = 0; i < 100; i++) Level.updateAutoGain(ag, i % 3 ? -3 : -38, 0.021)
  const r = Level.autoRange(ag)
  assert.equal(Level.normalize(-38, r.floorDb, r.ceilDb, 1), 0)
  assert.ok(Level.normalize(-3, r.floorDb, r.ceilDb, 1) > 0.9)
})

test("auto gain keeps a usable range on a very noisy mic", () => {
  // Measured on a laptop's built-in mic: silence peaks between -12 and -8 dBFS.
  const ag = Level.newAutoGain()
  for (let i = 0; i < 150; i++) Level.updateAutoGain(ag, -12 + (i % 5), 0.021)
  for (let i = 0; i < 150; i++) Level.updateAutoGain(ag, i % 4 === 0 ? -11 : -2, 0.021)
  const r = Level.autoRange(ag)
  assert.ok(r.ceilDb <= 0, `ceiling ${r.ceilDb} above full scale`)
  assert.ok(r.ceilDb - r.floorDb >= 10, "range collapsed")
  assert.ok(Level.normalize(-11.5, r.floorDb, r.ceilDb, 1) < 0.15, "room noise reads as speech")
  assert.ok(Level.normalize(-2, r.floorDb, r.ceilDb, 1) > 0.7, "speech barely moves the orb")
})

function frameParams(level, t) {
  const LF = new Float32Array(64).fill(level)
  return {
    t, level, spin: t * 0.2, swarm: t, vortex: t * 0.3, turb: 1, move: 1, grow: 1, glow: 1,
    alpha: 1, dotScale: 1, colorKind: 1, LF, RBm1: 63,
    hist: new Float32Array(256).fill(level), histHead: 0, histSize: 256, histDt: 0.01
  }
}

function spread(out) {
  let r = 0
  for (let i = 0; i < out.n; i++) r += Math.hypot(out.x[i], out.y[i])
  return r / Math.max(1, out.n)
}

for (const name of Patterns.names) {
  test(`${name}: finite, in bounds, and louder spreads further`, () => {
    const st = Patterns.create(name, 1500)
    const quiet = Patterns.frame(st, frameParams(0, 1.3), Patterns.newOut(1500))
    const qn = quiet.n, qs = spread(quiet)
    assert.ok(qn > 300, `only ${qn} dots visible`)
    for (let i = 0; i < qn; i++) {
      for (const k of ["x", "y", "s", "a", "c"]) assert.ok(Number.isFinite(quiet[k][i]), `${k}[${i}]`)
      assert.ok(Math.abs(quiet.x[i]) < 1.3 && Math.abs(quiet.y[i]) < 1.3, "out of bounds")
      assert.ok(quiet.a[i] > 0 && quiet.a[i] <= 1)
      assert.ok(quiet.c[i] >= 0 && quiet.c[i] <= 1)
    }
    const loud = Patterns.frame(st, frameParams(1, 1.3), Patterns.newOut(1500))
    const ls = spread(loud)
    for (let i = 0; i < loud.n; i++) assert.ok(Math.abs(loud.x[i]) < 1.6 && Math.abs(loud.y[i]) < 1.6, "loud out of bounds")
    assert.ok(ls > qs * 1.05, `${name}: loud ${ls.toFixed(3)} vs quiet ${qs.toFixed(3)}`)
  })
}

test("movement 0 freezes volume response", () => {
  const st = Patterns.create("sphere", 800)
  const p0 = frameParams(0, 2); p0.move = 0
  const p1 = frameParams(1, 2); p1.move = 0
  const a = spread(Patterns.frame(st, p0, Patterns.newOut(800)))
  const b = spread(Patterns.frame(st, p1, Patterns.newOut(800)))
  assert.ok(Math.abs(a - b) < 1e-6)
})

test("frame cost stays small at the default dot count", () => {
  const st = Patterns.create("nebula", 3000)
  const out = Patterns.newOut(3000)
  const t0 = process.hrtime.bigint()
  for (let f = 0; f < 120; f++) Patterns.frame(st, frameParams(0.5, f / 60), out)
  const ms = Number(process.hrtime.bigint() - t0) / 1e6 / 120
  assert.ok(ms < 4, `${ms.toFixed(2)} ms per frame`)
})
