/**
 * Summary
 * -------
 *
 * The browser automatically shows context menu items to open links in a new tab
 * or a new window.  This add-on adds others, including background window and
 * the opposite of context-openlinkintab.
 *
 * We also provide the option of moving all the open link items into a submenu,
 * to reduce clutter for those who like ultra-compact menus.
 *
 * Finally, we provide similar submenus for images and background images, while
 * removing the default menu item for 'view image' and 'view background image'
 * (since if we are providing a submenu, we might as well put everything into
 * it).
 *
 */

/*jshint browser: true, devel: true */
/*eslint-env browser */

const openlink = {};

Components.utils.import("chrome://openlink/content/Open_Link_Overlay.jsm",
                        openlink);

openlink.object = new openlink.Open_Link_Overlay(document);
