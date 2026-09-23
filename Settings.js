.pragma library

// Every tunable the orb has, in one table. The settings window is generated
// from this, resolve() validates against it, and the README's Configure table
// mirrors it -- so a key added here is automatically clamped, typed and given a
// control, and nothing else needs to learn about it.
//
// type: "number" (min/max/step), "bool", "enum" (options), "color", "string"

var schema = [
  // ---- look
  { key: "pattern", group: "Look", type: "enum", def: "nebula", label: "Pattern",
    options: [
      { value: "nebula", label: "Nebula", tooltip: "Fractal cloud of orbiting dots" },
      { value: "sphere", label: "Sphere", tooltip: "A shell of dots that swells and spikes" },
      { value: "ring",   label: "Ring",   tooltip: "Your waveform wrapped into a circle" },
      { value: "vortex", label: "Vortex", tooltip: "Spiral galaxy that spins up as you talk" },
      { value: "burst",  label: "Burst",  tooltip: "Rays that shoot out with each syllable" },
      { value: "swarm",  label: "Swarm",  tooltip: "Fireflies that scatter and speed up" },
      { value: "logo",   label: "Logo",   tooltip: "The square Omarchy logo, breathing apart as you speak" }
    ] },
  { key: "size", group: "Look", type: "number", def: 320, min: 120, max: 800, step: 10, label: "Size", unit: "px" },
  { key: "dotCount", group: "Look", type: "number", def: 3000, min: 200, max: 8000, step: 100, label: "Dots" },
  { key: "dotSize", group: "Look", type: "number", def: 1.0, min: 0.5, max: 4.0, step: 0.1, label: "Dot size", unit: "×" },
  { key: "opacity", group: "Look", type: "number", def: 1.0, min: 0.1, max: 1.0, step: 0.05, label: "Opacity" },
  { key: "outline", group: "Look", type: "number", def: 0.7, min: 0.0, max: 1.0, step: 0.05, label: "Dark outline",
    hint: "Keeps the dots legible over white windows" },
  { key: "showLabel", group: "Look", type: "bool", def: true, label: "Show \"listening\" label" },

  // ---- color
  { key: "colorMode", group: "Color", type: "enum", def: "theme", label: "Color mode",
    options: [
      { value: "theme",    label: "Theme",    tooltip: "Follow the Omarchy theme accent" },
      { value: "solid",    label: "Solid",    tooltip: "One color of your choice" },
      { value: "gradient", label: "Gradient", tooltip: "Primary at the core, secondary at the edge" },
      { value: "reactive", label: "Reactive", tooltip: "Primary when quiet, secondary when loud" },
      { value: "rainbow",  label: "Rainbow",  tooltip: "Hue wheel that slowly turns" }
    ] },
  { key: "color", group: "Color", type: "color", def: "#66c7ff", label: "Primary" },
  { key: "color2", group: "Color", type: "color", def: "#c77dff", label: "Secondary" },
  { key: "transcribingColor", group: "Color", type: "color", def: "", label: "While transcribing",
    hint: "Empty uses a warm tint of the theme" },
  { key: "vivid", group: "Color", type: "bool", def: true, label: "Boost muted theme accents" },
  { key: "rainbowSpeed", group: "Color", type: "number", def: 0.25, min: 0.0, max: 2.0, step: 0.05, label: "Rainbow speed" },

  // ---- motion
  { key: "movement", group: "Motion", type: "number", def: 1.0, min: 0.0, max: 3.0, step: 0.05, label: "Movement",
    hint: "How far dots travel with your voice" },
  { key: "growth", group: "Motion", type: "number", def: 1.0, min: 0.0, max: 3.0, step: 0.05, label: "Growth",
    hint: "How much dots swell when loud" },
  { key: "glow", group: "Motion", type: "number", def: 1.0, min: 0.0, max: 3.0, step: 0.05, label: "Glow",
    hint: "How much dots brighten when loud" },
  { key: "turbulence", group: "Motion", type: "number", def: 1.0, min: 0.0, max: 3.0, step: 0.05, label: "Turbulence",
    hint: "Ambient drift, independent of volume" },
  { key: "spinSpeed", group: "Motion", type: "number", def: 1.0, min: -3.0, max: 3.0, step: 0.05, label: "Spin speed" },
  { key: "ripple", group: "Motion", type: "number", def: 0, min: 0, max: 600, step: 10, label: "Ripple delay", unit: "ms",
    hint: "0 = the whole orb answers at once. Higher lets loudness travel outward from the core" },

  // ---- sensitivity
  { key: "sensitivity", group: "Sensitivity", type: "number", def: 1.0, min: 0.2, max: 4.0, step: 0.05, label: "Sensitivity" },
  { key: "autoGain", group: "Sensitivity", type: "bool", def: true, label: "Auto gain",
    hint: "Learns your mic's noise floor and speaking level" },
  { key: "floorDb", group: "Sensitivity", type: "number", def: -50, min: -90, max: -20, step: 1, label: "Noise floor", unit: "dB",
    hint: "Manual mode: at or below this reads as silence" },
  { key: "ceilDb", group: "Sensitivity", type: "number", def: -12, min: -40, max: 0, step: 1, label: "Full scale", unit: "dB",
    hint: "Manual mode: at or above this reads as flat out" },
  { key: "attackMs", group: "Sensitivity", type: "number", def: 0, min: 0, max: 200, step: 5, label: "Attack", unit: "ms",
    hint: "0 = jumps the instant you speak" },
  { key: "releaseMs", group: "Sensitivity", type: "number", def: 140, min: 20, max: 800, step: 10, label: "Release", unit: "ms",
    hint: "How long it takes to settle after a syllable" },
  { key: "micNode", group: "Sensitivity", type: "string", def: "", label: "Microphone",
    hint: "PipeWire node name. Empty follows the default input" },

  // ---- placement
  { key: "position", group: "Placement", type: "enum", def: "bottom-center", label: "Position",
    options: [
      { value: "top-left", label: "↖" }, { value: "top-center", label: "↑" }, { value: "top-right", label: "↗" },
      { value: "center", label: "•" },
      { value: "bottom-left", label: "↙" }, { value: "bottom-center", label: "↓" }, { value: "bottom-right", label: "↘" }
    ] },
  { key: "margin", group: "Placement", type: "number", def: 72, min: 0, max: 600, step: 2, label: "Edge gap", unit: "px" },
  { key: "offsetX", group: "Placement", type: "number", def: 0, min: -1200, max: 1200, step: 5, label: "Nudge sideways", unit: "px" },
  { key: "monitor", group: "Placement", type: "string", def: "", label: "Monitor",
    hint: "Output name such as DP-1. Empty follows the focused monitor" },
  { key: "showWhenTranscribing", group: "Placement", type: "bool", def: true, label: "Stay up while transcribing" },
  { key: "barIcon", group: "Placement", type: "bool", def: true, label: "Show icon in the bar",
    hint: "Click it for these settings. Hidden, use: omarchy-shell speech-orb settings" },
  { key: "fadeMs", group: "Placement", type: "number", def: 140, min: 0, max: 1000, step: 10, label: "Fade", unit: "ms" }
]

