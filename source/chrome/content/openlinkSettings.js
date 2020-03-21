var gOpenlinkPrefs = Components.classes["@mozilla.org/preferences-service;1"].
				getService(Components.interfaces.nsIPrefService).getBranch("openlink.");


/**
 * Called when settings dialog is displayed. Checks or unchecks the "use submenu" box according to
 * the user pref. If no such pref exists, box is unchecked. For robustness, pref is then (re)set according
 * to the state of the box.
 */
function openlinkOnLoadSettingsDialog() {
	var useLinkSubmenuBox = document.getElementById('openlink-uselinksubmenu');
	if (useLinkSubmenuBox) {
		//Deal with the box, defaulting to unchecking if there are any problems:
		var checkLinkSubmenuBox = false;
		if (gOpenlinkPrefs.getPrefType("useSubmenuForLinks") == gOpenlinkPrefs.PREF_BOOL) {
			try {
				if (gOpenlinkPrefs.getBoolPref("useSubmenuForLinks")) {
					checkLinkSubmenuBox = true;
				}
			} catch (Exception) {
			}
		}
		useLinkSubmenuBox.checked = checkLinkSubmenuBox;
		//(Re)set pref according to the state of the box:
		gOpenlinkPrefs.setBoolPref("useSubmenuForLinks", useLinkSubmenuBox.checked);
	}
}


/**
 * Called when settings dialog is OK'd. Updates the user prefs.
 */
function openlinkOnSettingsAccept() {
	var useLinkSubmenu = false;
	var useLinkSubmenuBox = document.getElementById('openlink-uselinksubmenu');
	if (useLinkSubmenuBox) {
		useLinkSubmenu = useLinkSubmenuBox.checked;
	}
	gOpenlinkPrefs.setBoolPref("useSubmenuForLinks", useLinkSubmenu);
}