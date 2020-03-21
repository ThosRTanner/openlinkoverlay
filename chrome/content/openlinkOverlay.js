/**
 * Summary
 * -------
 *
 * The browser automatically shows context menu items to open links in a new tab or a new window.  This add-on adds others,
 * including background window and the opposite of context-openlinkintab.
 *
 * Note that we do not provide a menu option for the /default/ action of clicking on a link, namely, obey HTML window
 * targets. (We do implement an option for opening a link in the current tab/window, using a clone of openLinkInCurrent,
 * which is a function new to Firefox 4 that appears to be intended for precisely our desired use and yet which doesn't
 * appear on the standard context menu for some reason.)
 *
 * We also provide the option of moving all the open link items into a submenu, to reduce clutter for those who like
 * ultra-compact menus.
 *
 * Finally, we provide similar submenus for images and background images, while removing the default menu item for
 * 'view image' and 'view background image' (since if we are providing a submenu, we might as well put everything into it).
 *
 * This major version (1.9) does not introduce any new functionality but it features refactored functions which closely
 * match the refactoring of the associated functions in Firefox 4.
 *
 * All pre-existing tab and window opening behaviours that we're interested in end up calling utilityOverlay.js|openLinkIn:
 *
 *
 * Developer notes
 * ---------------
 *
 * The relevant context menu items (in browser.xul) are:
 *
 * context-openlink (label="&openLinkCmd.label;" oncommand="gContextMenu.openLink();")   // Open linked-to URL in a new window
 * context-openlinkintab (label="&openLinkCmdInTab.label;" oncommand="gContextMenu.openLinkInTab();")  // Open linked-to URL in a new tab
 * context-openlinkincurrent (label="&openLinkCmdInCurrent.label;" oncommand="gContextMenu.openLinkInCurrent();")  // open URL in current tab
 * context-viewimage (label="&viewImageCmd.label;" oncommand="gContextMenu.viewMedia(event);") // Change current window to the URL of the image, video, or audio
 * context-viewbgimage (label="&viewBGImageCmd.label;" oncommand="gContextMenu.viewBGImage(event);")  // Change current window to the URL of the background image
 *
 * The call stacks are:
 *
 * nsContextMenu.js|openLink -> utilityOverlay.js|openLinkIn
 * nsContextMenu.js|openLinkInTab -> utilityOverlay.js|openLinkIn
 * nsContextMenu.js|openLinkInCurrent -> utilityOverlay.js|openLinkIn
 * nsContextMenu.js|viewMedia -> nsContextMenu.js|openUILink -> utilityOverlay.js|openUILinkIn -> utilityOverlay.js|openLinkIn
 * nsContextMenu.js|viewBGImage -> nsContextMenu.js|openUILink -> utilityOverlay.js|openUILinkIn -> utilityOverlay.js|openLinkIn
 *
 * Judging from browser.js|newTabButtonObserver and browser.js|newWindowButtonObserver, the only time that the following two
 * related functions are called is when something is dropped onto a "new tab" button or a "new window" button, so they are
 * not directly relevant to our needs:
 *
 * utilityOverlay.js|openNewWindowWith -> utilityOverlay.js|openLinkIn
 * utilityOverlay.js|openNewTabWith -> utilityOverlay.js|openLinkIn
 *
 **/

var gOpenlinkOpenLinkMenuItems = new Array('context-openlinkintab',
                                           'openlink-openlinkinbackgroundtab',
                                           'openlink-openlinkinforegroundtab',
                                           'context-openlink',
                                           'openlink-openlinkinbackgroundwindow',
                                           'openlink-openlinkhere'
                                          );

var gOpenlinkOpenLinkMenuMenuItems = new Array('openlink-openlinkinnewtabmenu',
                                               'openlink-openlinkinbackgroundtabmenu',
                                               'openlink-openlinkinforegroundtabmenu',
                                               'openlink-openlinkinnewwindowmenu',
                                               'openlink-openlinkinbackgroundwindowmenu',
                                               'openlink-openlinkheremenu'
                                              );

