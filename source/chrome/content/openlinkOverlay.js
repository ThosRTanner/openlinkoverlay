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

//Standard firefox globals - should probably be in eslint setup.
/* globals Cc, Ci */

const openlink = {};

Components.utils.import("chrome://openlink/content/Open_Link_Overlay.jsm",
                        openlink);

openlink.object = new openlink.Open_Link_Overlay(document);


//These are the items in the context menu to disable/enable if we have a
//submenu.
const gOpenlinkOpenLinkMenuItems = [
  //"context-openlinkincurrent", only available for plain text?!
  "context-openlinkintab",
  //tm-linkWithHistory (duplicated tab)
  //tm-openAllLinks  (this tab)
  //tm-openinverselink (other [b/g vs f/g] tab)
  "context-openlink",
  //context-openlinkprivate <== we should implement this
  "openlink-openlinkin-background-tab", //from openlinkintab
  "openlink-openlinkin-foreground-tab", //ditto
  "openlink-openlinkin-background-window", //from openlink
  "openlink-openlinkin-current-tab" //from openlinkincurrent which I don't understand why isnt visible
];

var gCount;
const gMAX = 50;
var gCurrWindow;
var openlinkFocusCurrentWindowTriggerEvent;

Components.utils.import("resource://gre/modules/PrivateBrowsingUtils.jsm");
Components.utils.import("resource://gre/modules/Services.jsm");

window.addEventListener("load", openlinkInit, false);

/**
 * Registers a listener so that we can specify a function to be called when the
 * context area menu or the view image list menus pop up.
 */
function openlinkInit()
{
  const menu = document.getElementById("contentAreaContextMenu");
  menu.addEventListener(
    "popupshowing",
    openlinkShowContentAreaContextMenuItemsOnSuitableElements);
}

//==============================================================================
// Handle context menus
//==============================================================================

/**
 * This function is called when the context area menu pops up.
 * It decides which open link menu elements should be shown.
 *
 * @param {MouseEvent} event - popupshowing event
 */
function openlinkShowContentAreaContextMenuItemsOnSuitableElements(event)
{
  //FIXME there should be a way of getting hold of the context menu that doesn't
  //involve this.
  //If the page context menu is open:
  if (! gContextMenu)
  {
    return;
  }

  //When submenus are accessed we can come back through here.
  if (event.target.id != "contentAreaContextMenu")
  {
    return;
  }

  if (document.getElementById("context-sep-open").hidden)
  {
    //Main open is hidden - hide all mine (we should only do this for actually
    //mine - FIXME
    for (const elementId of gOpenlinkOpenLinkMenuItems)
    {
      const menuItem = document.getElementById(elementId);
      menuItem.hidden = true;
    }
    const openLinkListMenuItem = document.getElementById("openlink-open-link");
    openLinkListMenuItem.hidden = true;
  }
  else
  {
    const private_window = PrivateBrowsingUtils.isWindowPrivate(window);

    const tabsOpenInBg = Services.prefs.getBoolPref(
      "browser.tabs.loadInBackground", false);

    const prefs = Components.classes["@mozilla.org/preferences-service;1"].
      getService(Components.interfaces.nsIPrefService).getBranch("openlink.");
    const wantSubmenu =
      prefs.getPrefType("useSubmenuForLinks") == prefs.PREF_BOOL &&
      prefs.getBoolPref("useSubmenuForLinks", false);
    //Display menu items accordingly:
    for (const elementId of gOpenlinkOpenLinkMenuItems)
    {
      const menuItem = document.getElementById(elementId);
      /* eslint-disable no-extra-parens */
      if ((elementId == "openlink-openlinkin-background-tab" && tabsOpenInBg) ||
          (elementId == "openlink-openlinkin-foreground-tab" &&
           ! tabsOpenInBg) ||
          (elementId == "openlink-openlinkin-background-window" &&
           private_window) ||
          wantSubmenu)
      /* eslint-enable no-extra-parens */
      {
        menuItem.hidden = true;
      }
      else
      {
        menuItem.hidden = false;
      }
    }

    //Display open link context menu accordingly:
    document.getElementById("openlink-open-link").hidden = ! wantSubmenu;
  }

  //Display view image context menu if user is on a viewable image
  const view_image = document.getElementById("context-viewimage");
  document.getElementById("openlink-view-image").hidden = view_image.hidden;
  view_image.hidden = true;

  //Display view background image context menu if user is on a viewable
  //background image:
  const view_bg_image = document.getElementById("context-viewbgimage");
  document.getElementById("openlink-view-backgroundimage").hidden =
    view_bg_image.hidden;
  view_bg_image.hidden = true;
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
