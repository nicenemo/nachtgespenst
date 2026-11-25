# Third-party notices

Nachtgespenst itself is licensed under the MIT License (see [LICENSE](LICENSE)).
The firmware is built with the following third-party components, which are
fetched by PlatformIO at build time and remain under their own licenses. The
full license texts are included in each project's repository and in the
downloaded packages under `.pio/`.

| Component | License | Source |
|---|---|---|
| M5Unified (and M5GFX) | MIT | https://github.com/m5stack/M5Unified |
| NimBLE-Arduino | Apache-2.0 | https://github.com/h2zero/NimBLE-Arduino |
| FastLED | MIT | https://github.com/FastLED/FastLED |
| LVGL 9.2 | MIT | https://github.com/lvgl/lvgl |
| Geist Sans and Geist Mono (fonts of the demo window and the device UI, `tools/fonts/`) | SIL OFL 1.1 | https://github.com/vercel/geist-font |
| arduino-esp32 (Arduino framework for ESP32) | LGPL-2.1 | https://github.com/espressif/arduino-esp32 |
| ESP-IDF (underlying SDK) | Apache-2.0 | https://github.com/espressif/esp-idf |

## Notes

- **Geist (SIL Open Font License 1.1):** the fonts may be used, embedded and redistributed with software (this project is MIT) as long as the licence text (`tools/fonts/OFL.txt`) and the copyright notice stay with them and the fonts are not sold on their own. A modified or converted font (for example a subset embedded in the firmware) is a derivative under the same licence.

- **arduino-esp32 (LGPL-2.1):** if you distribute compiled firmware, recipients
  must be able to rebuild it with a modified version of the library. The full
  source and build configuration (`platformio.ini`) are available in this
  repository for that purpose.
- **USB HID Usage Tables:** the generated headers in `include/` use usage names
  and values from the USB HID Usage Tables published by the USB Implementers
  Forum (https://www.usb.org/hid). The specification itself is not
  redistributed here.

Licenses are listed from the upstream projects' published terms. Check the
versions pinned in `platformio.ini` before relying on this list for a release.

## Photographs on the Try it page

From Wikimedia Commons, shown at a reduced size and as a grid of lamps in the demo; each stays under its own licence.

- *Eiffel Tower and the Pont des Invalides, Paris* by Pierre Blaché, CC0 1.0: https://commons.wikimedia.org/wiki/File:Pont_des_Invalides_and_the_Eiffel_Tower,_Paris_31_August_2019.jpg
- *Tower Bridge from Shad Thames* by Colin, CC BY-SA 4.0: https://commons.wikimedia.org/wiki/File:Tower_Bridge_from_Shad_Thames.jpg
- *Brandenburger Tor abends* by Thomas Wolf (www.foto-tw.de), CC BY-SA 3.0: https://commons.wikimedia.org/wiki/File:Brandenburger_Tor_abends.jpg
- *Matterhorn sunset 2016* by Sam Ferrara, CC0 1.0: https://commons.wikimedia.org/wiki/File:Matterhorn_sunset_2016_(Unsplash).jpg
- *Deventer aan de IJssel 2024* by Smiley.toerist, CC BY-SA 4.0: https://commons.wikimedia.org/wiki/File:Deventer_aan_de_IJssel_2024.jpg