var gOpenlinkViewImageMenuItems = new Array('openlink-viewimageinnewtab',
                                            'openlink-viewimageinbackgroundtab',
                                            'openlink-viewimageinforegroundtab',
                                            'openlink-viewimageinnewwindow',
                                            'openlink-viewimageinbackgroundwindow',
                                            'openlink-viewimagehere'
                                           );


var gOpenlinkViewBackgroundImageMenuItems = new Array('openlink-viewbackgroundimageinnewtab',
                                                      'openlink-viewbackgroundimageinbackgroundtab',
                                                      'openlink-viewbackgroundimageinforegroundtab',
                                                      'openlink-viewbackgroundimageinnewwindow',
                                                      'openlink-viewbackgroundimageinbackgroundwindow',
                                                      'openlink-viewbackgroundimagehere'
                                                     );

var gCount;
const gMAX = 50;
var gCurrWindow;
var openlinkFocusCurrentWindowTriggerEvent;


window.addEventListener('load', openlinkInit, false);


/**
 * Registers a listener so that we can specify a function to be called when the context area menu or the
 * view image list menus pop up.
 */
function openlinkInit() {
	var menu = document.getElementById('contentAreaContextMenu');
	menu.addEventListener("popupshowing", openlinkShowContentAreaContextMenuItemsOnSuitableElements, false);
	menu = document.getElementById('openlink-openlinkin');
	menu.addEventListener("popupshowing", openlinkShowOpenLinkContextMenuItems, false);
	menu = document.getElementById('openlink-viewimage');
	menu.addEventListener("popupshowing", openlinkShowViewImageContextMenuItems, false);
	menu = document.getElementById('openlink-viewbackgroundimage');
	menu.addEventListener("popupshowing", openlinkShowViewBackgroundImageContextMenuItems, false);
}




//========================================================================================================================================
// Handle context menus
//========================================================================================================================================


/**
 * This function is called when the context area menu pops up.
 * It decides which open link menu elements should be shown.
 */
function openlinkShowContentAreaContextMenuItemsOnSuitableElements() {
	var tabsOpenInBg = window.getBoolPref("browser.tabs.loadInBackground", false);
	//If the page context menu is open:
	if (gContextMenu) {
		//Decide if user is on an openable link:
		var isOpenableLink = ( gContextMenu.onSaveableLink ||
		                                          ( gContextMenu.inDirList && gContextMenu.onLink ) );
		//Decide if user wants link items instead of submenu:
		var prefs = Components.classes["@mozilla.org/preferences-service;1"].
					getService(Components.interfaces.nsIPrefService).getBranch('openlink.');
		var wantSubmenu = false;
		if (prefs.getPrefType("useSubmenuForLinks") == prefs.PREF_BOOL) {
			try {
				if (prefs.getBoolPref("useSubmenuForLinks")) {
					wantSubmenu = true;
				}
			} catch (Exception) {
			}
		}
		//Display menu items accordingly:
		for (var i=0; i<gOpenlinkOpenLinkMenuItems.length; i++) {
			var elementId = gOpenlinkOpenLinkMenuItems[i];
			var menuItem = document.getElementById(elementId);
			if (menuItem) {
				if ( (elementId=='openlink-openlinkinbackgroundtab' && tabsOpenInBg) ||
						(elementId=='openlink-openlinkinforegroundtab' && !tabsOpenInBg) ||
						                                                         wantSubmenu) {
					menuItem.hidden = true;
				} else {
					menuItem.hidden = !isOpenableLink;
				}
			}
		}
		//Display open link context menu accordingly:
		var openLinkListMenuItem = document.getElementById('openlink-openlinkin');
		if (openLinkListMenuItem) {
			openLinkListMenuItem.hidden = !(isOpenableLink && wantSubmenu);
		}

		//Display view image context menu if user is on a viewable image:
		var isViewableImage = gContextMenu.onImage;
		var viewImageListMenuItem = document.getElementById('openlink-viewimage');
		if (viewImageListMenuItem) {
			viewImageListMenuItem.hidden = !isViewableImage;
			//Hide the default view image item:
			var viewImageItem = document.getElementById('context-viewimage');
			if (viewImageItem) {
				viewImageItem.hidden = true;
			}
		}

		//Display view background image context menu if user is on a viewable background image:
		var isViewableBackgroundImage = gContextMenu.hasBGImage &&
		                                    !( gContextMenu.inDirList || gContextMenu.onImage ||
		                                           gContextMenu.isTextSelected || gContextMenu.onLink ||
		                                                                          gContextMenu.onTextInput );
		var viewBackgroundImageListMenuItem = document.getElementById('openlink-viewbackgroundimage');
		if (viewBackgroundImageListMenuItem) {
			viewBackgroundImageListMenuItem.hidden = !isViewableBackgroundImage;
			//Hide the default view image item:
			var viewBackgroundImageItem = document.getElementById('context-viewbgimage');
			if (viewBackgroundImageItem) {
				viewBackgroundImageItem.hidden = true;
			}
		}
	}
}


