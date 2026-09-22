.pragma library

// Mic level -> 0..1 "how loud am I", and the smoothing that follows it.
//
// Loudness is logarithmic, so everything happens in dBFS. A linear map of raw
// sample peaks leaves ordinary speech at about a quarter of full scale and only
// shouting moves the orb properly.

var SILENT_DB = -120

function toDb(peak) {
  return peak > 1e-6 ? 20 * Math.log10(peak) : SILENT_DB
}

// dB -> 0..1 between a floor and a ceiling, with a mild expansion that lifts
// conversational speech up the range without dragging the noise floor along.
function normalize(db, floorDb, ceilDb, sensitivity) {
  var span = ceilDb - floorDb
  if (span < 1) span = 1
  var n = (db - floorDb) / span
  if (n <= 0) return 0
  if (n > 1) n = 1
  n = Math.pow(n, 0.7) * sensitivity
  return n > 1 ? 1 : n
}

// Auto gain learns two things per mic: the room's noise floor and how loud the
// user actually talks. Microphones differ by 30 dB or more out of the box, so
// fixed thresholds that suit one leave another either dead or pinned.
//
// Noise is the quietest reading in the last few seconds. Even continuous
// speech dips back to the room between words, so a sliding minimum finds the
// floor within one window on any mic -- a slowly creeping estimate took most
// of a minute to climb to a hot preamp's -38 dBFS hiss, and read it as speech
// until then. The window is kept as 30 per-slot minima, so an update is a short scan.
//
// Speech jumps to anything louder and decays slowly, so one shout does not
// make everything after it look quiet for long.
var NOISE_SLOT_S = 0.1
var NOISE_SLOTS = 30          // 3 s window
var SPEECH_DECAY_DB_PER_S = 1.5
var MIN_SPAN_DB = 20
var MIN_RANGE_DB = 10

function newAutoGain() {
  var slots = []
  for (var i = 0; i < NOISE_SLOTS; i++) slots.push(null)
  return { noiseDb: -60, speechDb: -18, slots: slots, slot: 0, slotAge: 0 }
}

function updateAutoGain(ag, db, dt) {
  if (db <= SILENT_DB) return ag

  var cur = ag.slots[ag.slot]
  ag.slots[ag.slot] = cur === null || db < cur ? db : cur
  ag.slotAge += dt
  if (ag.slotAge >= NOISE_SLOT_S) {
    ag.slotAge = 0
    ag.slot = (ag.slot + 1) % NOISE_SLOTS
    ag.slots[ag.slot] = null
  }
  var lo = null
  for (var i = 0; i < NOISE_SLOTS; i++) {
    var v = ag.slots[i]
    if (v !== null && (lo === null || v < lo)) lo = v
  }
  if (lo !== null) ag.noiseDb = lo < -90 ? -90 : lo

  if (db > ag.speechDb) ag.speechDb = db
  else ag.speechDb -= SPEECH_DECAY_DB_PER_S * dt
  // Never let the two meet, or room noise would read as speech.
  if (ag.speechDb < ag.noiseDb + MIN_SPAN_DB) ag.speechDb = ag.noiseDb + MIN_SPAN_DB
  if (ag.speechDb > 0) ag.speechDb = 0
  return ag
}

function autoRange(ag) {
  // A few dB of headroom over the noise keeps breathing and fan hum dark, and
  // the ceiling sits just under a typical speaking peak so normal speech can
  // reach the top without shouting.
  //
  // The ceiling never goes past 0 dBFS -- nothing can be louder than full
  // scale -- and the floor gives way to keep MIN_RANGE_DB beneath it. Without
  // that, a noisy mic (some laptop mics idle at -11 dBFS peak) pushed the
  // floor to -3 and the ceiling to +11, so the orb could only move for speech
  // that was already clipping.
  var floorDb = ag.noiseDb + 8
  var ceilDb = Math.min(0, Math.max(floorDb + 14, ag.speechDb - 3))
  floorDb = Math.min(floorDb, ceilDb - MIN_RANGE_DB)
  return { floorDb: floorDb, ceilDb: ceilDb }
}

// One smoothing step. attack/release are time constants in ms; 0 means snap.
// Attack 0 is the default: rising loudness is shown the frame it arrives,
// and only the fall is eased so the orb does not flicker between syllables.
function smooth(current, target, dt, attackMs, releaseMs) {
  var tauMs = target > current ? attackMs : releaseMs
  if (tauMs <= 0) return target
  return current + (target - current) * (1 - Math.exp(-dt * 1000 / tauMs))
}
