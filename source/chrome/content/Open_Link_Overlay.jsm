/* jshint globalstrict: true */
/* eslint-disable strict */
"use strict";

//Note: This uses stuff from the global window object, to whit:
//
//gContextMenu
//urlSecurityCheck
//openLinkIn
//
//Treat with care as neither appear to be documented

/* eslint-disable array-bracket-newline */
/* exported EXPORTED_SYMBOLS */
const EXPORTED_SYMBOLS = [
  "Open_Link_Overlay", /* exported Open_Link_Overlay */
];
/* eslint-enable array-bracket-newline */

//For some reason I don't understand, with env browser set, Cu.import is
//recognised as importing the symbol with the name of the module. But not if
//not in browser mode. However, that mode enables a lot of other things that
//shouldn't be enabled.

/* global PrivateBrowsingUtils */
Components.utils.import("resource://gre/modules/PrivateBrowsingUtils.jsm");

const { console } = Components.utils.import(
  "resource://gre/modules/Console.jsm",
  {}
);

const { setTimeout } = Components.utils.import(
  "resource://gre/modules/Timer.jsm",
  {}
);

const Window_Watcher = Components.classes[
  "@mozilla.org/embedcomp/window-watcher;1"].getService(
  Components.interfaces.nsIWindowWatcher);

const Prefs = Components.classes[
  "@mozilla.org/preferences-service;1"].getService(
  Components.interfaces.nsIPrefService).getBranch("openlink.");

const Prefs_Tabs = Components.classes[
  "@mozilla.org/preferences-service;1"].getService(
  Components.interfaces.nsIPrefService).getBranch("browser.tabs.");

//List of items I add to the popup menu
const open_link_menu_items = [
  "openlink-openlinkin-background-tab",
  "openlink-openlinkin-foreground-tab",
  "openlink-openlinkin-background-window",
  "openlink-openlinkin-current-tab"
];

//List of other things in the context menu which might need to be hidden
const global_menu_items = [
  //"context-openlinkincurrent", only available for plain text?
  "context-openlinkintab",
  //tm-linkWithHistory (duplicated tab)
  //tm-openAllLinks  (this tab)
  //tm-openinverselink (other [b/g vs f/g] tab)
  "context-openlink",
  //context-openlinkprivate <== we should implement this
];

/** A wrapper for event listeners that catches and logs the exception
 * Used mainly because the only information you get in the console is the
 * exception text which is next to useless.
 *
 * @param {Function} func - function to call
 * @param {Object} object - object to which to bind call
 * @param {Object} params - extra params to function call
 *
 * @returns {Function} something that can be called
 */
function event_binder(func, object, ...params)
{
  if (func === undefined)
  {
    throw new Error("Attempting to bind undefined function");
  }
  return (...args) =>
  {
    try
    {
      func.bind(object, ...params)(...args);
    }
    catch (err)
    {
      console.log(err);
    }
  };
}

/** Add event listeners taking care of binding
 *
 * @param {Object} object - the class to which to bind all the listeners
 * @param {Document} document - the dom to which to listen
 * @param {Array} listeners - the listeners to add. This is an array of arrays,
 *                            element 0: The node id
 *                            element 1: The event to listen for
 *                            element 2: method to call. This will be bound to
 *                            the object
 *                            elements 3: extra parameters to pass to the method
 *
 * @returns {Array} A list of event handlers to pass to remove_event_listeners
 */
function add_event_listeners(object, document, ...listeners)
{
  const to_remove = [];
  for (const listener of listeners)
  {
    const node = typeof listener[0] == "string" ?
      document.getElementById("openlink-" + listener[0]) :
      listener[0];
    if (node == null)
    {
      console.log(listener);
    }
    const event = listener[1];
    /*jshint -W083*/
    const method = event_binder(listener[2], object, ...listener.slice(3));
    /*jshint -W083*/
    node.addEventListener(event, method);
    to_remove.push({ node, event, method });
  }
  return to_remove;
}

/** The counterpart to add_event_listeners, which can be called to deregister
 * all the registered event listeners
 *
 * @param {Array} listeners - result of calling add_event_listeners
 */
function remove_event_listeners(listeners)
{
  for (const listener of listeners)
  {
    listener.node.removeEventListener(listener.event, listener.method);
  }
}

/** The main module for the extension
 *
 * @param {Object} document - main window document
 */
function Open_Link_Overlay(document)
{
  this._document = document;
  this._window = document.defaultView;

  /* eslint-disable array-bracket-newline */
  this._event_listeners = add_event_listeners(
    this,
    null,
    [ this._window, "load", this._window_loaded ]
  );
  /* eslint-enable array-bracket-newline */
  this.observe = event_binder(this._observe, this);
  this._on_window_load = event_binder(this.__on_window_load, this);
}