/**
 * This function is called when the open link context menu pops up.
 * It decides which open link menu elements should be shown.
 * Currently, this is everything but the inappropriate foreground/background tab element.
 */
function openlinkShowOpenLinkContextMenuItems() {
	var tabsOpenInBg = window.getBoolPref("browser.tabs.loadInBackground", false);
	//If the open link context menu is open:
	var openLinkListMenuItem = document.getElementById('openlink-openlinkin');
	if (openLinkListMenuItem) {
		//Display menu items:
		for (var i=0; i<gOpenlinkOpenLinkMenuMenuItems.length; i++) {
			var elementId = gOpenlinkOpenLinkMenuMenuItems[i];
			var menuItem = document.getElementById(elementId);
			if (menuItem) {
				menuItem.hidden = ( (elementId=='openlink-openlinkinbackgroundtabmenu' && tabsOpenInBg) ||
				                        (elementId=='openlink-openlinkinforegroundtabmenu' && !tabsOpenInBg) );
			}
		}
	}
}


/**
 * This function is called when the view image context menu pops up.
 * It decides which view image menu elements should be shown.
 * Currently, this is everything but the inappropriate foreground/background tab element.
 */
function openlinkShowViewImageContextMenuItems() {
	var tabsOpenInBg = window.getBoolPref("browser.tabs.loadInBackground", false);
	//If the view image context menu is open:
	var viewImageListMenuItem = document.getElementById('openlink-viewimage');
	if (viewImageListMenuItem) {
		//Display menu items:
		for (var i=0; i<gOpenlinkViewImageMenuItems.length; i++) {
			var elementId = gOpenlinkViewImageMenuItems[i];
			var menuItem = document.getElementById(elementId);
			if (menuItem) {
				menuItem.hidden = ( (elementId=='openlink-viewimageinbackgroundtab' && tabsOpenInBg) ||
				                        (elementId=='openlink-viewimageinforegroundtab' && !tabsOpenInBg) );
			}
		}
	}
}


/**
 * This function is called when the view background image context menu pops up.
 * It decides which view background image menu elements should be shown.
 * Currently, this is everything but the inappropriate foreground/background tab element.
 */
function openlinkShowViewBackgroundImageContextMenuItems() {
	var tabsOpenInBg = window.getBoolPref("browser.tabs.loadInBackground", false);
	//If the view background image context menu is open:
	var viewBackgroundImageListMenuItem = document.getElementById('openlink-viewbackgroundimage');
	if (viewBackgroundImageListMenuItem) {
		//Display menu items:
		for (var i=0; i<gOpenlinkViewBackgroundImageMenuItems.length; i++) {
			var elementId = gOpenlinkViewBackgroundImageMenuItems[i];
			var menuItem = document.getElementById(elementId);
			if (menuItem) {
				menuItem.hidden = ( (elementId=='openlink-viewbackgroundimageinbackgroundtab' && tabsOpenInBg) ||
				                        (elementId=='openlink-viewbackgroundimageinforegroundtab' && !tabsOpenInBg) );
			}
		}
	}
}



//========================================================================================================================================
// The openlinkOpenIn function is derived from utilityOverlay.js|openLinkIn by removing unneeded cases and replacing all tab/window
// decisions with our own.
//========================================================================================================================================


