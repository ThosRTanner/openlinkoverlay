/**
 * Summary
 * -------
 *
 * The browser automatically shows context menu items to open links in a new tab
 * or a new window.  This add-on adds others, including background window and
 * the opposite of context-openlinkintab.
 *
 * Note that we do not provide a menu option for the /default/ action of
 * clicking on a link, namely, obey HTML window targets. (We do implement an
 * option for opening a link in the current tab/window, using a clone of
 * openLinkInCurrent, which is a function new to Firefox 4 that appears to be
 * intended for precisely our desired use and yet which doesn't appear on the
 * standard context menu for some reason.)
 *
 * We also provide the option of moving all the open link items into a submenu,
 * to reduce clutter for those who like ultra-compact menus.
 *
 * Finally, we provide similar submenus for images and background images, while
 * removing the default menu item for 'view image' and 'view background image'
 * (since if we are providing a submenu, we might as well put everything into
 * it).
 *
 * This major version (1.9) does not introduce any new functionality but it
 * features refactored functions which closely match the refactoring of the
 * associated functions in Firefox 4.
 *
 * All pre-existing tab and window opening behaviours that we're interested in
 * end up calling utilityOverlay.js|openLinkIn:
 *
 *
 * Developer notes
 * ---------------
 *
 * The relevant context menu items (in browser.xul) are:
 *
 * context-openlink (
 *  label="&openLinkCmd.label;" oncommand="gContextMenu.openLink();")
 *  // Open linked-to URL in a new window
 * context-openlinkintab (
 *  label="&openLinkCmdInTab.label;" oncommand="gContextMenu.openLinkInTab();")
 *  // Open linked-to URL in a new tab
 * context-openlinkincurrent (
 *  label="&openLinkCmdInCurrent.label;"
 *  oncommand="gContextMenu.openLinkInCurrent();")
 *  // open URL in current tab
 * context-viewimage (
 *  label="&viewImageCmd.label;" oncommand="gContextMenu.viewMedia(event);")
 *  // Change current window to the URL of the image, video, or audio
 * context-viewbgimage (
 *  label="&viewBGImageCmd.label;" oncommand="gContextMenu.viewBGImage(event);")
 *  // Change current window to the URL of the background image
 *
 * The call stacks are:
 *
 * nsContextMenu.js|openLink -> utilityOverlay.js|openLinkIn
 * nsContextMenu.js|openLinkInTab -> utilityOverlay.js|openLinkIn
 * nsContextMenu.js|openLinkInCurrent -> utilityOverlay.js|openLinkIn
 * nsContextMenu.js|viewMedia -> nsContextMenu.js|openUILink ->
 *    utilityOverlay.js|openUILinkIn -> utilityOverlay.js|openLinkIn
 * nsContextMenu.js|viewBGImage -> nsContextMenu.js|openUILink ->
 *    utilityOverlay.js|openUILinkIn -> utilityOverlay.js|openLinkIn
 *
 * Judging from browser.js|newTabButtonObserver and
 * browser.js|newWindowButtonObserver, the only time that the following two
 * related functions are called is when something is dropped onto a "new tab"
 * button or a "new window" button, so they are
 * not directly relevant to our needs:
 *
 * utilityOverlay.js|openNewWindowWith -> utilityOverlay.js|openLinkIn
 * utilityOverlay.js|openNewTabWith -> utilityOverlay.js|openLinkIn
 *
 */

/*jshint browser: true, devel: true */
/*eslint-env browser */

// This is an undocumented browser global
/* globals gContextMenu */

//Undocumented browser function
/* globals urlSecurityCheck */

//Standard firefox globals - should probably be in eslint setup.
/* globals Cc, Ci */

