/*
 * Copyright (c) 2022 Christian Wittenberg
 *
 * thisipcan.cyou gnome extension is free software; you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by the
 * Free Software Foundation; either version 3 of the License, or (at your
 * option) any later version.
 *
 * thisipcan.cyou gnome extension is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY
 * or FITNESS FOR A PARTICULAR PURPOSE.  See the GNU General Public License
 * for more details.
 *
 * You should have received a copy of the GNU General Public License along
 * with Gnome Documents; if not, write to the Free Software Foundation,
 * Inc., 51 Franklin St, Fifth Floor, Boston, MA  02110-1301  USA
 *
 * Author:
 * Christian Wittenberg <gnome@ipcan.cyou>
 *
 */
const {
    St,
    Clutter,
    Gio,
    Soup,
    GLib
} = imports.gi;
const Mainloop = imports.mainloop;
const Main = imports.ui.main;
const Util = imports.misc.util;
const MessageTray = imports.ui.messageTray;

const thisExtensionDir = GLib.get_home_dir() + '/.local/share/gnome-shell/extensions/external-ip-extension@ipcan.cyou';
const iconLocation = thisExtensionDir + '/img/ip.svg';
const extIpService = 'http://thisipcan.cyou';

let panelButton = null;
let panelButtonText = null;
let sourceLoopID = null;
let messageTray = null;

let currentIP = ""; // stores previously detected external ip
let disabled = false; // stop processing if extension is disabled
let elapsed = 0; // time elapsed before next external ip check
let timeout = 60 * 2; // be friendly, refresh every 2 mins.

// returns raw HTTP response
function httpRequest(url, type = 'GET') {
    let soupSyncSession = new Soup.SessionSync();
    let message = Soup.Message.new(type, url);

    message.request_headers.set_content_type("application/json", null);
    let responseCode = soupSyncSession.send_message(message);
    let out;
    if (responseCode == 200) {
        try {
            out = message['response-body'].data
        } catch (error) {
            log(error);
        }
    }
    return out;
}

// Create GNOME Notification
// inspired by: https://gitlab.gnome.org/GNOME/gnome-shell/-/blob/a3c84ca7463ed92b5be6f013a12bce927223f7c5/js/ui/main.js#L509
// modified: 
// - added icon specifics. 
// - added global messagetray destination.
function notify(title, msg) {
    const file = Gio.File.new_for_path(iconLocation);
    const icon = new Gio.FileIcon({
        file
    });

    let source = new MessageTray.Source(title);
    
    //ensure notification is added to GNOME message tray
    Main.messageTray.add(source);

    messageTray.add(source);
    let notification = new MessageTray.Notification(source, title, msg, {
        gicon: icon,
        bannerMarkup: true
    });
    notification.setTransient(false);
    source.showNotification(notification);
}

// gets external IP and updates label in toolbar
// if changed, show GNOME notification
function refreshIP() {
    let ipAddress = httpRequest(extIpService);

    if (currentIP != "" && currentIP != ipAddress) {
        //new ip address found.
        log('Note: External IP address has been changed into ' + ipAddress + ", trigger GNOME notification")        
        notify('External IP Address', 'Has been changed to ' + ipAddress);
    }

    currentIP = ipAddress;

    panelButtonText = new St.Label({
        text: ipAddress,
        y_align: Clutter.ActorAlign.CENTER,
    });
    panelButton.set_child(panelButtonText);
}

// wait until time elapsed, to be friendly to external ip url
function timer() {
    if (!disabled) {
        if (elapsed >= timeout) {
            elapsed = 0;

            refreshIP();
        } else {
            elapsed++;
        }

        sourceLoopID = Mainloop.timeout_add_seconds(1, function() {
            return timer();
        });
    }    
}

function init() {}

function enable() {
    disabled = false;

    // Prepare UI
    messageTray = new MessageTray.MessageTray()    
    panelButton = new St.Bin({
        style_class: "panel-button",
    });
    let panelButtonText = new St.Label({
        text: "IP: <checking>",
        y_align: Clutter.ActorAlign.CENTER,
    });
    panelButton.set_child(panelButtonText);

    // After enabling, immediately get ip
    refreshIP();

    // Enable timer
    timer();

    // Add the button to the panel
    Main.panel._rightBox.insert_child_at_index(panelButton, 0);
}

function disable() {
    // Set to true so if the timer hits, stop.
    disabled = true;

    // clear messagetray
    messageTray = null;

    // Remove timer loop altogether
    if (sourceLoopID) {
        GLib.Source.remove(sourceLoopID);
        sourceLoopID = null;
    }

    // Remove the added button from panel
    Main.panel._rightBox.remove_child(panelButton);
}