/*
 * Derived from utilityOverlay.js|openLinkIn by removing unneeded cases and replacing all tab/window decisions with our own.
 * BACKGROUND WINDOW HANDLING WORKS, BUT PROCEDURE ISN'T GREAT; INVOLVES REPEATEDLY FOCUSSING THE CURRENT WINDOW AFTER
 * THE NEW WINDOW HAS BEEN OPENED.
 * @param url The URL to open (as a string).
 * @param where Where to open the URL ("tab", "window", "current")
 * @param params Object with the following parameters:
 *        charset
 *        referrerURI
 *        loadInBackground true if new tab/window is to be opened in background, false otherwise
 */
function openlinkOpenIn(url, where, params) {
	if (!where || !url) {
		return;
	}

	var aFromChrome           = params.fromChrome;
	var aAllowThirdPartyFixup = params.allowThirdPartyFixup;
	var aPostData             = params.postData;
	var aCharset              = params.charset;
	var aReferrerURI          = params.referrerURI;
	var aRelatedToCurrent     = params.relatedToCurrent;

	const Cc = Components.classes;
	const Ci = Components.interfaces;

	var w = getTopWin();
	if ((where == "tab") && w && w.document.documentElement.getAttribute("chromehidden")) {
		w = getTopWin(true);
		aRelatedToCurrent = false;
	}

	if (!w || where == "window") {
		var sa = Cc["@mozilla.org/supports-array;1"].
		createInstance(Ci.nsISupportsArray);

		var wuri = Cc["@mozilla.org/supports-string;1"].
		createInstance(Ci.nsISupportsString);
		wuri.data = url;

		let charset = null;
		if (aCharset) {
			charset = Cc["@mozilla.org/supports-string;1"].createInstance(Ci.nsISupportsString);
			charset.data = "charset=" + aCharset;
		}

		var allowThirdPartyFixupSupports = Cc["@mozilla.org/supports-PRBool;1"].createInstance(Ci.nsISupportsPRBool);
		allowThirdPartyFixupSupports.data = aAllowThirdPartyFixup;

		sa.AppendElement(wuri);
		sa.AppendElement(charset);
		sa.AppendElement(aReferrerURI);
		sa.AppendElement(aPostData);
		sa.AppendElement(allowThirdPartyFixupSupports);

		var newWindow = Services.ww.openWindow(w || window, getBrowserURL(), null, "chrome,dialog=no,all", sa);
		if (params.loadInBackground) {
			gCurrWindow = window;
			newWindow.addEventListener('load', openlinkDoWindowFocus, false); //'focus' event no longer seems to work in Fx3.5+, so use 'load'
			setTimeout(function() {
			           	newWindow.removeEventListener('load', openlinkDoWindowFocus, false);
			           }, 2000);
		}
		return;
	}

	// Decide default tab focus (case 'window' has already been dispatched and closed)
	var loadInBackground = (params.loadInBackground === null) ? getBoolPref("browser.tabs.loadInBackground") : params.loadInBackground;

	if (where == "current" && w.gBrowser.selectedTab.pinned) {
		try {
			let uriObj = Services.io.newURI(url, null, null);
			if (!uriObj.schemeIs("javascript") && w.gBrowser.currentURI.host != uriObj.host) {
				where = "tab";
				loadInBackground = false;
			}
		} catch (err) {
			where = "tab";
			loadInBackground = false;
		}
	}

	switch (where) {
		case "current":
			w.loadURI(url, aReferrerURI, aPostData, aAllowThirdPartyFixup);
			break;
		case "tab":
			let browser = w.gBrowser;
			browser.loadOneTab(url, {referrerURI: aReferrerURI,
			                         charset: aCharset,
			                         postData: aPostData,
			                         inBackground: loadInBackground,
			                         allowThirdPartyFixup: aAllowThirdPartyFixup,
			                         relatedToCurrent: aRelatedToCurrent
			                        });
			break;
	}

	// If this window is active, focus the target window. Otherwise, focus the
	// content but don't raise the window, since the URI we just loaded may have
	// resulted in a new frontmost window (e.g. "javascript:window.open('');").
	var fm = Components.classes["@mozilla.org/focus-manager;1"].getService(Components.interfaces.nsIFocusManager);
	if (window == fm.activeWindow) {
		w.content.focus();
	} else {
		w.gBrowser.selectedBrowser.focus();
	}
}


