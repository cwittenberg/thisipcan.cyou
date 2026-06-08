/*
 * Copyright (c) 2022-2026 Christian Wittenberg
 * GNOME 50 Port
 */

import St from 'gi://St';
import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import Soup from 'gi://Soup';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as MessageTray from 'resource:///org/gnome/shell/ui/messageTray.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';

import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';
import { HistoryManager, HistoryDialog } from './history.js';

const extIpServiceGeo = 'https://ipwho.is/';
const extIpServiceV4 = 'https://api4.ipify.org?format=json';
const extIpServiceV6 = 'https://api6.ipify.org?format=json';
const extCountryFlagService = 'https://flagcdn.com/<countrycode>.svg';

const Indicator = GObject.registerClass(
    class Indicator extends PanelMenu.Button {
        _init(ext) {
            super._init(0.5, ext.metadata.name);
            this.ext = ext;
            
            this.btn = new St.Button();            
            this.btn.set_style_class_name("notifyIcon");
            
            this.btn.reactive = false; 
            
            this.updateUI().catch(e => this.ext.lg(e));

            this.add_child(this.btn);                        
        }        

        async updateUI() {
            let locIP = this.ext.locationIP;
            if (!locIP) {
                this.btn.set_label("...");
                return;
            }

            let flagURL = await this.ext.getCachedFlag(locIP.countryCode);            
            this.btn.set_style(`background-image: url("file://${flagURL}");`);

            let displayMode = this.ext.settings.get_string('title-display-mode');
            
            if (displayMode === 'flag-only') {
                this.btn.set_label("");
            } else if (displayMode === 'isp') {
                this.btn.set_label(locIP.org || locIP.asn || "Unknown ISP");
            } else {
                let priority = this.ext.settings.get_string('ip-version-priority');
                let displayIP = "";
                
                if (priority === 'ipv6' && locIP.ipv6) {
                    displayIP = locIP.ipv6;
                } else if (priority === 'ipv4' && locIP.ipv4) {
                    displayIP = locIP.ipv4;
                } else {
                    displayIP = locIP.ipv6 || locIP.ipv4 || locIP.primaryIp;
                }
                this.btn.set_label(displayIP);
            }

            await this._rebuildMenu();
        }

        async _rebuildMenu() {            
            try {
                if (!this.menu) return;
                
                this.menu.removeAll();                        
            
                let copyTextFunction = function(textToCopy) {                                
                    St.Clipboard.get_default().set_text(St.ClipboardType.CLIPBOARD, textToCopy);
                };
                
                let locIP = this.ext.locationIP;
                if (!locIP) return;

                this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem("IP Addresses (Click to copy)"));
                
                if (locIP.ipv4) {
                    let v4Btn = new PopupMenu.PopupImageMenuItem(`IPv4: ${locIP.ipv4}`, 'network-server-symbolic', { style_class: 'ipMenuItem'});
                    v4Btn.connectObject('activate', () => copyTextFunction(locIP.ipv4), this);
                    this.menu.addMenuItem(v4Btn);
                }
                
                if (locIP.ipv6) {
                    let v6Btn = new PopupMenu.PopupImageMenuItem(`IPv6: ${locIP.ipv6}`, 'network-server-symbolic', { style_class: 'ipMenuItem'});
                    v6Btn.connectObject('activate', () => copyTextFunction(locIP.ipv6), this);
                    this.menu.addMenuItem(v6Btn);
                }
                
                if (!locIP.ipv4 && !locIP.ipv6 && locIP.primaryIp) {
                    let pBtn = new PopupMenu.PopupImageMenuItem(`${locIP.primaryIp}`, 'network-server-symbolic', { style_class: 'ipMenuItem'});
                    pBtn.connectObject('activate', () => copyTextFunction(locIP.primaryIp), this);
                    this.menu.addMenuItem(pBtn);
                }

                this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem("Network Details"));

                if (locIP.org || locIP.asn) {
                    let orgText = locIP.org ? locIP.org : locIP.asn;
                    let orgBtn = new PopupMenu.PopupImageMenuItem(orgText, 'emblem-shared-symbolic', {});
                    orgBtn.connectObject('activate', () => copyTextFunction(orgText), this);
                    this.menu.addMenuItem(orgBtn);           
                }

                if (locIP.timezone) {           
                    let tzBtn = new PopupMenu.PopupImageMenuItem(locIP.timezone, 'preferences-system-time-symbolic', {});
                    tzBtn.connectObject('activate', () => copyTextFunction(locIP.timezone), this);
                    this.menu.addMenuItem(tzBtn);           
                }

                let flagIcon = this.ext.getIcon(await this.ext.getCachedFlag(locIP.countryCode), true);
                let countryText = `${locIP.countryName} (${locIP.countryCode}), ${locIP.cityName}`;
                let countryBtn = new PopupMenu.PopupImageMenuItem(countryText, flagIcon, {});
                countryBtn.connectObject('activate', () => copyTextFunction(countryText), this);
                this.menu.addMenuItem(countryBtn);         

                if (locIP.latitude && locIP.longitude) {
                    let mapImageBtn = new PopupMenu.PopupBaseMenuItem({
                        style_class: 'mapMenuItem',
                        reactive: true
                    });

                    let mapUrl = await this.ext.getCachedMap(locIP.latitude, locIP.longitude);

                    let mapContainer = new St.Widget({
                        style: `background-image: url('file://${mapUrl}'); background-size: cover; border-radius: 8px;`,
                        width: 256,
                        height: 256,
                        layout_manager: new Clutter.BinLayout(),
                        x_expand: true,
                        y_expand: true
                    });

                    let marker = new St.Widget({
                        style: `
                            background-color: #f38ba8;
                            border: 2px solid white;
                            border-radius: 999px;
                            width: 14px;
                            height: 14px;
                            box-shadow: 0 2px 8px rgba(0,0,0,0.6);
                        `,
                        width: 14,
                        height: 14,
                        x_align: Clutter.ActorAlign.CENTER,
                        y_align: Clutter.ActorAlign.CENTER
                    });

                    mapContainer.add_child(marker);
                    mapImageBtn.add_child(mapContainer);

                    let mapProvider = this.ext.settings.get_string('map-provider');
                    let mapsUrl = `https://www.google.com/maps/search/?api=1&query=${locIP.latitude},${locIP.longitude}`;
                    
                    if (mapProvider === 'osm') {
                        mapsUrl = `https://www.openstreetmap.org/?mlat=${locIP.latitude}&mlon=${locIP.longitude}#map=12/${locIP.latitude}/${locIP.longitude}`;
                    } else if (mapProvider === 'apple') {
                        mapsUrl = `https://maps.apple.com/?ll=${locIP.latitude},${locIP.longitude}`;
                    }

                    mapImageBtn.connectObject('activate', () => {
                        try {
                            Gio.app_info_launch_default_for_uri(mapsUrl, null);
                        } catch (e) {
                            this.ext.lg(`Failed to launch map URL: ${e}`);
                        }
                    }, this);

                    this.menu.addMenuItem(mapImageBtn);   
                }
                
                this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

                let historyItem = new PopupMenu.PopupImageMenuItem("View IP History", 'document-open-recent-symbolic');
                historyItem.connectObject('activate', () => {
                    let dialog = new HistoryDialog(this.ext);
                    dialog.open();
                }, this);
                this.menu.addMenuItem(historyItem);
                
                let settingsItem = new PopupMenu.PopupImageMenuItem("Settings", 'preferences-system-symbolic');
                settingsItem.connectObject('activate', () => {
                    this.ext.openPreferences();
                }, this);
                this.menu.addMenuItem(settingsItem);
                
            } catch (err) {
                this.ext.lg(`Error in _rebuildMenu: ${err}`);
            }
        }
    }
);