const gOpenlinkOpenLinkMenuItems = [
  //context-openlinkincurrent
  "context-openlinkintab",
  //tm-linkWithHistory
  //tm-openAllLinks
  //tm-openinverselink
  "context-openlink",
  //context-openlinkprivate <== we should implement this
  "openlink-openlinkinbackgroundtab",
  "openlink-openlinkinforegroundtab",
  "openlink-openlinkinbackgroundwindow",
  "openlink-openlinkhere"
];

const gOpenlinkOpenLinkMenuMenuItems = [
  "openlink-openlinkinnewtabmenu",
  "openlink-openlinkinbackgroundtabmenu",
  "openlink-openlinkinforegroundtabmenu",
  "openlink-openlinkinnewwindowmenu",
  "openlink-openlinkinbackgroundwindowmenu",
  "openlink-openlinkheremenu"
];

const gOpenlinkViewImageMenuItems = [
  "openlink-viewimageinnewtab",
  "openlink-viewimageinbackgroundtab",
  "openlink-viewimageinforegroundtab",
  "openlink-viewimageinnewwindow",
  "openlink-viewimageinbackgroundwindow",
  "openlink-viewimagehere"
];

const gOpenlinkViewBackgroundImageMenuItems = [
  "openlink-viewbackgroundimageinnewtab",
  "openlink-viewbackgroundimageinbackgroundtab",
  "openlink-viewbackgroundimageinforegroundtab",
  "openlink-viewbackgroundimageinnewwindow",
  "openlink-viewbackgroundimageinbackgroundwindow",
  "openlink-viewbackgroundimagehere"
];

var gCount;
const gMAX = 50;
var gCurrWindow;
var openlinkFocusCurrentWindowTriggerEvent;

Components.utils.import("resource://gre/modules/Services.jsm");

window.addEventListener("load", openlinkInit, false);

/**
 * Registers a listener so that we can specify a function to be called when the
 * context area menu or the view image list menus pop up.
 */
function openlinkInit()
{
  let menu = document.getElementById("contentAreaContextMenu");
  menu.addEventListener(
    "popupshowing",
    openlinkShowContentAreaContextMenuItemsOnSuitableElements);
  menu = document.getElementById("openlink-openlinkin");
  menu.addEventListener(
    "popupshowing",
    openlinkShowOpenLinkContextMenuItems);
  menu = document.getElementById("openlink-viewimage");
  menu.addEventListener(
    "popupshowing",
    openlinkShowViewImageContextMenuItems);
  menu = document.getElementById("openlink-viewbackgroundimage");
  menu.addEventListener(
    "popupshowing",
    openlinkShowViewBackgroundImageContextMenuItems);
}

//==============================================================================
// Handle context menus
//==============================================================================

/**
 * This function is called when the context area menu pops up.
 * It decides which open link menu elements should be shown.
 */