function openlinkDoWindowFocus() {
	gCount = 0;
	openlinkFocusCurrentWindowRepeatedly();
}


function openlinkFocusCurrentWindowRepeatedly() {
	gCurrWindow.focus();
	if (gCount<gMAX) {
		++gCount;
		var timer = Components.classes["@mozilla.org/timer;1"].createInstance(Components.interfaces.nsITimer);
		timer.initWithCallback(openlinkFocusCurrentWindowTriggerEvent, 20, Components.interfaces.nsITimer.TYPE_ONE_SHOT);
	}
}


openlinkFocusCurrentWindowTriggerEvent = {
	notify: function(timer) {
		openlinkFocusCurrentWindowRepeatedly();
	}
}



//========================================================================================================================================
// The openlinkOpenLinkIn function captures the behaviour of the following functions, providing a common interface:
//    openLink, openLinkInTab, openLinkInCurrent  (all located in nsContextMenu.js)
// I have never been able to figure out how normal left-clicks on links are treated, so I am using nsContextMenu.js|openLinkInCurrent
// as the reference.  (That latter function is new in Firefox 4, and appears to be intended for precisely our desired use, yet it doesn't
// appear on the standard context menu for some reason.
//========================================================================================================================================


/*
 * @param url The URL to open (as a string).
 * @param aDocument The document from which the URL came, or null.
 *          This is used to set the referrer header and to do a security check of whether
 *          the document as allowed to reference the URL.
 *          If null, there will be no referrer header and no security check.
 * @param aTarget The string 'current' or 'tab' or 'window'
 * @param aOpenInBackground true if new tab is to be opened in background, false otherwise
 */
function openlinkOpenLinkIn(url, aDocument, aTarget, aOpenInBackground) {
	urlSecurityCheck(url, aDocument.nodePrincipal);
	openlinkOpenIn(url, aTarget, {charset: aDocument ? aDocument.characterSet : null,
	                              referrerURI: aDocument ? aDocument.documentURIObject : null,
	                              loadInBackground: aOpenInBackground
	                             });
}



//========================================================================================================================================
// The openlinkViewImageIn function captures the behaviour of the following functions, providing a common content-agnostic interface:
//    viewMedia, viewBGImage  (both located in nsContextMenu.js)
//========================================================================================================================================


/**
 * Derived from nsContextMenu.js|viewMedia and nsContextMenu.js|viewBGImage by
 * removing all preference-checking as to whether to open in background or not and replacing it with our own, and by using
 * the openlinkOpenIn function instead of using utilityOverlay.js|openUILinkIn.
 * @param aDocument The document from which the URL came, or null.
 *          This is used to set the referrer header and to do a security check of whether
 *          the document as allowed to reference the URL.
 *          If null, there will be no referrer header and no security check.
 * @param aIsBgImage true if object is background image, false if normal image
 * @param aTarget The string 'current' or 'tab' or 'window'
 * @param aOpenInBackground true if new tab or window is to be opened in background, false if foreground, null if no explicit choice desired
 */
function openlinkViewImageIn(aDocument, aIsBgImage, aTarget, aOpenInBackground) {
	if (!gContextMenu || !gContextMenu.browser) {
		return;
	}
	var viewURL;
	if (aIsBgImage) {
		viewURL = gContextMenu.bgImageURL;
		urlSecurityCheck(viewURL, gContextMenu.browser.contentPrincipal, Ci.nsIScriptSecurityManager.DISALLOW_SCRIPT);
	} else {
		if (gContextMenu.onCanvas) {
			viewURL = gContextMenu.target.toDataURL();
		} else {
			viewURL = gContextMenu.mediaURL;
			urlSecurityCheck(viewURL, gContextMenu.browser.contentPrincipal, Ci.nsIScriptSecurityManager.DISALLOW_SCRIPT);
		}
	}

	openlinkOpenIn(viewURL, aTarget, {charset: aDocument ? aDocument.characterSet : null,
	                                  referrerURI: aDocument ? aDocument.documentURIObject : null,
	                                  loadInBackground: aOpenInBackground
	                                 });
}



//========================================================================================================================================
// Attach functionality to context menu items
//========================================================================================================================================


