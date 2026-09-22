import QtQuick
import Quickshell
import Quickshell.Wayland
import Quickshell.Services.Pipewire
import qs.Commons
import qs.Ui
import "Settings.js" as Settings

// Settings for the orb, generated from Settings.schema.
//
// While this is open the orb is live on the microphone in its real position,
// so every change can be judged by talking rather than by guessing. Changes
// apply the instant a control moves and are written to this plugin's entry in
// ~/.config/omarchy/shell.json.
PanelWindow {
  id: win

  required property var service
  property var orb: null

  readonly property var s: service.settings
  readonly property color fg: Color.popups.text
  readonly property color accent: Color.accent
  readonly property int pad: Style.space(16)

  anchors.top: true
  anchors.bottom: true
  anchors.right: true
  margins.top: Style.space(12)
  margins.bottom: Style.space(12)
  margins.right: Style.space(12)
  implicitWidth: Style.space(440)
  color: "transparent"

  exclusionMode: ExclusionMode.Normal
  WlrLayershell.namespace: "speech-orb-settings"
  WlrLayershell.layer: WlrLayer.Top
  WlrLayershell.keyboardFocus: WlrKeyboardFocus.OnDemand

  function close() { service.settingsOpen = false }

  // Fields that only mean something in some configurations are hidden in the
  // others, so the list only ever shows knobs that will visibly do something.
  function shown(key) {
    switch (key) {
    case "floorDb":
    case "ceilDb": return !s.autoGain
    case "color": return s.colorMode === "solid" || s.colorMode === "gradient" || s.colorMode === "reactive"
    case "color2": return s.colorMode === "gradient" || s.colorMode === "reactive"
    case "rainbowSpeed": return s.colorMode === "rainbow"
    case "vivid": return s.colorMode === "theme"
    case "spinSpeed": return s.pattern !== "ring"
    }
    return true
  }

  // Static per group: the rows must not be rebuilt while a slider in one of
  // them is being dragged. Rows hide themselves through shown() instead.
  function fieldsIn(group) {
    var out = []
    for (var i = 0; i < Settings.schema.length; i++) {
      if (Settings.schema[i].group === group) out.push(Settings.schema[i])
    }
    return out
  }

  function fmt(f, v) {
    var txt = f.step < 1 ? Number(v).toFixed(2) : String(Math.round(v))
    return f.unit ? txt + (f.unit === "×" ? "×" : " " + f.unit) : txt
  }

  // Choices for fields that name something on this machine.
  function choicesFor(key) {
    var out = []
    if (key === "micNode") {
      out.push({ value: "", label: "Default input" })
      var nodes = Pipewire.nodes.values
      for (var i = 0; i < nodes.length; i++) {
        var n = nodes[i]
        if (!n || !n.audio || n.isSink || n.isStream) continue
        out.push({ value: n.name, label: n.nickname || n.description || n.name })
      }
    } else if (key === "monitor") {
      out.push({ value: "", label: "Focused" })
      var screens = Quickshell.screens
      for (var j = 0; j < screens.length; j++) out.push({ value: screens[j].name, label: screens[j].name })
    }
    return out
  }

  readonly property var swatches: ["#66c7ff", "#7aa2ff", "#c77dff", "#ff7ad9", "#ff5277",
                                   "#ff9e64", "#ffd166", "#9ece6a", "#4dd0e1", "#ffffff"]

  Rectangle {
    anchors.fill: parent
    color: Color.popups.background
    border.color: Color.popups.border
    border.width: Style.normalBorderWidth
    radius: Style.cornerRadius
  }

  FocusScope {
    id: body
    anchors.fill: parent
    anchors.margins: win.pad
    focus: true
    Keys.onEscapePressed: win.close()

    Column {
      id: header
      width: parent.width
      spacing: Style.space(10)

      Item {
        width: parent.width
        height: titleText.implicitHeight

        Text {
          id: titleText
          text: "Speech Orb"
          color: win.fg
          font.family: Style.font.family
          font.pixelSize: Style.font.heading
          font.bold: true
        }

        Button {
          anchors.right: parent.right
          anchors.verticalCenter: parent.verticalCenter
          text: "Close"
          onClicked: win.close()
        }
      }

      Text {
        width: parent.width
        wrapMode: Text.WordWrap
        text: "The orb is live on your microphone while this is open. Talk to try each change."
        color: win.fg
        opacity: 0.65
        font.family: Style.font.family
        font.pixelSize: Style.font.bodySmall
      }

      // Live input meter: where your voice lands in the range the orb maps
      // from. Speech should reach well into the bar; silence should not.
      Column {
        width: parent.width
        spacing: Style.space(4)

        Rectangle {
          width: parent.width
          height: Style.space(6)
          radius: height / 2
          color: Util.alpha(win.fg, 0.12)

          Rectangle {
            width: parent.width * (win.orb ? Math.min(1, win.orb.level) : 0)
            height: parent.height
            radius: parent.radius
            color: win.accent
          }
        }

        Text {
          width: parent.width
          color: win.fg
          opacity: 0.6
          font.family: Style.font.family
          font.pixelSize: Style.font.caption
          text: {
            if (!win.orb) return ""
            var db = win.orb.inputDb <= -119 ? "silent" : Math.round(win.orb.inputDb) + " dB"
            return "input " + db + "   ·   mapped " + Math.round(win.orb.rangeFloorDb) + " … "
              + Math.round(win.orb.rangeCeilDb) + " dB" + (win.s.autoGain ? " (auto)" : "")
          }
        }
      }

      PanelSectionHeader { text: "Presets" }

      Flow {
        width: parent.width
        spacing: Style.space(6)

        Repeater {
          model: Settings.presets
          Button {
            required property var modelData
            text: modelData.label
            bordered: true
            selected: Settings.matchingPreset(win.s) === modelData.id
            onClicked: win.service.applyPreset(modelData.id)
          }
        }
      }
    }

    Flickable {
      id: scroller
      anchors.top: header.bottom
      anchors.topMargin: Style.space(8)
      anchors.bottom: footer.top
      anchors.bottomMargin: Style.space(8)
      width: parent.width
      clip: true
      contentHeight: groups.implicitHeight
      boundsBehavior: Flickable.StopAtBounds

      Column {
        id: groups
        width: scroller.width
        spacing: Style.space(14)

        Repeater {
          model: Settings.groups

          Column {
            id: groupCol
            required property string modelData
            width: groups.width
            spacing: Style.space(10)

            PanelSectionHeader { text: groupCol.modelData }

            Repeater {
              model: win.fieldsIn(groupCol.modelData)

              Loader {
                required property var modelData
                width: groupCol.width
                property var f: modelData
                visible: win.shown(f.key)
                sourceComponent: {
                  if (f.key === "micNode" || f.key === "monitor") return choiceRow
                  switch (f.type) {
                  case "number": return numberRow
                  case "bool": return boolRow
                  case "enum": return enumRow
                  case "color": return colorRow
                  }
                  return null
                }
              }
            }
          }
        }
      }
    }

    Item {
      id: footer
      anchors.bottom: parent.bottom
      width: parent.width
      height: resetButton.implicitHeight

      Text {
        anchors.verticalCenter: parent.verticalCenter
        text: "Saved to shell.json as you go"
        color: win.fg
        opacity: 0.5
        font.family: Style.font.family
        font.pixelSize: Style.font.caption
      }

      Button {
        id: resetButton
        anchors.right: parent.right
        text: "Reset all"
        bordered: true
        onClicked: win.service.resetAll()
      }
    }
  }

  // ---- row types -----------------------------------------------------------
  //
  // Each reads `f` (its schema field) from the Loader that hosts it.

  component FieldLabel: Column {
    property var field
    property string valueText: ""
    width: parent ? parent.width : 0
    spacing: Style.space(2)

    Item {
      width: parent.width
      height: nameText.implicitHeight
      Text {
        id: nameText
        text: field ? field.label : ""
        color: win.fg
        font.family: Style.font.family
        font.pixelSize: Style.font.body
      }
      Text {
        anchors.right: parent.right
        text: valueText
        color: win.fg
        opacity: 0.7
        font.family: Style.font.family
        font.pixelSize: Style.font.body
      }
    }

    Text {
      visible: !!(field && field.hint)
      width: parent.width
      wrapMode: Text.WordWrap
      text: field && field.hint ? field.hint : ""
      color: win.fg
      opacity: 0.5
      font.family: Style.font.family
      font.pixelSize: Style.font.caption
    }
  }

  Component {
    id: numberRow
    Column {
      width: parent ? parent.width : 0
      spacing: Style.space(4)
      readonly property var f: parent ? parent.f : null

      FieldLabel { field: f; valueText: f ? win.fmt(f, win.s[f.key]) : "" }

      PanelSlider {
        width: parent.width
        height: Style.space(18)
        minimum: f ? f.min : 0
        maximum: f ? f.max : 1
        step: f ? f.step : 0.05
        integer: f ? f.step >= 1 : false
        value: f ? win.s[f.key] : 0
        onMoved: function(v) { win.service.setValue(f.key, v) }
        onReleased: function(v) { win.service.setValue(f.key, v) }
      }
    }
  }

  Component {
    id: boolRow
    Item {
      width: parent ? parent.width : 0
      height: Math.max(boolLabel.implicitHeight, sw.implicitHeight)
      readonly property var f: parent ? parent.f : null

      FieldLabel {
        id: boolLabel
        field: f
        width: parent.width - sw.width - Style.space(12)
        anchors.verticalCenter: parent.verticalCenter
      }

      ToggleSwitch {
        id: sw
        anchors.right: parent.right
        anchors.verticalCenter: parent.verticalCenter
        checked: f ? !!win.s[f.key] : false
        onToggled: win.service.setValue(f.key, !win.s[f.key])
      }
    }
  }

  Component {
    id: enumRow
    Column {
      width: parent ? parent.width : 0
      spacing: Style.space(6)
      readonly property var f: parent ? parent.f : null

      FieldLabel { field: f }

      Flow {
        width: parent.width
        spacing: Style.space(6)
        Repeater {
          model: f ? f.options : []
          Button {
            required property var modelData
            text: modelData.label
            tooltipText: modelData.tooltip || ""
            bordered: true
            selected: win.s[f.key] === modelData.value
            onClicked: win.service.setValue(f.key, modelData.value)
          }
        }
      }
    }
  }

  Component {
    id: choiceRow
    Column {
      width: parent ? parent.width : 0
      spacing: Style.space(6)
      readonly property var f: parent ? parent.f : null

      FieldLabel { field: f }

      Flow {
        width: parent.width
        spacing: Style.space(6)
        Repeater {
          model: f ? win.choicesFor(f.key) : []
          Button {
            required property var modelData
            text: modelData.label
            tooltipText: modelData.value
            bordered: true
            selected: win.s[f.key] === modelData.value
            onClicked: win.service.setValue(f.key, modelData.value)
          }
        }
      }
    }
  }

  Component {
    id: colorRow
    Column {
      id: colorCol
      width: parent ? parent.width : 0
      spacing: Style.space(6)
      readonly property var f: parent ? parent.f : null
      readonly property string current: f ? win.s[f.key] : ""

      FieldLabel { field: f }

      Row {
        spacing: Style.space(8)

        Rectangle {
          width: Style.space(28)
          height: hexField.height
          radius: Style.cornerRadius
          color: colorCol.current !== "" ? colorCol.current : "transparent"
          border.color: Util.alpha(win.fg, 0.4)
          border.width: 1
          Text {
            visible: colorCol.current === ""
            anchors.centerIn: parent
            text: "auto"
            color: win.fg
            opacity: 0.6
            font.pixelSize: Style.font.caption
          }
        }

        TextField {
          id: hexField
          width: Style.space(110)
          text: colorCol.current
          placeholderText: "#rrggbb"
          onEditingFinished: {
            if (text === "" || Settings.isColor(text)) win.service.setValue(colorCol.f.key, text)
            else text = colorCol.current
          }
        }
      }

      Flow {
        width: parent.width
        spacing: Style.space(6)

        Repeater {
          model: (colorCol.f && colorCol.f.def === "" ? [""] : []).concat(win.swatches)
          Rectangle {
            required property string modelData
            width: Style.space(22)
            height: width
            radius: width / 2
            color: modelData === "" ? "transparent" : modelData
            border.color: colorCol.current === modelData ? win.fg : Util.alpha(win.fg, 0.25)
            border.width: colorCol.current === modelData ? 2 : 1
            Text {
              visible: modelData === ""
              anchors.centerIn: parent
              text: "∅"
              color: win.fg
              font.pixelSize: Style.font.caption
            }
            MouseArea {
              anchors.fill: parent
              cursorShape: Qt.PointingHandCursor
              onClicked: win.service.setValue(colorCol.f.key, parent.modelData)
            }
          }
        }
      }
    }
  }
}
