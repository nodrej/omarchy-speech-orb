import QtQuick
import "Settings.js" as Settings
import "Level.js" as Level
import "Patterns.js" as Patterns

// The orb itself: level processing, animation and drawing.
//
// Imports only QtQuick, so it runs under plain `qml` for previews and tests
// as well as inside the shell. The host feeds it mic peaks through
// feedPeak() and tells it what voxtype is doing through `mode`.
//
// Latency is the point of this component. Peaks come straight from PipeWire
// once per graph quantum (about every 21 ms), and are folded into the level
// the moment they arrive -- the loudest peak since the last frame wins, so a
// short syllable between two frames is never dropped. With the default
// attack of 0 the orb shows that level on the very next frame.
Item {
  id: root

  // Resolved settings (see Settings.resolve).
  property var settings: Settings.defaults()

  // "listening" | "transcribing" | "idle"
  property string mode: "idle"

  // Theme colours, pushed in by the host.
  property color themeAccent: "#7daea3"
  property color themeForeground: "#e5e5e5"
  property color themeWarn: "#f2cc4d"

  readonly property bool active: mode !== "idle"
  readonly property alias presence: root._presence

  property real _presence: 0
  property real level: 0
  property real clock: 0
  property real _spin: 0
  property real _swarm: 0
  property real _vortex: 0

  // Loudest normalised level since the last frame.
  property real _pending: 0
  property bool _hasPending: false
  property double _lastPeakMs: 0
  property var _autoGain: Level.newAutoGain()

  // Last mic reading in dBFS, and the range it is currently mapped through,
  // for the settings window's meter.
  property real inputDb: Level.SILENT_DB
  property real rangeFloorDb: settings.floorDb
  property real rangeCeilDb: settings.ceilDb

  function feedPeak(peak) {
    var s = settings
    var db = Level.toDb(peak)
    var now = Date.now()
    var dt = _lastPeakMs > 0 ? Math.min(0.2, (now - _lastPeakMs) / 1000) : 0.02
    _lastPeakMs = now
    var lo = s.floorDb, hi = s.ceilDb
    if (s.autoGain) {
      Level.updateAutoGain(_autoGain, db, dt)
      var rg = Level.autoRange(_autoGain)
      lo = rg.floorDb; hi = rg.ceilDb
    }
    inputDb = db
    rangeFloorDb = lo
    rangeCeilDb = hi
    var n = Level.normalize(db, lo, hi, s.sensitivity)
    if (!_hasPending || n > _pending) _pending = n
    _hasPending = true
  }

  // ---- colours -----------------------------------------------------------

  function _vivid(c) {
    if (!settings.vivid) return c
    // Theme accents are often heavily desaturated; floor saturation and value
    // so the dots read as emissive rather than grey, keeping the hue.
    return Qt.hsva(c.hsvHue < 0 ? 0.5 : c.hsvHue,
                   Math.max(c.hsvSaturation, 0.62), Math.max(c.hsvValue, 0.97), 1)
  }

  function _mix(a, b, t) {
    return Qt.rgba(a.r + (b.r - a.r) * t, a.g + (b.g - a.g) * t, a.b + (b.b - a.b) * t, 1)
  }

  function _white(c, t) { return _mix(c, Qt.rgba(1, 1, 1, 1), t) }

  function _rgb(c) {
    return Math.round(c.r * 255) + "," + Math.round(c.g * 255) + "," + Math.round(c.b * 255)
  }

  // Number of colour steps a dot's colour position is quantised to. Each
  // step costs one fillStyle change per alpha level, so this stays small.
  readonly property int colorSteps: 10
  readonly property int alphaSteps: 12

  // Colour-position kind for Patterns.emit: 0 flat, 1 radial, 2 loudness, 3 angle.
  readonly property int colorKind: {
    if (mode === "transcribing") return 0
    switch (settings.colorMode) {
    case "gradient": return 1
    case "reactive": return 2
    case "rainbow": return 3
    }
    return 0
  }

  // One "r,g,b" string per colour step, rebuilt once per frame (cheap: ten
  // strings) so the rainbow can turn and the theme can change live.
  function _palette() {
    var s = settings, out = []
    var steps = colorKind === 0 ? 1 : colorSteps
    var c1, c2
    if (mode === "transcribing") {
      c1 = s.transcribingColor !== "" ? Qt.color(s.transcribingColor) : _vivid(_mix(themeAccent, themeWarn, 0.65))
      out.push(_rgb(c1)); out.hot = [_rgb(_white(c1, 0.55))]
      return out
    }
    if (s.colorMode === "theme") c1 = _vivid(themeAccent)
    else c1 = Qt.color(s.color)
    c2 = Qt.color(s.color2)
    out.hot = []
    for (var i = 0; i < steps; i++) {
      var f = steps === 1 ? 0 : i / (steps - 1)
      var c
      if (s.colorMode === "rainbow") {
        var h = (f + clock * s.rainbowSpeed * 0.1) % 1
        c = Qt.hsva(h, 0.70, 1.0, 1)
      } else if (colorKind === 0) {
        c = c1
      } else {
        c = _mix(c1, c2, f)
      }
      out.push(_rgb(c))
      out.hot.push(_rgb(_white(c, 0.55)))
    }
    return out
  }

  // ---- animation ---------------------------------------------------------

  FrameAnimation {
    running: root.active || root._presence > 0.001
    onTriggered: root._tick(Math.min(0.05, frameTime))
  }

  function _tick(dt) {
    var s = settings
    clock += dt

    var target
    if (mode === "transcribing") {
      // No mic while transcribing; breathe so it still reads as working.
      target = 0.30 + 0.20 * Math.sin(clock * 3.1)
    } else if (_hasPending) {
      target = _pending
      _hasPending = false
    } else {
      // No new peak this frame (quanta are ~21 ms, frames can be shorter):
      // hold the last one rather than dipping toward zero between them.
      target = _pending
    }
    level = Level.smooth(level, target, dt, s.attackMs, s.releaseMs)
    if (!active) level = 0

    // Phases are integrated rather than computed from the clock, so a speed
    // that depends on loudness changes smoothly instead of jumping position.
    _spin += dt * 0.20 * s.spinSpeed
    _swarm += dt * (0.55 + level * 2.2 * s.movement) * Math.max(0.15, Math.abs(s.spinSpeed))
    _vortex += dt * (0.25 + level * 1.6 * s.movement) * s.spinSpeed

    canvas.pushLevel(level, dt)

    var fade = s.fadeMs > 0 ? s.fadeMs / 1000 : 0
    var pt = active ? 1 : 0
    _presence = fade > 0 ? _presence + (pt - _presence) * (1 - Math.exp(-dt / (fade * 0.45))) : pt
    if (!active && _presence < 0.002) _presence = 0

    canvas.requestPaint()
  }

  onModeChanged: {
    if (!active) {
      level = 0
      _pending = 0
      _hasPending = false
      canvas.clearHistory()
    }
  }

  // ---- drawing -----------------------------------------------------------

  Canvas {
    id: canvas
    anchors.fill: parent
    renderStrategy: Canvas.Cooperative
    renderTarget: Canvas.FramebufferObject
    opacity: root.settings.opacity

    property var st: null
    property var out: null
    property string builtFor: ""

    // Level history at a fixed 100 Hz, so ripple travel time and the ring's
    // waveform do not depend on the frame rate. 2.56 s deep.
    readonly property real histDt: 0.01
    readonly property int histSize: 256
    property var hist: new Float32Array(256)
    property int histHead: 0
    property real histAcc: 0

    readonly property int radialBins: 64
    property var levelField: new Float32Array(64)

    // Scratch arrays for the counting sort into fillStyle buckets.
    property var bucketOf: null
    property var order: null
    property var counts: null
    property var p: ({})

    function pushLevel(lv, dt) {
      histAcc += dt
      var steps = 0
      while (histAcc >= histDt && steps < 32) {
        histAcc -= histDt
        histHead = (histHead + 1) % histSize
        hist[histHead] = lv
        ++steps
      }
      if (steps >= 32) histAcc = 0
      // Keep the newest slot live between 10 ms steps, so ripple 0 and the
      // top of the ring show this frame's level rather than the last tick's.
      hist[histHead] = lv
    }

    function clearHistory() {
      for (var i = 0; i < histSize; i++) hist[i] = 0
      histAcc = 0
    }

    function ensureBuilt() {
      var s = root.settings
      var key = s.pattern + ":" + s.dotCount
      if (key === builtFor && st) return
      st = Patterns.create(s.pattern, s.dotCount)
      out = Patterns.newOut(s.dotCount)
      bucketOf = new Uint16Array(s.dotCount)
      order = new Uint32Array(s.dotCount)
      counts = new Int32Array(root.alphaSteps * root.colorSteps + 1)
      builtFor = key
    }

    onPaint: {
      var ctx = getContext("2d")
      ctx.clearRect(0, 0, width, height)
      if (root._presence < 0.01) return
      ensureBuilt()
      var s = root.settings

      // Read the history into radial bins: bin r shows the level as it was
      // r/(bins-1) * ripple ms ago. With ripple 0 every bin is live.
      var RB = radialBins, RBm1 = RB - 1, LF = levelField
      var stepsPerUnit = s.ripple / 1000 / histDt
      for (var r = 0; r < RB; r++) {
        var rr = r / RBm1
        var back = (rr * stepsPerUnit) | 0
        if (back > histSize - 1) back = histSize - 1
        var idx = histHead - back
        if (idx < 0) idx += histSize
        // Outer shells answer a little softer, as energy spreads.
        LF[r] = hist[idx] * (1 - 0.30 * rr)
      }

      p.t = root.clock; p.level = root.level
      p.spin = root._spin; p.swarm = root._swarm; p.vortex = root._vortex
      p.turb = s.turbulence; p.move = s.movement; p.grow = s.growth; p.glow = s.glow
      p.alpha = root._presence; p.dotScale = s.dotSize; p.colorKind = root.colorKind
      p.LF = LF; p.RBm1 = RBm1
      p.hist = hist; p.histHead = histHead; p.histSize = histSize; p.histDt = histDt

      var o = Patterns.frame(st, p, out)
      var n = o.n
      if (n === 0) return

      var W = width, half = Math.min(W, height) / 2 * 0.98
      var cx = W / 2, cy = height / 2
      var A = root.alphaSteps, C = root.colorKind === 0 ? 1 : root.colorSteps
      var NB = A * C

      // Counting sort by (colour step, alpha step), so each fillStyle is set
      // once per bucket rather than once per dot. Canvas state changes, not
      // arithmetic, dominate the cost at a few thousand dots.
      for (var b = 0; b <= NB; b++) counts[b] = 0
      var ox = o.x, oy = o.y, os = o.s, oa = o.a, oc = o.c
      for (var i = 0; i < n; i++) {
        var ai = (oa[i] * A) | 0; if (ai >= A) ai = A - 1
        var ci = C === 1 ? 0 : (oc[i] * (C - 1) + 0.5) | 0
        var bk = ci * A + ai
        bucketOf[i] = bk
        counts[bk + 1]++
        // Integer coordinates keep each dot a crisp square instead of a
        // four-pixel antialiased smear.
        var sz = os[i]
        sz = sz < 1 ? 1 : (sz + 0.5) | 0
        os[i] = sz
        ox[i] = (cx + ox[i] * half - sz * 0.5) | 0
        oy[i] = (cy - oy[i] * half - sz * 0.5) | 0
      }
      for (b = 1; b <= NB; b++) counts[b] += counts[b - 1]
      for (i = 0; i < n; i++) order[counts[bucketOf[i]]++] = i
      // counts[b] now marks the end of bucket b; its start is counts[b-1].

      // Outlines first, as their own full pass: dots overlap, so drawing
      // outline-then-dot per dot would let a later outline punch a hole in
      // an earlier bright dot.
      var ol = s.outline
      if (ol > 0) {
        var grow = 2, hg = 1
        for (b = 0; b < NB; b++) {
          var start = b === 0 ? 0 : counts[b - 1], end = counts[b]
          if (start === end) continue
          var av = (((b % A) + 0.5) / A) * ol
          ctx.fillStyle = "rgba(0,0,0," + av.toFixed(3) + ")"
          for (var z = start; z < end; z++) {
            var d = order[z]
            ctx.fillRect(ox[d] - hg, oy[d] - hg, os[d] + grow, os[d] + grow)
          }
        }
      }

      var pal = root._palette()
      for (b = 0; b < NB; b++) {
        var s0 = b === 0 ? 0 : counts[b - 1], e0 = counts[b]
        if (s0 === e0) continue
        var al = b % A, cstep = (b / A) | 0
        // The brightest dots take a whitened tint, which keeps the near face
        // reading as closer.
        var rgb = al >= A - 3 ? pal.hot[cstep] : pal[cstep]
        ctx.fillStyle = "rgba(" + rgb + "," + ((al + 0.5) / A).toFixed(3) + ")"
        for (var q = s0; q < e0; q++) {
          var e = order[q]
          ctx.fillRect(ox[e], oy[e], os[e], os[e])
        }
      }
    }
  }

  Text {
    visible: root.settings.showLabel
    anchors.horizontalCenter: parent.horizontalCenter
    anchors.top: parent.bottom
    anchors.topMargin: -6
    text: root.mode === "transcribing" ? "transcribing" : "listening"
    color: root.themeForeground
    opacity: 0.45 * root._presence
    font.pixelSize: 11
    font.letterSpacing: 2.2
    font.capitalization: Font.AllUppercase
  }
}