export default class ExternalIPExtension extends Extension {
    constructor(metadata) {
        super(metadata);
    }

    lg(s) {
        if (!this.settings || !this.settings.get_boolean('enable-debug-logs')) return;
        let now = GLib.DateTime.new_now_local();
        let ms = now.get_microsecond().toString().padStart(6, '0').substring(0, 3);
        console.warn(`[ShowExternalIP] [${now.format('%H:%M:%S')}.${ms}] ${s}`);
    }

    async httpRequest(url) {
        try {
            let message = Soup.Message.new('GET', url);
            message.request_headers.append("User-Agent", "GNOME-Shell-Extension/ShowExternalIP");
            message.request_headers.set_content_type("application/json", null);
            
            let bytes = await this._httpSession.send_and_read_async(message, GLib.PRIORITY_DEFAULT, null);
            if (message.get_status() === 200) {
                let decoder = new TextDecoder('utf-8');
                return decoder.decode(bytes.get_data());
            }
        } catch (error) {
            this.lg(`HTTP Request Error [${url}]: ${error}`);
        }
        return null;
    }

    async httpRequestBytes(url) {
        try {
            let message = Soup.Message.new('GET', url);
            message.request_headers.append("User-Agent", "GNOME-Shell-Extension/ShowExternalIP");
            
            let bytes = await this._httpSession.send_and_read_async(message, GLib.PRIORITY_DEFAULT, null);
            if (message.get_status() === 200) return bytes;
        } catch (error) {
            this.lg(`HTTP Bytes Error [${url}]: ${error}`);
        }
        return null;
    }

