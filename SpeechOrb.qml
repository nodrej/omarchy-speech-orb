import QtQuick
import Quickshell
import Quickshell.Io
import Quickshell.Wayland
import Quickshell.Hyprland
import Quickshell.Services.Pipewire
import qs.Commons
import "Settings.js" as Settings

// Speech orb
//
// A particle orb that appears while voxtype is listening and moves with your
// voice. The mic is metered directly from PipeWire rather than through
// voxtype's audio socket: the socket hands frames over in bursts of 30-60 ms,
// while a PipeWire peak monitor answers once per graph quantum (~21 ms at the
// default 1024/48k), evenly spaced. See OrbView.qml for the rest of the
// latency story.
Item {
  id: root

  readonly property string pluginId: "io.github.nodrej.speech-orb"

  // Injected by the shell. Used only to write this plugin's own entry.
  property var shell: null

  // ---- settings ----------------------------------------------------------
  //
  // Services aren't handed their shell.json entry, so read it here. Edits from
  // the settings window are applied locally at once and written back through
  // the shell's own API; the file watch then confirms them.
  property var settings: Settings.defaults()

  readonly property string shellJsonPath: Quickshell.env("HOME") + "/.config/omarchy/shell.json"

  // The shell persists shell.json asynchronously, so the file watch can
  // report one of our own earlier writes after newer edits were made in
  // memory. Adopting it would silently undo those edits. Reads that land
  // shortly after a save are therefore ignored, and the file is read once
  // more after the burst has settled.
  property double _lastSaveMs: 0
  readonly property int _echoWindowMs: 1500

  Timer {
    id: settleRead
    interval: root._echoWindowMs + 100
    onTriggered: shellFile.reload()
  }

  function _readEntry(text) {
    if (saveDebounce.running || Date.now() - _lastSaveMs < _echoWindowMs) {
      settleRead.restart()
      return
    }
    try {
      var cfg = JSON.parse(text || "{}")
      // With the bar icon placed, the plugin's entry lives in the bar layout
      // (that is where the shell writes it back too); without it, in
      // plugins[]. Check both, bar first, matching the shell's own lookup.
      var list = []
      var layout = cfg.bar && cfg.bar.layout ? cfg.bar.layout : {}
      var sections = ["left", "center", "right"]
      for (var s = 0; s < sections.length; s++) {
        if (Array.isArray(layout[sections[s]])) list = list.concat(layout[sections[s]])
      }
      if (Array.isArray(cfg.plugins)) list = list.concat(cfg.plugins)
      for (var i = 0; i < list.length; i++) {
        if (list[i] && list[i].id === root.pluginId) {
          root.settings = Settings.resolve(list[i])
          return
        }
      }
      root.settings = Settings.defaults()
    } catch (e) {
      console.warn("speech-orb: could not parse shell.json:", e)
    }
  }

  FileView {
    id: shellFile
    path: root.shellJsonPath
    preload: true
    watchChanges: true
    printErrors: false
    onLoaded: root._readEntry(text())
    onFileChanged: reload()
  }

  function setValue(key, value) {
    var f = Settings.field(key)
    if (!f) return false
    var v = Settings.coerce(f, value)
    if (v === undefined) return false
    var next = {}
    for (var k in settings) next[k] = settings[k]
    next[key] = v
    _commit(next)
    return true
  }

  function applyPreset(id) {
    _commit(Settings.applyPreset(settings, id))
  }

  function resetAll() {
    _commit(Settings.defaults())
  }

  function _commit(next) {
    settings = next
    saveDebounce.restart()
  }

  // Sliders emit on every pixel of a drag; write shell.json once they settle.
  Timer {
    id: saveDebounce
    interval: 300
    onTriggered: {
      if (!root.shell || !root.shell.updateEntryInline) {
        console.warn("speech-orb: no shell API; settings apply for this session only")
        return
      }
      root._lastSaveMs = Date.now()
      root.shell.updateEntryInline(root.pluginId, Settings.diff(root.settings))
    }
  }

  // ---- voxtype -----------------------------------------------------------

  readonly property string runtimeDir: Quickshell.env("XDG_RUNTIME_DIR") || "/run/user/1000"
  property string vxState: "idle"
  property bool vxSuppressed: false

  FileView {
    id: stateFile
    path: root.runtimeDir + "/voxtype/state"
    watchChanges: true
    printErrors: false
    onLoaded: root.vxState = (text() || "idle").trim()
    onLoadFailed: root.vxState = "idle"
    onFileChanged: reload()
  }

  // Set while a recording was started with --no-osd, for tools that draw
  // their own UI. Respected like voxtype's own OSD respects it.
  FileView {
    id: suppressedFile
    path: root.runtimeDir + "/voxtype/osd_suppressed"
    watchChanges: true
    printErrors: false
    onLoaded: root.vxSuppressed = true
    onLoadFailed: root.vxSuppressed = false
    onFileChanged: reload()
  }

  // The inotify watch does not survive the file being created from scratch,
  // which is what happens when the voxtype daemon (re)starts after the shell.
  // A slow re-read covers that; it is a few bytes from tmpfs.
  Timer {
    interval: 2000
    running: true
    repeat: true
    onTriggered: { stateFile.reload(); suppressedFile.reload() }
  }

  // ---- what to show ------------------------------------------------------

  property bool settingsOpen: false
  property bool ipcPreview: false

  Timer {
    id: previewTimeout
    interval: 20000
    onTriggered: root.ipcPreview = false
  }

  readonly property bool previewing: settingsOpen || ipcPreview

  function togglePreview() {
    ipcPreview = !ipcPreview
    if (ipcPreview) previewTimeout.restart()
    else previewTimeout.stop()
  }

  readonly property string mode: {
    var s = vxState
    if (!vxSuppressed) {
      if (s === "recording" || s === "streaming") return "listening"
      if (s === "transcribing" && settings.showWhenTranscribing) return "transcribing"
    }
    return previewing ? "listening" : "idle"
  }

  // ---- microphone ----------------------------------------------------------

  readonly property var micNode: {
    var want = settings.micNode
    if (want && want.length > 0) {
      var nodes = Pipewire.nodes.values
      for (var i = 0; i < nodes.length; i++) {
        if (nodes[i] && nodes[i].name === want) return nodes[i]
      }
    }
    return Pipewire.defaultAudioSource
  }

  // Metering opens a capture stream, so it runs only while the orb is
  // listening -- never in the background.
  readonly property bool metering: mode === "listening" && micNode !== null

  // Peaks received since the shell started; `status` reports it so a silent
  // meter can be told apart from a quiet room.
  property int _peakCount: 0

  PwObjectTracker {
    objects: root.metering ? [root.micNode] : []
  }

  PwNodePeakMonitor {
    node: root.micNode
    enabled: root.metering
    onPeakChanged: {
      root._peakCount++
      orb.feedPeak(peak)
    }
  }

  // ---- placement ---------------------------------------------------------

  readonly property var targetScreen: {
    var screens = Quickshell.screens
    var want = settings.monitor
    if (!want) {
      var mon = Hyprland.focusedMonitor
      want = mon ? mon.name : ""
    }
    for (var i = 0; i < screens.length; i++) {
      if (screens[i].name === want) return screens[i]
    }
    return screens.length > 0 ? screens[0] : null
  }

  readonly property var orbView: orb

  readonly property int labelRoom: settings.showLabel ? 18 : 0

  PanelWindow {
    id: win

    readonly property string pos: root.settings.position
    readonly property bool atTop: pos.indexOf("top") === 0
    readonly property bool atBottom: pos.indexOf("bottom") === 0
    readonly property bool atLeft: pos.indexOf("left") >= 0
    readonly property bool atRight: pos.indexOf("right") >= 0
    readonly property bool hCentered: !atLeft && !atRight
    readonly property int sw: screen ? screen.width : 1920

    screen: root.targetScreen
    visible: orb.active || orb.presence > 0
    color: "transparent"

    // Orb-sized, not fullscreen: a transparent fullscreen overlay would be
    // composited over everything on the monitor for the whole recording.
    implicitWidth: root.settings.size
    implicitHeight: root.settings.size + root.labelRoom

    // Layer-shell centers on any axis left unanchored. A sideways nudge on a
    // centerd orb needs an explicit left margin instead.
    anchors.top: atTop
    anchors.bottom: atBottom
    anchors.left: atLeft || (hCentered && root.settings.offsetX !== 0)
    anchors.right: atRight
    margins.top: root.settings.margin
    margins.bottom: root.settings.margin
    margins.left: atLeft ? root.settings.margin + root.settings.offsetX
                         : Math.max(0, (sw - implicitWidth) / 2 + root.settings.offsetX)
    margins.right: root.settings.margin - root.settings.offsetX

    // Normal, not Ignore: margins then count from the bar's edge rather than
    // the screen's, so a top-positioned orb clears a top bar.
    exclusionMode: ExclusionMode.Normal
    WlrLayershell.namespace: "speech-orb"
    WlrLayershell.layer: WlrLayer.Overlay
    WlrLayershell.keyboardFocus: WlrKeyboardFocus.None

    // Click-through: an empty input region passes every pointer event on.
    mask: Region {}

    OrbView {
      id: orb
      width: root.settings.size
      height: root.settings.size
      settings: root.settings
      mode: root.mode
      themeAccent: Color.accent
      themeForeground: Color.foreground
    }
  }

  // ---- settings window -----------------------------------------------------

  LazyLoader {
    active: root.settingsOpen
    SettingsWindow {
      service: root
      // Not `orb: orb` -- inside SettingsWindow that name is its own
      // property, so the binding would read itself and stay null.
      orb: root.orbView
      screen: root.targetScreen
    }
  }

  // ---- IPC -------------------------------------------------------------------

  IpcHandler {
    target: "speech-orb"

    // Open the settings window. The orb goes live on your mic while it is
    // open, so every change can be tried by talking.
    function settings(): void { root.settingsOpen = true }
    function close(): void { root.settingsOpen = false }
    function toggleSettings(): void { root.settingsOpen = !root.settingsOpen }

    // Show the orb on the live mic for 20 seconds without dictating.
    function preview(): void { root.togglePreview() }

    // `omarchy-shell speech-orb set movement 1.5` -- any key from the
    // README's table. Prints ok, or why not.
    function set(key: string, value: string): string {
      var f = Settings.field(key)
      if (!f) return "unknown key: " + key
      var v = value
      if (f.type === "number") v = Number(value)
      else if (f.type === "bool") v = value === "true" || value === "1" || value === "on"
      return root.setValue(key, v) ? "ok" : "invalid value for " + key + ": " + value
    }

    function preset(name: string): string {
      for (var i = 0; i < Settings.presets.length; i++) {
        if (Settings.presets[i].id === name) {
          root.applyPreset(name)
          return "ok"
        }
      }
      return "unknown preset: " + name
    }

    function reset(): void { root.resetAll() }

    function status(): string {
      return JSON.stringify({
        mode: root.mode,
        voxtype: root.vxState,
        mic: root.micNode ? root.micNode.name : null,
        metering: root.metering,
        level: Math.round(orb.level * 1000) / 1000,
        inputDb: Math.round(orb.inputDb),
        range: [Math.round(orb.rangeFloorDb), Math.round(orb.rangeCeilDb)],
        peaks: root._peakCount,
        micBound: !!(root.micNode && root.micNode.audio),
        screen: root.targetScreen ? root.targetScreen.name : null,
        settings: Settings.diff(root.settings)
      })
    }
  }
}
