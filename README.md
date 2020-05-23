# openlinkoverlay

[![Codacy Badge](https://api.codacy.com/project/badge/Grade/503f2223e3454d769b7516d40cb6f66f)](https://app.codacy.com/manual/ThosRTanner/openlinkoverlay?utm_source=github.com&utm_medium=referral&utm_content=ThosRTanner/openlinkoverlay&utm_campaign=Badge_Grade_Settings)

openlinkoverlay

This was cloned from the openlinkoverlay extension by Anton Prowse, and updated for palemoon and basilisk.

The original documentation may be found here:
http://forums.mozillazine.org/viewtopic.php?t=118365

## Open in a background window

Please note this is done on a best effort basis as it's not possible to actually detect which window was opened - instead, when any window is opened, the current window is focussed. In addition, due to the way the focussing works this is done another 50 times. The long and short of this is please give it a second or so to settle after opening a link in a background window.

## Compatibility

Note that tabmix plus has options to add similar entries to the context menu. If you enable either of the first 2 items in the 'Main context menu' panel in the menu tab you will get duplicate entries in the context menu.