    notify(title, msg) {
        try {
            let source = new MessageTray.Source({
                title: title,
                iconName: "network-transmit-receive-symbolic"
            });
            this.notification_msg_sources.add(source);
            Main.messageTray.add(source);

            let notification = new MessageTray.Notification({
                source: source,
                title: title,
                body: msg
            });          
            
            notification.connectObject('destroy', () => {
                this.notification_msg_sources.delete(source);
            }, this);

            source.addNotification(notification);
        } catch (e) {
            this.lg(`Failed to display notification: ${e}`);
        }
    }

    getFlagEmoji(countryCode) {
        if (!countryCode || countryCode.length !== 2) return "";
        const codePoints = countryCode
            .toUpperCase()
            .split('')
            .map(char => 127397 + char.charCodeAt());
        return String.fromCodePoint(...codePoints);
    }

    async refreshIP(force = false) {
        let t = new Date().getTime();
        if (!force && (t - this.lastCheck <= this.minTimeBetweenChecks * 1000)) return true;
        this.lastCheck = t;

        let [geoResp, v4Resp, v6Resp] = await Promise.all([
            this.httpRequest(extIpServiceGeo),
            this.httpRequest(extIpServiceV4),
            this.httpRequest(extIpServiceV6)
        ]);       

        if (!geoResp) { 
            this.lg("Null response received from primary API");
            return false;
        }

        try {
            let parsedGeo = JSON.parse(geoResp);
            let parsedV4 = v4Resp ? JSON.parse(v4Resp).ip : null;
            let parsedV6 = v6Resp ? JSON.parse(v6Resp).ip : null;
            
            let newLocationIP = {
                primaryIp: parsedGeo.ip,
                ipv4: parsedV4,
                ipv6: parsedV6,
                countryName: parsedGeo.country,
                countryCode: parsedGeo.country_code,
                cityName: parsedGeo.city,
                latitude: parsedGeo.latitude,
                longitude: parsedGeo.longitude,
                org: parsedGeo.connection ? parsedGeo.connection.org : "",
                asn: parsedGeo.connection ? parsedGeo.connection.asn : "",
                timezone: parsedGeo.timezone ? parsedGeo.timezone.id : ""
            };

            let primaryChanged = this.locationIP && this.locationIP.primaryIp !== newLocationIP.primaryIp;
            this.locationIP = newLocationIP;

            this.historyManager.addEntryIfNeeded(this.locationIP);

            if (primaryChanged) {
                this.lg('Note: External IP address has been changed into ' + this.locationIP.primaryIp);
                if (this.settings.get_boolean('show-notifications')) {
                    let emoji = this.getFlagEmoji(this.locationIP.countryCode);
                    this.notify('IP Change Detected', `${this.locationIP.primaryIp}\n${emoji} ${this.locationIP.cityName}, ${this.locationIP.countryName}`);
                }
            }

            this.lg(`Resolved IPs -> v4: ${this.locationIP.ipv4}, v6: ${this.locationIP.ipv6}`);

            if (this.panelButton) {            
                await this.panelButton.updateUI();
            }
            return true;
        } catch (err) {
            this.lg(`JSON Parse Error: ${err}`);
            return false;
        }
    }

