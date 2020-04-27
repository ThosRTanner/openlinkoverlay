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
var gObserver;
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
 * @param {bool} load_in_background - set to true if to load tab/window in bg,
 *                                    false if to load in foreground
 *                                    null to use current default
 * @param {Object} document - document containing the link
 */
function openlinkOpenIn(url, where, load_in_background, document)
{
  if (where == "tab" && load_in_background !== null)
  {
    var def_load = Services.prefs.getBoolPref("browser.tabs.loadInBackground");
    if (load_in_background != def_load)
    {
      where = "tabshifted";
    }
  }
  else if (where == "window" && load_in_background)
  {
    //Looks like we'll have to register a notifier as we can't override
    //Services.ww (at least, not safely) in order to get which window was
    //opened. There is a fairly high chance it's the one we've just opened
    //though.
    var ww = Components.classes[
      "@mozilla.org/embedcomp/window-watcher;1"].getService(
      Components.interfaces.nsIWindowWatcher);

    const MyWindowObserver = () =>
    {
      this.observe = (window, topic, _data) =>
      {
        if (topic == "domwindowopened")
        {
          //The "focus" event seems to be somewhat erratic. I've tried using it,
          //but even if I blur the window after it loads, it gets focus again
          //twice. After the 2nd focus, it no longer seems to get a focus event
          //So we end up with this contortion of focussing the current window
          //a bunch of times.
          ww.unregisterNotification(gObserver);
          window.addEventListener("load", openlinkDoWindowFocus);
        }
      };
    };

    gCurrWindow = window;
    gObserver = new MyWindowObserver();
    ww.registerNotification(gObserver);
  }

  openUILinkIn(url,
               where,
               {
                 charset: document.characterSet,
                 referrerURI: document.documentURIObject,
                 originPrincipal: document.nodePrincipal,
                 triggeringPrincipal: document.nodePrincipal
              }
  );
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