function openlinkShowContentAreaContextMenuItemsOnSuitableElements()
{
  //If the page context menu is open:
  if (! gContextMenu)
  {
    return;
  }

  const tabsOpenInBg = Services.prefs.getBoolPref(
    "browser.tabs.loadInBackground", false);

  //Decide if user is on an openable link:
  const isOpenableLink = gContextMenu.onSaveableLink ||
    (gContextMenu.inDirList && gContextMenu.onLink);
  //Decide if user wants link items instead of submenu:
  const prefs = Components.classes["@mozilla.org/preferences-service;1"].
    getService(Components.interfaces.nsIPrefService).getBranch("openlink.");
  const wantSubmenu =
    prefs.getPrefType("useSubmenuForLinks") == prefs.PREF_BOOL &&
    prefs.getBoolPref("useSubmenuForLinks", false);
  //Display menu items accordingly:
  for (const elementId of gOpenlinkOpenLinkMenuItems)
  {
    const menuItem = document.getElementById(elementId);
    //if (menuItem)
    {
      if ((elementId == "openlink-openlinkinbackgroundtab" && tabsOpenInBg) ||
          (elementId == "openlink-openlinkinforegroundtab" &&
           ! tabsOpenInBg) ||
          wantSubmenu)
      {
        menuItem.hidden = true;
      }
      else
      {
        menuItem.hidden = ! isOpenableLink;
      }
    }
  }
  //Display open link context menu accordingly:
  const openLinkListMenuItem = document.getElementById("openlink-openlinkin");
  openLinkListMenuItem.hidden = ! (isOpenableLink && wantSubmenu);

  //Display view image context menu if user is on a viewable image:
  const isViewableImage = gContextMenu.onImage;
  const viewImageListMenuItem = document.getElementById("openlink-viewimage");
  viewImageListMenuItem.hidden = ! isViewableImage;
  //Hide the default view image item:
  const viewImageItem = document.getElementById("context-viewimage");
  viewImageItem.hidden = true;

  //Display view background image context menu if user is on a viewable
  //background image:
  const isViewableBackgroundImage = gContextMenu.hasBGImage &&
    ! (gContextMenu.inDirList || gContextMenu.onImage ||
      gContextMenu.isTextSelected || gContextMenu.onLink ||
      gContextMenu.onTextInput);
  const viewBackgroundImageListMenuItem = document.getElementById(
    "openlink-viewbackgroundimage");
  viewBackgroundImageListMenuItem.hidden = ! isViewableBackgroundImage;
  const viewBackgroundImageItem = document.getElementById(
    "context-viewbgimage");
  viewBackgroundImageItem.hidden = true;
}

/**
 * This function is called when the open link context menu pops up.
 * It decides which open link menu elements should be shown.
 * Currently, this is everything but the inappropriate foreground/background tab
 * element.
 */
function openlinkShowOpenLinkContextMenuItems()
{
  const tabsOpenInBg = Services.prefs.getBoolPref(
    "browser.tabs.loadInBackground", false);
  const openLinkListMenuItem = document.getElementById("openlink-openlinkin");
  if (openLinkListMenuItem)
  {
    //Display menu items:
    for (const elementId of gOpenlinkOpenLinkMenuMenuItems)
    {
      const menuItem = document.getElementById(elementId);
      //if (menuItem)
      {
        menuItem.hidden =
          (elementId == "openlink-openlinkinbackgroundtabmenu" &&
           tabsOpenInBg) ||
          (elementId == "openlink-openlinkinforegroundtabmenu" &&
           ! tabsOpenInBg);
      }
    }
  }
}

/**
 * This function is called when the view image context menu pops up.
 * It decides which view image menu elements should be shown.
 * Currently, this is everything but the inappropriate foreground/background tab
 * element.
 */
function openlinkShowViewImageContextMenuItems()
{
  const tabsOpenInBg = Services.prefs.getBoolPref(
    "browser.tabs.loadInBackground", false);
  //If the view image context menu is open:
  const viewImageListMenuItem = document.getElementById("openlink-viewimage");
  if (viewImageListMenuItem)
  {
    //Display menu items:
    for (const elementId of gOpenlinkViewImageMenuItems)
    {
      const menuItem = document.getElementById(elementId);
      //if (menuItem)
      {
        menuItem.hidden = (elementId == "openlink-viewimageinbackgroundtab" &&
                           tabsOpenInBg) ||
                          (elementId == "openlink-viewimageinforegroundtab" &&
                           ! tabsOpenInBg);
      }
    }
  }
}

/**
 * This function is called when the view background image context menu pops up.
 * It decides which view background image menu elements should be shown.
 * Currently, this is everything but the inappropriate foreground/background tab
 * element.
 */
function openlinkShowViewBackgroundImageContextMenuItems()
{
  const tabsOpenInBg = Services.prefs.getBoolPref(
    "browser.tabs.loadInBackground", false);
  //If the view background image context menu is open:
  const viewBackgroundImageListMenuItem = document.getElementById(
    "openlink-viewbackgroundimage");
  //if (viewBackgroundImageListMenuItem)
  {
    //Display menu items:
    for (const elementId of gOpenlinkViewBackgroundImageMenuItems)
    {
      const menuItem = document.getElementById(elementId);
      //if (menuItem)
      {
        menuItem.hidden =
          (elementId == "openlink-viewbackgroundimageinbackgroundtab" &&
           tabsOpenInBg) ||
          (elementId == "openlink-viewbackgroundimageinforegroundtab" &&
           ! tabsOpenInBg);
      }
    }
  }
}