    timer() {    
        if (this.sourceLoopID) {
            GLib.Source.remove(this.sourceLoopID);
            this.sourceLoopID = null;
        }
        this.sourceLoopID = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, this.timeout, () => {            
            this.refreshIP().catch(e => this.lg(e));
            return GLib.SOURCE_CONTINUE;
        });
    }

    async _purgeCache(folderName, maxFiles = 20) {
        try {
            let dir = this.dir.get_child(folderName);
            if (!dir.query_exists(null)) return;

            dir.enumerate_children_async('standard::*', Gio.FileQueryInfoFlags.NONE, GLib.PRIORITY_DEFAULT, null, (source, res) => {
                try {
                    let enumerator = source.enumerate_children_finish(res);
                    let files = [];
                    
                    let processNext = () => {
                        enumerator.next_files_async(10, GLib.PRIORITY_DEFAULT, null, (enumSource, res2) => {
                            let infos = enumSource.next_files_finish(res2);
                            if (infos.length === 0) {
                                files.sort((a, b) => a.time - b.time);
                                if (files.length > maxFiles) {
                                    let toDelete = files.length - maxFiles;
                                    for (let i = 0; i < toDelete; i++) {
                                        files[i].file.delete_async(GLib.PRIORITY_DEFAULT, null, null);
                                    }
                                }
                                enumerator.close_async(GLib.PRIORITY_DEFAULT, null, null);
                                return;
                            }
                            for (let info of infos) {
                                if (info.get_file_type() === Gio.FileType.REGULAR) {
                                    files.push({
                                        file: dir.get_child(info.get_name()),
                                        time: info.get_modification_date_time().to_unix()
                                    });
                                }
                            }
                            processNext();
                        });
                    };
                    processNext();
                } catch(e) {
                    this.lg(`Cache enum error: ${e}`);
                }
            });
        } catch (e) {
            this.lg(`Cache purge error: ${e}`);
        }
    }

    async getCachedMap(lat, lon) {    
        let mapsDir = this.dir.get_child('maps');
        if (!mapsDir.query_exists(null)) mapsDir.make_directory_with_parents(null);

        let zoom = 12;
        let x = Math.floor((lon + 180) / 360 * Math.pow(2, zoom));
        let latRad = lat * Math.PI / 180;
        let y = Math.floor((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * Math.pow(2, zoom));

        let mapFileDestination = mapsDir.get_path() + `/${lat}_${lon}_${zoom}.png`;
        let file = Gio.File.new_for_path(mapFileDestination);

        if (!file.query_exists(null)) {
            let url = `https://tile.openstreetmap.org/${zoom}/${x}/${y}.png`;
            let bytes = await this.httpRequestBytes(url); 
            if (bytes) {
                return new Promise((resolve) => {
                    file.replace_contents_bytes_async(bytes, null, false, Gio.FileCreateFlags.REPLACE_DESTINATION, null, (f, res) => {
                        try { f.replace_contents_finish(res); } catch(e) { this.lg(`Map write error: ${e}`); }
                        resolve(mapFileDestination);
                    });
                });
            }
        }
        return mapFileDestination;
    }

    async getCachedFlag(country) {
        if (!country) country = "un";
        country = country.toLowerCase();

        let flagsDir = this.dir.get_child('flags');
        if (!flagsDir.query_exists(null)) flagsDir.make_directory_with_parents(null);

        let iconFileDestination = flagsDir.get_path() + `/${country}.svg`;
        let file = Gio.File.new_for_path(iconFileDestination);

        if (!file.query_exists(null)) {
            let url = extCountryFlagService.replace("<countrycode>", country);
            let bytes = await this.httpRequestBytes(url); 
            if (bytes) {
                return new Promise((resolve) => {
                    file.replace_contents_bytes_async(bytes, null, false, Gio.FileCreateFlags.REPLACE_DESTINATION, null, (f, res) => {
                        try { f.replace_contents_finish(res); } catch(e) { this.lg(`Flag write error: ${e}`); }
                        resolve(iconFileDestination);
                    });
                });
            }
        }
        return iconFileDestination;
    }

    getIcon(fileName, isAbsolutePath=false) {
        if (isAbsolutePath) {
            let file = Gio.File.new_for_path(fileName);
            if (file.query_exists(null)) {
                return new Gio.FileIcon({ file });
            }
        }
        return new Gio.ThemedIcon({ name: 'network-server-symbolic' });
    }

    _onNetworkStatusChanged(monitor, network_available) {        
        if (network_available) {        
            this.lg("Network event triggered. Scheduling rapid IP re-check.");
            
            if (this.networkEventRefreshLoopID) {
                GLib.Source.remove(this.networkEventRefreshLoopID);
                this.networkEventRefreshLoopID = null;
            }
            
            if (this.rapidRefreshRetryID) {
                GLib.Source.remove(this.rapidRefreshRetryID);
                this.rapidRefreshRetryID = null;
            }

            let attempts = 0;
            let tryRefresh = () => {
                this.refreshIP(true).then(success => {
                    if (!success && attempts < 5) {
                        attempts++;
                        this.lg(`Rapid refresh attempt ${attempts} failed. Retrying in 2s...`);
                        
                        if (this.rapidRefreshRetryID) {
                            GLib.Source.remove(this.rapidRefreshRetryID);
                            this.rapidRefreshRetryID = null;
                        }
                        
                        this.rapidRefreshRetryID = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 2, tryRefresh);
                    } else {
                        this.rapidRefreshRetryID = null;
                    }
                });
                
                this.networkEventRefreshLoopID = null;
                return GLib.SOURCE_REMOVE;
            };

            this.networkEventRefreshLoopID = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 1, tryRefresh);   
        }
    }

    enable() {
        this.timeout = 60 * 10; 
        this.minTimeBetweenChecks = 4; 
        this.networkEventRefreshTimeout = 4;
        this.lastCheck = 0;
        this.locationIP = null;
        this.notification_msg_sources = new Set();
        
        this.settings = this.getSettings();
        
        this._httpSession = new Soup.Session(); 
        this._httpSession.timeout = 8;
        
        this.historyManager = new HistoryManager(this.dir, this);

        this._purgeCache('maps', 20);
        this._purgeCache('flags', 20);

        if (!this.panelButton) {
            this.panelButton = new Indicator(this);
        }
        
        Main.panel.addToStatusArea(this.uuid, this.panelButton, 0, 'right');    
        
        this.network_monitor = Gio.network_monitor_get_default();      
        this.network_monitor.connectObject('network-changed', this._onNetworkStatusChanged.bind(this), this);

        this.settings.connectObject('changed', () => {
            if (this.panelButton) this.panelButton.updateUI();
        }, this);

        this.refreshIP();
        this.timer();
        
        this.lg("Extension Enabled");
    }

    disable() {
        this.lg("Disabling Extension");
        
        if (this.networkEventRefreshLoopID) {
            GLib.Source.remove(this.networkEventRefreshLoopID);
            this.networkEventRefreshLoopID = null;
        }

        if (this.rapidRefreshRetryID) {
            GLib.Source.remove(this.rapidRefreshRetryID);
            this.rapidRefreshRetryID = null;
        }

        if (this.sourceLoopID) {
            GLib.Source.remove(this.sourceLoopID);
            this.sourceLoopID = null;
        }

        if (this.settings) {
            this.settings.disconnectObject(this);
            this.settings = null;
        }

        if (this.notification_msg_sources) {
            for (let source of this.notification_msg_sources) {
                source.destroy();        
            }
            this.notification_msg_sources.clear();
            this.notification_msg_sources = null;
        }

        if (this.panelButton) {
            this.panelButton.destroy();
            this.panelButton = null;
        }

        if (this.network_monitor) {
            this.network_monitor.disconnectObject(this);
            this.network_monitor = null;
        }
        
        if (this._httpSession) {
            this._httpSession.abort();
            this._httpSession = null;
        }
        
        this.historyManager = null;
        this.locationIP = null;
    }
}