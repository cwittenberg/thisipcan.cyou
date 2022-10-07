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
    GLib,
    GObject
} = imports.gi;
const Mainloop = imports.mainloop;
const Main = imports.ui.main;
const Util = imports.misc.util;
const MessageTray = imports.ui.messageTray;
const PopupMenu = imports.ui.popupMenu;
const PanelMenu = imports.ui.panelMenu;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
const thisExtensionDir = Me.path;
const iconLocation = thisExtensionDir + '/img/ip.svg';

const extIpService = 'https://thisipcan.cyou/json';
const extCountryFlagService = 'https://thisipcan.cyou/flag-<countrycode>';

let debug = false;
let panelButton = null;
let panelButtonText = null;
let panelIcon = null;
let sourceLoopID = null;
let messageTray = null;

let currentIP = ""; // stores previously detected external ip
let disabled = false; // stop processing if extension is disabled
let elapsed = 0; // time elapsed before next external ip check
let timeout = 60 * 10; // be friendly, refresh every 10 mins.
let minTimeBetweenChecks = 4; //in seconds, to avoid network event induced IP re-checks occur too frequent

// Network event monitoring
const GnomeSession = imports.misc.gnomeSession;
let network_monitor = null;
let presence = null;
let presence_connection = null;
let network_monitor_connection = null;

let networkEventRefreshTimeout = 4;
let networkEventRefreshLoopID = null;

// In case of a network event, inquire external IP.
function _onNetworkStatusChanged(status=null) {
    /*let _idle = false;

    if (status == GnomeSession.PresenceStatus.IDLE) {
        let _idle = true;
    }*/


    if(status != null) {
        lg("Network event has been triggered. Re-check ext. IP");
        
        if(status.get_network_available()) {
            lg("Network is now available... rechecking IP, give it a few secs");
                         
            networkEventRefreshLoopID = Mainloop.timeout_add_seconds(networkEventRefreshTimeout, function() {         
                lg("Network event triggered refresh");
                refreshIP();
            });   
        }
    }
}

function lg(s) {
    if (debug == true) log("===" + Me.metadata['gettext-domain'] + "===>" + s);
}

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
            lg(error);
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

function getFlagUrl(countryCode) {
    return extCountryFlagService.replace("<countrycode>", countryCode.toLowerCase());
}

// gets external IP and updates label in toolbar
// if changed, show GNOME notification
let lastCheck = 0;
let locationIP = null; 
function refreshIP() {

    let t = new Date().getTime();
    if(t - lastCheck <= minTimeBetweenChecks * 1000)  {        
        return;
    } else {

        lastCheck = t;
        
        let resp = httpRequest(extIpService);        

        if(resp == null || resp == "") { 
            lg("Null response received");
            return;
        } else {
            lg("JSON response (" + extIpService + "):");
            lg(resp);
        }

        locationIP = JSON.parse(resp);        

        if (currentIP != "" && currentIP != locationIP.ipAddress) {
            //new ip address found.
            lg('Note: External IP address has been changed into ' + locationIP.ipAddress + ", trigger GNOME notification")        
            notify('External IP Address', 'Has been changed to ' + locationIP.ipAddress);
        }

        currentIP = locationIP.ipAddress;

        lg("New IP: " + currentIP + " - " + locationIP.countryName + " (" + locationIP.countryCode + ")");

        lg(getFlagUrl(locationIP.countryCode));

        panelButton.update(currentIP, locationIP.countryCode);
    }

    return true;
}

// wait until time elapsed, to be friendly to external ip url
function timer() {    
    if (!disabled) {
        sourceLoopID = Mainloop.timeout_add_seconds(timeout, function() {            
            ipPromise().then(result => {
                lg('reinvoke');

                //reinvoke itself                    
                timer();                                
            }).catch(e => {                
                lg('Error occured in ipPromise');                
                timer();                             
            });            
        });
    }    
}

// Run polling procedure completely async 
function ipPromise() {
    return new Promise((resolve, reject) => {        
        if(refreshIP()) {
            resolve("success");
        } else {
            reject("error");
        }
    });
}

function init() {}

