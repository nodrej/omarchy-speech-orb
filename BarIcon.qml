import QtQuick
import qs.Ui

// Bar icon: the way into the settings, and a small "listening" light.
//
// Left click opens the settings window, right click toggles a 20 s preview
// on the live mic. It lights up in the bar's active colour while the orb is
// listening. All state lives in the plugin's service, so every monitor's copy
// of this icon agrees.
BarWidget {
  id: root
  moduleName: "io.github.nodrej.speech-orb"

  readonly property var service: bar && bar.shell ? bar.shell.serviceFor("io.github.nodrej.speech-orb") : null
  readonly property bool listening: !!(service && service.mode === "listening" && !service.previewing)
  readonly property bool shown: !service || service.settings.barIcon

  visible: shown
  implicitWidth: shown ? button.implicitWidth : 0
  implicitHeight: button.implicitHeight

  BarIconButton {
    id: button
    anchors.fill: parent
    bar: root.bar
    // nf-md-blur: a disc of dots, the orb in miniature.
    text: "\u{F00B5}"
    active: root.listening || !!(root.service && root.service.settingsOpen)
    tooltipText: root.listening ? "Speech Orb: listening" : "Speech Orb settings (right-click to preview)"
    onPressed: function(b) {
      if (!root.service) return
      if (b === Qt.RightButton) root.service.togglePreview()
      else root.service.settingsOpen = !root.service.settingsOpen
    }
  }
}