//==============================================================================
// The openlinkOpenIn function is derived from utilityOverlay.js|openLinkIn by
// removing unneeded cases and replacing all tab/window decisions with our own.
//==============================================================================

/**
 * Derived from utilityOverlay.js|openLinkIn by removing unneeded cases and
 * replacing all tab/window decisions with our own.
 *
 * BACKGROUND WINDOW HANDLING WORKS, BUT PROCEDURE ISN'T GREAT; INVOLVES
 * REPEATEDLY FOCUSSING THE CURRENT WINDOW AFTER  THE NEW WINDOW HAS BEEN
 * OPENED.
 *
 * @param {string} url - The URL to open (as a string).
 * @param {string} where - Where to open the URL ("tab", "window", "current")
 * @param {Object} params - Object with the following parameters:
 *        charset
 *        referrerURI
 *        loadInBackground true if new tab/window is to be opened in background,
 *        false otherwise
 */
function openlinkOpenIn(url, where, params)
{
  if (! where || ! url)
  {
    return;
  }

  var aFromChrome = params.fromChrome;
  var aAllowThirdPartyFixup = params.allowThirdPartyFixup;
  var aPostData = params.postData;
  var aCharset = params.charset;
  var aReferrerURI = params.referrerURI;
  var aRelatedToCurrent = params.relatedToCurrent;

  var w = getTopWin();
  if (where == "tab" && w &&
       w.document.documentElement.getAttribute("chromehidden"))
  {
    w = getTopWin(true);
    aRelatedToCurrent = false;
  }

  if (! w || where == "window")
  {
    var sa = Cc["@mozilla.org/supports-array;1"].createInstance(
      Ci.nsISupportsArray);

    var wuri = Cc["@mozilla.org/supports-string;1"].createInstance(
      Ci.nsISupportsString);
    wuri.data = url;

    let charset = null;
    if (aCharset)
    {
      charset = Cc["@mozilla.org/supports-string;1"].createInstance(
        Ci.nsISupportsString);
      charset.data = "charset=" + aCharset;
    }

    var allowThirdPartyFixupSupports = Cc[
      "@mozilla.org/supports-PRBool;1"].createInstance(Ci.nsISupportsPRBool);
    allowThirdPartyFixupSupports.data = aAllowThirdPartyFixup;

    sa.AppendElement(wuri);
    sa.AppendElement(charset);
    sa.AppendElement(aReferrerURI);
    sa.AppendElement(aPostData);
    sa.AppendElement(allowThirdPartyFixupSupports);

    var newWindow = Services.ww.openWindow(w || window, getBrowserURL(),
      null, "chrome,dialog=no,all", sa);
    if (params.loadInBackground)
    {
      //"focus" event no longer seems to work in Fx3.5+, so use "load"
      gCurrWindow = window;
      newWindow.addEventListener("load", openlinkDoWindowFocus, false);
      setTimeout(function()
      {
        newWindow.removeEventListener("load", openlinkDoWindowFocus, false);
      }, 2000);
    }
    return;
  }

  // Decide default tab focus (case "window" has already been dispatched and
  // closed)
  var loadInBackground = params.loadInBackground === null ?
    Services.prefs.getBoolPref("browser.tabs.loadInBackground") :
    params.loadInBackground;

  if (where == "current" && w.gBrowser.selectedTab.pinned)
  {
    try
    {
      let uriObj = Services.io.newURI(url, null, null);
      if (! uriObj.schemeIs("javascript") && w.gBrowser.currentURI.host !=
        uriObj.host)
      {
        where = "tab";
        loadInBackground = false;
      }
    }
    catch (err)
    {
      where = "tab";
      loadInBackground = false;
    }
  }

  switch (where)
  {
    case "current":
      w.loadURI(url, aReferrerURI, aPostData, aAllowThirdPartyFixup);
      break;
    case "tab":
      w.gBrowser.loadOneTab(url,
                            {
                              referrerURI: aReferrerURI,
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
  // resulted in a new frontmost window (e.g. "javascript:window.open("");").
  var fm = Components.classes["@mozilla.org/focus-manager;1"].getService(
    Components.interfaces.nsIFocusManager);
  if (window == fm.activeWindow)
  {
    w.content.focus();
  }
  else
  {
    w.gBrowser.selectedBrowser.focus();
  }
}

function openlinkDoWindowFocus()
{
  gCount = 0;
  openlinkFocusCurrentWindowRepeatedly();
}

function openlinkFocusCurrentWindowRepeatedly()
{
  gCurrWindow.focus();
  if (gCount < gMAX)
  {
    ++gCount;
    var timer = Components.classes["@mozilla.org/timer;1"].createInstance(
      Components.interfaces.nsITimer);
    timer.initWithCallback(openlinkFocusCurrentWindowTriggerEvent,
                           20,
                           Components.interfaces.nsITimer.TYPE_ONE_SHOT);
  }
}

openlinkFocusCurrentWindowTriggerEvent = {
  notify: function(timer)
  {
    openlinkFocusCurrentWindowRepeatedly();
  }
};

//==============================================================================
// The openlinkOpenLinkIn function captures the behaviour of the following
// functions from nsContextMenu.js, providing a common interface:
//    openLink, openLinkInTab, openLinkInCurrent
// I have never been able to figure out how normal left-clicks on links are
// treated, so I am using nsContextMenu.js|openLinkInCurrent as the reference.
// (That latter function is new in Firefox 4, and appears to be intended for
// precisely our desired use, yet it doesn't
// appear on the standard context menu for some reason.
//==============================================================================

/**
 * @param {string} aTarget - The string "current" or "tab" or "window"
 * @param {boolean} aOpenInBackground - true if new tab is to be opened in the
                                        background, false otherwise
 */
function openlinkOpenLinkIn(aTarget, aOpenInBackground)
{
  if (! gContextMenu || ! gContextMenu.linkURL || ! gContextMenu.target ||
      ! gContextMenu.target.ownerDocument)
  {
    return;
  }

  const url = gContextMenu.linkURL;
  const aDocument = gContextMenu.target.ownerDocument;

  urlSecurityCheck(url, aDocument.nodePrincipal);
  openlinkOpenIn(url,
                 aTarget,
                 {
                   charset: aDocument.characterSet,
                   referrerURI: aDocument.documentURIObject,
                   loadInBackground: aOpenInBackground
                 });
}

//==============================================================================
// The openlinkViewImageIn function captures the behaviour of the following
// functions from nsContextMenu.js, providing a common content-agnostic
// interface:
//    viewMedia, viewBGImage
//==============================================================================

/**
 * Derived from nsContextMenu.js|viewMedia and nsContextMenu.js|viewBGImage by
 * removing all preference-checking as to whether to open in background or not
 * and replacing it with our own, and by using the openlinkOpenIn function
 *  instead of using utilityOverlay.js|openUILinkIn.
 * @param {boolean} aIsBgImage - true if object is background image,
 *                               false if normal image
 * @param {string} aTarget - The string "current" or "tab" or "window"
 * @param {boolean} aOpenInBackground - true if new tab or window is to be
 *                                      opened in background, false if
 *                                      foreground, null if no explicit
 *                                      choice desired
 */
function openlinkViewImageIn(aIsBgImage, aTarget, aOpenInBackground)
{
  if (! gContextMenu || ! gContextMenu.browser)
  {
    return;
  }

  if (! gContextMenu.target || ! gContextMenu.target.ownerDocument)
  {
    return;
  }

  const aDocument = gContextMenu.target.ownerDocument;

  var viewURL;
  if (aIsBgImage)
  {
    viewURL = gContextMenu.bgImageURL;
    urlSecurityCheck(viewURL,
                     gContextMenu.browser.contentPrincipal,
                     Ci.nsIScriptSecurityManager.DISALLOW_SCRIPT);
  }
  else
  {
    if (gContextMenu.onCanvas)
    {
      viewURL = gContextMenu.target.toDataURL();
    }
    else
    {
      viewURL = gContextMenu.mediaURL;
      urlSecurityCheck(viewURL,
                       gContextMenu.browser.contentPrincipal,
                       Ci.nsIScriptSecurityManager.DISALLOW_SCRIPT);
    }
  }

  openlinkOpenIn(viewURL,
                 aTarget,
                 {
                   charset: aDocument.characterSet,
                   referrerURI: aDocument.documentURIObject,
                   loadInBackground: aOpenInBackground
                 });
}

//==============================================================================
// Attach functionality to context menu items
//==============================================================================
/* exported openlinkOpenLinkInBackgroundTab */
function openlinkOpenLinkInBackgroundTab()
{
  openlinkOpenLinkIn("tab", true);
}

/* exported openlinkOpenLinkInForegroundTab */
function openlinkOpenLinkInForegroundTab()
{
  openlinkOpenLinkIn("tab", false);
}

/* exported openlinkOpenLinkInBackgroundWindow */
function openlinkOpenLinkInBackgroundWindow()
{
  openlinkOpenLinkIn("window", true);
}

/* exported openlinkOpenLinkHere */
function openlinkOpenLinkHere()
{
  openlinkOpenLinkIn("current", null);
}

/* exported openlinkViewImageInNewTab */
function openlinkViewImageInNewTab()
{
  openlinkViewImageIn(false, "tab", null);
}

/* exported openlinkViewImageInBackgroundTab */
function openlinkViewImageInBackgroundTab()
{
  openlinkViewImageIn(false, "tab", true);
}

/* exported openlinkViewImageInForegroundTab */
function openlinkViewImageInForegroundTab()
{
  openlinkViewImageIn(false, "tab", false);
}

/* exported openlinkViewImageInNewWindow */
function openlinkViewImageInNewWindow()
{
  openlinkViewImageIn(false, "window", false);
}

/* exported openlinkViewImageInBackgroundWindow */
function openlinkViewImageInBackgroundWindow()
{
  openlinkViewImageIn(false, "window", true);
}

/* exported openlinkViewImageHere */
function openlinkViewImageHere()
{
  openlinkViewImageIn(false, "current", null);
}

/* exported openlinkViewBackgroundImageInNewTab */
function openlinkViewBackgroundImageInNewTab()
{
  openlinkViewImageIn(true, "tab", null);
}

/* exported openlinkViewBackgroundImageInBackgroundTab */
function openlinkViewBackgroundImageInBackgroundTab()
{
  openlinkViewImageIn(true, "tab", true);
}

/* exported openlinkViewBackgroundImageInForegroundTab */
function openlinkViewBackgroundImageInForegroundTab()
{
  openlinkViewImageIn(true, "tab", false);
}

/* exported openlinkViewBackgroundImageInNewWindow */
function openlinkViewBackgroundImageInNewWindow()
{
  openlinkViewImageIn(true, "window", false);
}

/* exported openlinkViewBackgroundImageInBackgroundWindow */
function openlinkViewBackgroundImageInBackgroundWindow()
{
  openlinkViewImageIn(true, "window", true);
}

/* exported openlinkViewBackgroundImageHere */
function openlinkViewBackgroundImageHere()
{
  openlinkViewImageIn(true, "current", null);
}