// Presets only set what gives them their character; everything else keeps the
// user's own value, so picking one never resets their placement or mic.
var presets = [
  { id: "snappy", label: "Snappy",
    values: { pattern: "nebula", ripple: 0, attackMs: 0, releaseMs: 110, movement: 1.2, growth: 1.0, glow: 1.2, turbulence: 1.0 } },
  { id: "jarvis", label: "Jarvis",
    values: { pattern: "nebula", colorMode: "theme", ripple: 340, attackMs: 30, releaseMs: 160, movement: 1.0, growth: 1.0, glow: 1.0, turbulence: 1.0 } },
  { id: "waveform", label: "Waveform",
    values: { pattern: "ring", dotCount: 1800, ripple: 0, attackMs: 0, releaseMs: 90, movement: 1.3, turbulence: 0.4 } },
  { id: "galaxy", label: "Galaxy",
    values: { pattern: "vortex", colorMode: "gradient", color: "#7aa2ff", color2: "#ff7ad9", dotCount: 3600, movement: 1.1, spinSpeed: 1.0 } },
  { id: "calm", label: "Calm",
    values: { pattern: "sphere", movement: 0.6, growth: 0.6, glow: 0.8, turbulence: 0.5, spinSpeed: 0.5, releaseMs: 320, attackMs: 40 } },
  { id: "omarchy", label: "Omarchy",
    values: { pattern: "logo", colorMode: "theme", dotCount: 3200, movement: 1.0, growth: 0.8, glow: 1.2, turbulence: 0.6, spinSpeed: 0.6 } },
  { id: "party", label: "Party",
    values: { pattern: "burst", colorMode: "rainbow", rainbowSpeed: 0.6, movement: 1.8, glow: 2.0, growth: 1.4, releaseMs: 90 } }
]