// Download application specific icons from Pushover and cache locally
// This to prevent unwanted load on Pushover.net
function getCachedFlag(country) {
    let iconFileDestination = thisExtensionDir + '/flags/' + country + '.svg';

    const cwd = Gio.File.new_for_path(thisExtensionDir + "/flags/");
    const newFile = cwd.get_child(country + ".svg");

    // detects if icon is cached (exists)
    const fileExists = newFile.query_exists(null);

    if (!fileExists) {
        // download and save in cache folder
        // do this synchronously to ensure notifications always get a logo
        let _httpSession = new Soup.SessionSync();

        let url = getFlagUrl(country);
        let message = Soup.Message.new('GET', url);
        let responseCode = _httpSession.send_message(message);
        let out = null;
        let resp = null;
        if (responseCode == 200) {
            try {
                let bytes = message['response-body'].flatten().get_data();
                const file = Gio.File.new_for_path(iconFileDestination);
                const [, etag] = file.replace_contents(bytes, null, false, Gio.FileCreateFlags.REPLACE_DESTINATION, null);
            } catch (e) {
                lg("Error in cached flag");
                lg(e);
            }
        }

    } else {
        // icon is readily cached, return from icons folder locally        
    }

    return iconFileDestination;
}

let menu=null;
let btn = null;
const Indicator = GObject.registerClass(
    class Indicator extends PanelMenu.Button {              
        
        update(ip, country) {                        
            //cache locally            
            let flagURL = getCachedFlag(country.toLowerCase());            

            btn.set_style('background-image: url("' + flagURL + '");');
            btn.set_label(ip);     
        }

        _init(ip="", country="gb") {
            var that = this;
            super._init(0.0, _(Me.metadata['name']));
            
            btn = new St.Button();            
            btn.set_style_class_name("notifyIcon");
            
            this.update(ip, country);
                
            this.connect('button-press-event', this._onButtonClicked);
            btn.connect('button-press-event', this._onButtonClicked);

            this.add_child(btn);                        

            menu = this.menu;

            let settingsItem = new PopupMenu.PopupMenuItem(_('Settings'));
            settingsItem.connect('activate', (item, event) => {
                ExtensionUtils.openPrefs();

                return Clutter.EVENT_PROPAGATE;
            });
            menu.addMenuItem(settingsItem);       

        }

        _onButtonClicked(obj, e) {            
            let container = obj;
            if(obj.menu == null) {
                //left button                
                obj = obj.get_parent();
            }            

            //re-add to reflect change in separatormenuitem
            obj.menu.removeAll();                        
            let copyBtn = new PopupMenu.PopupMenuItem(_("Copy IP"));
            copyBtn.connect('activate', (item, event) => {
                //copy IP to clipboard
                St.Clipboard.get_default().set_text(St.ClipboardType.CLIPBOARD, locationIP.ipAddress);

                return Clutter.EVENT_PROPAGATE;
            });
            obj.menu.addMenuItem(copyBtn);                                    
            obj.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem(_(locationIP.countryName + " (" + locationIP.countryCode + "), " + _(locationIP.cityName))));            
            
            obj.menu.toggle();            
        }
    }
);

function enable() {
    disabled = false;

    // Prepare UI
    messageTray = new MessageTray.MessageTray()    
    panelButton = new Indicator("");

    // After enabling, immediately get ip
    refreshIP();

    // Enable timer
    timer();

    // Add the button to the panel    
    let uuid = Me.metadata['name'].uuid;        
    Main.panel.addToStatusArea(uuid, panelButton, 0, 'right');    

    // Enable network event monitoring
    network_monitor = Gio.network_monitor_get_default();
    presence = new GnomeSession.Presence((proxy, error) => {
        _onNetworkStatusChanged(proxy.status);
    });    
    presence_connection = presence.connectSignal('StatusChanged', (proxy, senderName, [status]) => {
        _onNetworkStatusChanged(status);
    });    
    network_monitor_connection = network_monitor.connect('network-changed', _onNetworkStatusChanged);
}

function disable() {
    // Set to true so if the timer hits, stop.
    disabled = true;

    // clear messagetray
    messageTray = null;

    // clear UI widgets
    // Remove the added button from panel
    // bugfix: remove panelButton before setting to null    
    Main.panel.remove_child(panelButton);
    panelButton.destroy();

    panelButton = null;
    panelButtonText = null;

    btn=null;

    locationIP=null;

    // Cleanup network monitor properly
    presence.disconnectSignal(presence_connection);    
    network_monitor.disconnect(network_monitor_connection);
    network_monitor = null;
    presence = null;

    // Remove timer for network events
    if (networkEventRefreshLoopID) {
        GLib.Source.remove(networkEventRefreshLoopID);
        networkEventRefreshLoopID = null;
    }

    // Remove timer loop altogether
    if (sourceLoopID) {
        GLib.Source.remove(sourceLoopID);
        sourceLoopID = null;
    }    
}