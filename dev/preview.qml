import QtQuick
import QtQuick.Window
import ".."
import "../Settings.js" as Settings

// Standalone harness for OrbView.qml -- no shell, no voxtype, no mic.
//
//   qml dev/preview.qml                           live window, synthetic speech
//   qml dev/preview.qml -- pattern=ring colorMode=rainbow step
//   qml dev/preview.qml -- shot=/tmp/orb.png      render 2.5 s, save, quit
//
// Any key=value is applied as a setting. `step` swaps speech for a hard
// 0.7 s on / 0.7 s off square wave, which makes latency and ripple visible.
Window {
  id: win
  visible: true
  width: 460
  height: 460
  color: "#12151a"
  title: "speech-orb preview"

  property var args: Qt.application.arguments
  property bool stepMode: args.indexOf("step") >= 0
  property string shot: ""
  property var overrides: ({})

  Component.onCompleted: {
    var o = {}
    for (var i = 0; i < args.length; i++) {
      var m = /^([A-Za-z]+)=(.*)$/.exec(args[i])
      if (!m) continue
      if (m[1] === "shot") { shot = m[2]; continue }
      var v = m[2]
      if (v === "true") v = true; else if (v === "false") v = false
      else if (/^-?[0-9.]+$/.test(v)) v = Number(v)
      o[m[1]] = v
    }
    overrides = o
  }

  // grabToImage skips the window color, so give shots a real background.
  Rectangle { anchors.fill: parent; color: "#12151a" }

  OrbView {
    id: orb
    width: win.width - 60
    height: win.height - 60
    anchors.centerIn: parent
    settings: Settings.resolve(win.overrides)
    mode: "listening"
  }

  property real t: 0
  // PipeWire hands peaks over once per quantum; 21 ms matches a 1024 quantum
  // at 48 kHz.
  Timer {
    interval: 21; running: true; repeat: true
    onTriggered: {
      win.t += 0.021
      var env
      if (win.stepMode) env = (win.t % 1.4) < 0.7 ? 0.0 : 1.0
      else {
        var syll = Math.pow(Math.max(0, Math.sin(win.t * 7.5)), 3.0)
        var phrase = win.t % 6.0 < 4.2 ? 1.0 : 0.05
        env = syll * phrase * (0.75 + 0.25 * Math.random())
      }
      // Room noise around -62 dBFS, speech peaks around -14.
      orb.feedPeak(Math.max(0.0008 * (0.5 + Math.random()), 0.2 * env))
    }
  }

  Timer {
    interval: 2600; running: win.shot !== ""
    onTriggered: win.contentItem.grabToImage(function(r) { r.saveToFile(win.shot); Qt.quit() })
  }
}
