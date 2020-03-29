/*jshint browser: true, devel: true */
/*eslint-env browser */

const gOpenlinkPrefs = Components.classes[
  "@mozilla.org/preferences-service;1"].getService(
  Components.interfaces.nsIPrefService).getBranch("openlink.");

/* exported openlinkOnLoadSettingsDialog */
/**
 * Called when settings dialog is displayed. Checks or unchecks the
 * "use submenu" box according to the user pref. If no such pref exists, box is
 * unchecked. For robustness, pref is then (re)set according to the state of the
 * box.
 */
function openlinkOnLoadSettingsDialog()
{
  "use strict";
  const checkLinkSubmenuBox =
    gOpenlinkPrefs.getPrefType("useSubmenuForLinks") ==
      gOpenlinkPrefs.PREF_BOOL &&
      gOpenlinkPrefs.getBoolPref("useSubmenuForLinks", false);

  const useLinkSubmenuBox = document.getElementById("openlink-uselinksubmenu");

  useLinkSubmenuBox.checked = checkLinkSubmenuBox;
  //(Re)set pref according to the state of the box:
  gOpenlinkPrefs.setBoolPref("useSubmenuForLinks", useLinkSubmenuBox.checked);
}

/* exported openlinkOnSettingsAccept */
/**
 * Called when settings dialog is OK'd. Updates the user prefs.
 */
function openlinkOnSettingsAccept()
{
  "use strict";
  const useLinkSubmenuBox = document.getElementById("openlink-uselinksubmenu");
  gOpenlinkPrefs.setBoolPref("useSubmenuForLinks", useLinkSubmenuBox.checked);
}