function openlinkOpenLinkInBackgroundTab() {
	if (gContextMenu && gContextMenu.linkURL && gContextMenu.target && gContextMenu.target.ownerDocument) {
		openlinkOpenLinkIn(gContextMenu.linkURL, gContextMenu.target.ownerDocument, "tab", true);
	}
}


function openlinkOpenLinkInForegroundTab() {
	if (gContextMenu && gContextMenu.linkURL && gContextMenu.target && gContextMenu.target.ownerDocument) {
		openlinkOpenLinkIn(gContextMenu.linkURL, gContextMenu.target.ownerDocument, "tab", false);
	}
}


function openlinkOpenLinkInBackgroundWindow() {
	if (gContextMenu && gContextMenu.linkURL && gContextMenu.target && gContextMenu.target.ownerDocument) {
		openlinkOpenLinkIn(gContextMenu.linkURL, gContextMenu.target.ownerDocument, "window", true);
	}
}


function openlinkOpenLinkHere() {
	if (gContextMenu && gContextMenu.linkURL && gContextMenu.target && gContextMenu.target.ownerDocument) {
		openlinkOpenLinkIn(gContextMenu.linkURL, gContextMenu.target.ownerDocument, "current", null);
	}
}



function openlinkViewImageInNewTab() {
	if (gContextMenu && gContextMenu.target && gContextMenu.target.ownerDocument) {
		openlinkViewImageIn(gContextMenu.target.ownerDocument, false, 'tab', null);
	}
}


function openlinkViewImageInBackgroundTab() {
	if (gContextMenu && gContextMenu.target && gContextMenu.target.ownerDocument) {
		openlinkViewImageIn(gContextMenu.target.ownerDocument, false, 'tab', true);
	}
}


function openlinkViewImageInForegroundTab() {
	if (gContextMenu && gContextMenu.target && gContextMenu.target.ownerDocument) {
		openlinkViewImageIn(gContextMenu.target.ownerDocument, false, 'tab', false);
	}
}

function openlinkViewImageInNewWindow() {
	if (gContextMenu && gContextMenu.target && gContextMenu.target.ownerDocument) {
		openlinkViewImageIn(gContextMenu.target.ownerDocument, false, 'window', false);
	}
}


function openlinkViewImageInBackgroundWindow() {
	if (gContextMenu && gContextMenu.target && gContextMenu.target.ownerDocument) {
		openlinkViewImageIn(gContextMenu.target.ownerDocument, false, 'window', true);
	}
}


function openlinkViewImageHere() {
	if (gContextMenu && gContextMenu.target && gContextMenu.target.ownerDocument) {
		openlinkViewImageIn(gContextMenu.target.ownerDocument, false, 'current', null);
	}
}



function openlinkViewBackgroundImageInNewTab() {
	if (gContextMenu && gContextMenu.target && gContextMenu.target.ownerDocument) {
		openlinkViewImageIn(gContextMenu.target.ownerDocument, true, 'tab', null);
	}
}


function openlinkViewBackgroundImageInBackgroundTab() {
	if (gContextMenu && gContextMenu.target && gContextMenu.target.ownerDocument) {
		openlinkViewImageIn(gContextMenu.target.ownerDocument, true, 'tab', true);
	}
}


function openlinkViewBackgroundImageInForegroundTab() {
	if (gContextMenu && gContextMenu.target && gContextMenu.target.ownerDocument) {
		openlinkViewImageIn(gContextMenu.target.ownerDocument, true, 'tab', false);
	}
}

function openlinkViewBackgroundImageInNewWindow() {
	if (gContextMenu && gContextMenu.target && gContextMenu.target.ownerDocument) {
		openlinkViewImageIn(gContextMenu.target.ownerDocument, true, 'window', false);
	}
}


function openlinkViewBackgroundImageInBackgroundWindow() {
	if (gContextMenu && gContextMenu.target && gContextMenu.target.ownerDocument) {
		openlinkViewImageIn(gContextMenu.target.ownerDocument, true, 'window', true);
	}
}


function openlinkViewBackgroundImageHere() {
	if (gContextMenu && gContextMenu.target && gContextMenu.target.ownerDocument) {
		openlinkViewImageIn(gContextMenu.target.ownerDocument, true, 'current', null);
	}
}