Object.assign(Open_Link_Overlay.prototype, {

  /** Called when window has finished loading. Add listeners
   *
   * @param {LoadEvent} _event - window load
  */
  _window_loaded(_event)
  {
    remove_event_listeners(this._event_listeners);

    //At this point we could/should check if the current version is different to
    //the previous version and throw up a web page

    //Note: It is arguably bad practice decoding the node IDs to determine what
    //we are actually going to do, but it avoids massive amounts of repetetive
    //code

    //FIXME This looks like something that could be automatically generated.
    this._event_listeners = add_event_listeners(
      this,
      this._document,
      [ this._window, "unload", this._stop_extension ],
      [
        this._document.getElementById("contentAreaContextMenu"),
        "popupshowing",
        this._show_context_menu
      ],
      [ "open-link", "popupshowing", this._set_popup_entries ],
      [ "view-image", "popupshowing", this._set_popup_entries ],
      [ "view-backgroundimage", "popupshowing", this._set_popup_entries ],
      //Normal context menu
      [ "openlinkin-background-tab", "command", this._open_link_in ],
      [ "openlinkin-foreground-tab", "command", this._open_link_in ],
      [ "openlinkin-background-window", "command", this._open_link_in ],
      [ "openlinkin-current-tab", "command", this._open_link_in ],
      //submenu entries
      [ "open-link-in-new-tab", "command", this._open_link_in ],
      [ "open-link-in-background-tab", "command", this._open_link_in ],
      [ "open-link-in-foreground-tab", "command", this._open_link_in ],
      [ "open-link-in-new-window", "command", this._open_link_in ],
      [ "open-link-in-background-window", "command", this._open_link_in ],
      [ "open-link-in-current-tab", "command", this._open_link_in ],
    );
    for (const type of [ "image", "backgroundimage" ])
    {
      for (const where of [ "new", "current", "background", "foreground" ])
      {
        for (const mode of [ "tab", "window" ])
        {
          if (mode == "window" && (where == "current" || where == "foreground"))
          {
            //Current window doesn't make much sense
            continue;
          }
          this._event_listeners.push(
            ...add_event_listeners(
              this,
              this._document,
              [
                "view-" + type + "-in-" + where + "-" + mode,
                "command",
                this._open_image_in,
              ]
            )
          );
        }
      }
    }
  },

  /** Called on shutdown
   *
   * @param {UnloadEvent} _event - window unload
   */
  _stop_extension(_event)
  {
    remove_event_listeners(this._event_listeners);
  },

  /** Context menu being displayed
   *
   * It decides which open link menu elements should be shown.
   *
   * @param {MouseEvent} event - popupshowing event
   */
  _show_context_menu(event)
  {
    //When submenus are accessed we can come back through here.
    if (event.target.id != "contentAreaContextMenu")
    {
      return;
    }

    const document = this._document;
    if (document.getElementById("context-sep-open").hidden)
    {
      //Main open is hidden - hide all mine
      for (const elementId of open_link_menu_items)
      {
        document.getElementById(elementId).hidden = true;
      }
      document.getElementById("openlink-open-link").hidden = true;
    }
    else if (Prefs.getBoolPref("useSubmenuForLinks", false))
    {
      //Displaying everything in a submenu - hide all mine and hide all system
      for (const elementId of open_link_menu_items)
      {
        document.getElementById(elementId).hidden = true;
      }
      for (const elementId of global_menu_items)
      {
        document.getElementById(elementId).hidden = true;
      }
      document.getElementById("openlink-open-link").hidden = false;
    }
    else
    {
      //Yes. This does look extremely like _set_popup_entries
      const id = "openlink-openlinkin-";

      const open_in_bg = Prefs_Tabs.getBoolPref("loadInBackground", false);

      document.getElementById(id + "background-tab").hidden = open_in_bg;
      document.getElementById(id + "foreground-tab").hidden = ! open_in_bg;

      const is_private = PrivateBrowsingUtils.isWindowPrivate(this._window);
      //document.getElementById(id + "new-window").hidden = is_private;
      document.getElementById(id + "background-window").hidden = is_private;

      document.getElementById("openlink-open-link").hidden = true;
    }

    //Display view image context menu if user is on a viewable image
    const view_image = document.getElementById("context-viewimage");
    document.getElementById("openlink-view-image").hidden = view_image.hidden;
    view_image.hidden = true;

    //Display view background image context menu if user is on a viewable
    //background image:
    const view_bg_image = document.getElementById("context-viewbgimage");
    document.getElementById("openlink-view-backgroundimage").hidden =
      view_bg_image.hidden || view_bg_image.disabled;
    view_bg_image.hidden = true;
  },

  /** Generic code for handling disabling inappropriate menu entries
   *
   * @param {MouseEvent} event - popup showing event
   */
  _set_popup_entries(event)
  {
    const id = event.target.parentNode.id + "-in-";

    const open_in_bg = Prefs_Tabs.getBoolPref("loadInBackground", false);

    this._document.getElementById(id + "background-tab").hidden = open_in_bg;
    this._document.getElementById(id + "foreground-tab").hidden = ! open_in_bg;

    const is_private = PrivateBrowsingUtils.isWindowPrivate(this._window);
    this._document.getElementById(id + "new-window").hidden = is_private;
    this._document.getElementById(id + "background-window").hidden = is_private;
  },

  /** General event handler for pretty much everything involving a link
   *
   * This more or less does the same as the default context menu items with a
   * little tweaking for allowing background tabs and so on
   *
   * @param {XULCommandEvent} event - Command event
   */
  _open_link_in(event)
  {
    const id = event.target.id.split("-");
    const where = id[id.length - 2];
    const mode = id[id.length - 1];

    const context_menu = this._window.gContextMenu;

    //This check is probably extreme paranoia
    if (! context_menu ||
        ! context_menu.linkURL ||
        ! context_menu.target ||
        ! context_menu.target.ownerDocument)
    {
      return;
    }

    const url = context_menu.linkURL;
    const document = context_menu.target.ownerDocument;

    this._window.urlSecurityCheck(url, document.nodePrincipal);

    this._open_link_open_in(url, where, mode, document);
  },

  /** General event handler for foreground/background images
   *
   * @param {XULCommandEvent} event - Command event
   */
  _open_image_in(event)
  {
    const id = event.target.id.split("-");
    const type = id[2];
    const where = id[4];
    const mode = id[5];

    const context_menu = this._window.gContextMenu;
    if (! context_menu ||
        ! context_menu.browser ||
        ! context_menu.target ||
        ! context_menu.target.ownerDocument)
    {
      return;
    }

    const document = context_menu.target.ownerDocument;

    const viewURL =
      type == "backgroundimage" ? context_menu.bgImageURL :
      context_menu.onCanvas ? context_menu.target.toDataURL() :
      context_menu.mediaURL;

    //For reasons that are unclear this check fails if you have a chrome:: url
    //moreover, if you disable the check (or use + ALLOW_CHROME) and launch in a
    //tab, the tab doesn't actually load the image
    this._window.urlSecurityCheck(
      viewURL,
      context_menu.browser.contentPrincipal,
      Components.interfaces.nsIScriptSecurityManager.DISALLOW_SCRIPT
    );

    this._open_link_open_in(viewURL, where, mode, document);
  },

  /** Wrapper round openUILinkIn
   *
   * BACKGROUND WINDOW HANDLING WORKS, BUT PROCEDURE ISN'T GREAT; INVOLVES
   * REPEATEDLY FOCUSSING THE CURRENT WINDOW AFTER  THE NEW WINDOW HAS BEEN
   * OPENED.
   *
   * @param {string} url - The URL to open (as a string).
   * @param {string} where - Where to open the URL
   *                         "new", "background", "foreground", "current"
   * @param {string} mode - "tab", "window"
   * @param {Object} document - document containing the link
   */
  _open_link_open_in(url, where, mode, document)
  {
    let target = where == "current" ? "current" : mode;
    const load_in_background = where == "background";
    if (target == "tab" && where != "new")
    {
      const open_in_bg = Prefs_Tabs.getBoolPref("loadInBackground", false);
      if (load_in_background !== open_in_bg)
      {
        target = "tabshifted";
      }
    }
    else if (target == "window" && load_in_background)
    {
      //Looks like we'll have to register a notifier as we can't override
      //Services.ww (at least, not safely) in order to get which window was
      //opened. There is a fairly high chance it's the one we've just opened
      //though.
      this._window.gCurrWindow = this._window;
      Window_Watcher.registerNotification(this);
    }

    this._window.openLinkIn(url,
                            target,
                            {
                              charset: document.characterSet,
                              referrerURI: document.documentURIObject,
                              originPrincipal: document.nodePrincipal,
                              triggeringPrincipal: document.nodePrincipal
                            });
  },

  /** Called from window watcher
   *
   * @param {Object} window - the window on which an event happened
   * @param {string} topic - the vent that happened
   * @param {string} _data - indeterminate data
   */
  _observe(window, topic, _data)
  {
    if (topic == "domwindowopened")
    {
      Window_Watcher.unregisterNotification(this);
      //The "focus" event seems to be somewhat erratic. I've tried using it,
      //but even if I blur the window after it loads, it gets focus again
      //twice. After the 2nd focus, it no longer seems to get a focus event
      //So we end up with this contortion of focussing the current window
      //a bunch of times.
      window.addEventListener("load", this._on_window_load);
    }
  },

  /** Called when a (probably opened by me) window finishes loading so I can
   *  start sending the original window back to the front.
   *
   * @param {Event} event - window load event
   */
  __on_window_load(event)
  {
    event.currentTarget.removeEventListener("load", this.__on_window_load);
    this._fg_attempts = 50;
    this._focus_window();
  },

  /** Sends the current window to the foreground.
   *
   * Repeatedly calls itself after a timeout
   */
  _focus_window()
  {
    this._window.focus();
    if (this._fg_attempts > 0)
    {
      this._fg_attempts -= 1;
      setTimeout(event_binder(this._focus_window, this), 20);
    }
  },

});
