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

notification_msg_sources = new Set();   // stores IDs of previously displayed notifications (for providing a handle to destruction)

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
const thisExtensionDir = Me.path;

const extIpService = 'https://thisipcan.cyou/json';
const extIpServiceASN = 'https://thisipcan.cyou/';
const extIpServiceStaticMap = 'https://staticmap.thisipcan.cyou/';
const extCountryFlagService = 'https://thisipcan.cyou/flag-<countrycode>';

let debug = false;
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

let isIdle = false;

let menu=null;
let btn = null;
let panelButton = null;
let popup_icon = null;

let Indicator = GObject.registerClass(
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
        }        

        _onButtonClicked(obj, e) {            
            let container = obj;
            if(obj.menu == null) {
                //left button                
                obj = obj.get_parent();
            }            

            //re-add to reflect change in separatormenuitem
            obj.menu.removeAll();                        
           
            obj.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem(_("Click to copy to clipboard")));                 

            let copyTextFunction = function(item, event) {                                
                St.Clipboard.get_default().set_text(St.ClipboardType.CLIPBOARD, item.label.text);
                return Clutter.EVENT_PROPAGATE;
            };
                                    
            let copyBtn = new PopupMenu.PopupImageMenuItem(_(locationIP.ipAddress), getIcon("ip_ed.svg"), { style_class: 'ipMenuItem'});
            copyBtn.connect('activate', copyTextFunction);
            obj.menu.addMenuItem(copyBtn);                                                              
            
            //retrieve ASN / org details            
            let asnText = httpRequest(extIpServiceASN, "GET");
            if(asnText != "" && asnText != null) {
                let asn = JSON.parse(asnText);
                
                if("hostname" in asn) {
                    let hostBtn = new PopupMenu.PopupImageMenuItem(_(asn.hostname), getIcon("host.svg"), {});
                    hostBtn.connect('activate', copyTextFunction);
                    obj.menu.addMenuItem(hostBtn);           
                }

                if("org" in asn) {                       
                    let orgBtn = new PopupMenu.PopupImageMenuItem(_(asn.org), getIcon("company.svg"), {});
                    orgBtn.connect('activate', copyTextFunction);
                    obj.menu.addMenuItem(orgBtn);           
                }

                if("timezone" in asn) {           
                    let tzBtn = new PopupMenu.PopupImageMenuItem(_(asn.timezone), getIcon("timezone.svg"), {});
                    tzBtn.connect('activate', copyTextFunction);
                    obj.menu.addMenuItem(tzBtn);           
                }
            }

            let flagIcon = getIcon(getCachedFlag(locationIP.countryCode), true);
            let countryBtn = new PopupMenu.PopupImageMenuItem(_(locationIP.countryName + " (" + locationIP.countryCode + "), " + locationIP.cityName), flagIcon, {});
            countryBtn.connect('activate', copyTextFunction);
            obj.menu.addMenuItem(countryBtn);         

            if("longitude" in locationIP && "latitude" in locationIP) {
                //show map, clicking on it will open google maps with a pin

                let mapImageBtn = new PopupMenu.PopupMenuItem(_(""), { style_class: 'mapMenuItem' });                                            
                mapImageBtn.set_style("background-image: url('" + getCachedMap(locationIP.latitude, locationIP.longitude) + "')");

                let mapsUrl = 'https://maps.google.com/maps?q=' + String(locationIP.latitude) + ',' + String(locationIP.longitude);
                
                mapImageBtn.connect('activate', function(item, event) {           
                    log(mapsUrl);
                    GLib.spawn_command_line_async("xdg-open \"" + mapsUrl + "\"");

                    return Clutter.EVENT_PROPAGATE;
                });

                obj.menu.addMenuItem(mapImageBtn);   
            }

            obj.menu.toggle();            
        }
    }
);


// In case of GNOME event
function _onStatusChanged(presence, status) {
    let backFromSleep = false;

    lg("Gnome status changed");

    if (status == GnomeSession.PresenceStatus.IDLE) {
        isIdle = true;        

        lg("Disabling network monitor");
        networkMonitorDisable();

    } else {        
        if(isIdle) {
            backFromSleep = true;            
        }

        isIdle = false;
        
        lg("Enabling network monitor");
        networkMonitorEnable();
    }

    if(backFromSleep) {
        lg("Device unlocked/awoken");
        if (sourceLoopID) {
            GLib.Source.remove(sourceLoopID);
            sourceLoopID = null;
        }  

        timer();
    }
}

