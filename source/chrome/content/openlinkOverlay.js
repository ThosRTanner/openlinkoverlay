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

//Standard firefox globals - should probably be in eslint setup.
/* globals Cc, Ci */

const openlink = {};

Components.utils.import("chrome://openlink/content/Open_Link_Overlay.jsm",
                        openlink);

openlink.object = new openlink.Open_Link_Overlay(document);

var gCount;
const gMAX = 50;
var gCurrWindow;
var openlinkFocusCurrentWindowTriggerEvent;

/* global Services */
Components.utils.import("resource://gre/modules/Services.jsm");

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
  //This check doesn't make much sense
  if (! url)
  {
    return;
  }

  //Never set
  var aAllowThirdPartyFixup = params.allowThirdPartyFixup;
  //Never set
  var aPostData = params.postData;
  var aCharset = params.charset;
  var aReferrerURI = params.referrerURI;
  //never set
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
      //The "focus" event seems to be somewhat erratic. I've tried using it,
      //but even if I blur the window after it loads, it gets focus again
      //twice. After the 2nd focus, it no longer seems to get a focus event
      //So we end up with this contortion of focussing the current window
      //a bunch of times.
      gCurrWindow = window;
      newWindow.addEventListener("load", openlinkDoWindowFocus, false);
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
    default:
      break;

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

function openlinkDoWindowFocus(event)
{
  event.currentTarget.removeEventListener("load", openlinkDoWindowFocus);
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