var groups = ["Look", "Color", "Motion", "Sensitivity", "Placement"]

function field(key) {
  for (var i = 0; i < schema.length; i++) if (schema[i].key === key) return schema[i]
  return null
}

function defaults() {
  var out = {}
  for (var i = 0; i < schema.length; i++) out[schema[i].key] = schema[i].def
  return out
}

function isColor(value) {
  return typeof value === "string" && /^#([0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(value)
}

// One value through its field's rules. Returns undefined when the value is
// unusable, so the caller falls back to the default instead of a half-parsed
// guess.
function coerce(f, value) {
  if (value === undefined || value === null) return undefined
  switch (f.type) {
  case "number": {
    var n = Number(value)
    if (!isFinite(n)) return undefined
    return Math.min(f.max, Math.max(f.min, n))
  }
  case "bool":
    if (typeof value === "boolean") return value
    if (value === "true" || value === 1) return true
    if (value === "false" || value === 0) return false
    return undefined
  case "enum":
    for (var i = 0; i < f.options.length; i++) if (f.options[i].value === value) return value
    return undefined
  case "color":
    if (value === "" && f.def === "") return ""
    return isColor(value) ? value.toLowerCase() : undefined
  case "string":
    return String(value)
  }
  return undefined
}

// shell.json entry -> a complete, valid settings object. Unknown keys are
// dropped, bad values fall back to their default one at a time.
function resolve(entry) {
  var out = defaults()
  if (!entry || typeof entry !== "object") return out
  for (var i = 0; i < schema.length; i++) {
    var f = schema[i]
    var v = coerce(f, entry[f.key])
    if (v !== undefined) out[f.key] = v
  }
  return out
}

// The inverse, for saving: only what differs from the defaults, so the user's
// shell.json entry stays short and picks up future default changes.
function diff(settings) {
  var out = {}
  for (var i = 0; i < schema.length; i++) {
    var f = schema[i]
    var v = coerce(f, settings[f.key])
    if (v !== undefined && v !== f.def) out[f.key] = v
  }
  return out
}

function applyPreset(settings, presetId) {
  var out = {}
  for (var k in settings) out[k] = settings[k]
  for (var i = 0; i < presets.length; i++) {
    if (presets[i].id !== presetId) continue
    var vals = presets[i].values
    for (var key in vals) out[key] = vals[key]
  }
  return resolve(out)
}

// Which preset, if any, the settings currently match.
function matchingPreset(settings) {
  for (var i = 0; i < presets.length; i++) {
    var vals = presets[i].values, ok = true
    for (var k in vals) if (settings[k] !== vals[k]) { ok = false; break }
    if (ok) return presets[i].id
  }
  return ""
}