// In case of a network event, inquire external IP.
function _onNetworkStatusChanged(status=null) {        
    if(status != null && !isIdle) {        
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
// - bugfix: added fix for missing icon specification in Source constructor, this caused occassional crashes to Logout
// - moved popup_icon to a once-initialized variable to prevent unnecessary reloading.
function notify(title, msg) {    
    let source = new MessageTray.Source(title, "img/ip.svg");

    notification_msg_sources.add(source);
    
    //ensure notification is added to GNOME message tray
    Main.messageTray.add(source);

    let notification = new MessageTray.Notification(source, title, msg, {        
        bannerMarkup: true,
        gicon: popup_icon
    });          
    
    //set to destroy messages in stack also
    notification.connect('destroy', (destroyed_source) => {
        notification_msg_sources.delete(destroyed_source.source);
    });

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

            try {
                notify('External IP Address', 'Has been changed to ' + locationIP.ipAddress);
            } catch(err) {
                lg(err);
            }
        }

        currentIP = locationIP.ipAddress;

        lg("New IP: " + currentIP + " - " + locationIP.countryName + " (" + locationIP.countryCode + ")");

        lg(getFlagUrl(locationIP.countryCode));

        if(panelButton != null) {            
            panelButton.update(currentIP, locationIP.countryCode);
        }
    }

    return true;
}

// wait until time elapsed, to be friendly to external ip url
function timer() {    
    if (!disabled && !isIdle) {
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

// Download application specific flags and cache locally
function getCachedMap(lat,lon) {    
    let mapFileDestination = thisExtensionDir + '/maps/' + lat + '_' + lon + '.svg';

    const cwd = Gio.File.new_for_path(thisExtensionDir + "/maps/");
    const newFile = cwd.get_child(lat + '_' + lon + ".svg");

    // detects if icon is cached (exists)
    const fileExists = newFile.query_exists(null);

    if (!fileExists) {
        // download and save in cache folder
        // do this synchronously to ensure notifications always get a logo
        let _httpSession = new Soup.SessionSync();

        let url = extIpServiceStaticMap + "?lat=" + lat + "&lon=" + lon + "&f=SVG&marker=12&w=250&h=150";
        
        let message = Soup.Message.new('GET', url);
        let responseCode = _httpSession.send_message(message);
        let out = null;
        let resp = null;
        if (responseCode == 200) {
            try {
                let bytes = message['response-body'].flatten().get_data();
                const file = Gio.File.new_for_path(mapFileDestination);
                const [, etag] = file.replace_contents(bytes, null, false, Gio.FileCreateFlags.REPLACE_DESTINATION, null);
            } catch (e) {
                lg("Error in cached flag");
                lg(e);
            }
        }

    } else {
        // icon is readily cached, return from icons folder locally        
    }

    return mapFileDestination;
}

// Download application specific flags and cache locally
function getCachedFlag(country) {
    country = country.toLowerCase();

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

// Returns SVG as gicon
function getIcon(fileName, noPrefix=false) {
    let prefix = "";
    if(noPrefix == false) {
        prefix = thisExtensionDir + "/img/";
    }

    let file = Gio.File.new_for_path(prefix + fileName);
    return icon = new Gio.FileIcon({
        file
    });
}

function enable() {
    disabled = false;

    // Initialize icon once to prevent unnecessary reloading, unload in disable.
    popup_icon = getIcon("ip.svg");

    // Prepare UI
    messageTray = new MessageTray.MessageTray()        

    if(panelButton == null) {
        panelButton = new Indicator();
    }

    // Add the button to the panel    
    let uuid = Me.metadata.uuid;       
    Main.panel.addToStatusArea(uuid, panelButton, 0, 'right');    
    
    presence = new GnomeSession.Presence((proxy, error) => {
        //_onNetworkStatusChanged(proxy.status);
        _onStatusChanged(proxy.status);
    });    
    presence_connection = presence.connectSignal('StatusChanged', (proxy, senderName, [status]) => {
        //_onNetworkStatusChanged(status);
        _onStatusChanged(status);
    });  

    networkMonitorEnable();

    // After enabling, immediately get ip
    refreshIP();

    // Enable timer
    timer();
}

function networkMonitorEnable() {
    // Enable network event monitoring
    network_monitor = Gio.network_monitor_get_default();      
    network_monitor_connection = network_monitor.connect('network-changed', _onNetworkStatusChanged);
}

function networkMonitorDisable() {
    // Cleanup network monitor properly    
    network_monitor.disconnect(network_monitor_connection);
    network_monitor = null;

    // Remove timer for network events
    if (networkEventRefreshLoopID) {
        GLib.Source.remove(networkEventRefreshLoopID);
        networkEventRefreshLoopID = null;
    }
}

function disable() {
    // Set to true so if the timer hits, stop.
    disabled = true;

    // clear messagetray - and any associated remaining sources
    for(let source of notification_msg_sources) {
        source.destroy();        
    }

    popup_icon = null;

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

    presence.disconnectSignal(presence_connection);    
    presence = null;

    networkMonitorDisable();

    // Remove timer loop altogether
    if (sourceLoopID) {
        GLib.Source.remove(sourceLoopID);
        sourceLoopID = null;
    }    

    // Destroy indicator altogether    
    //Indicator = null;
}
