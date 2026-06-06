/*
 * Copyright (c) 2022-2024 Christian Wittenberg
 * GNOME 50 Port
 *
 * thisipcan.cyou gnome extension is free software; you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by the
 * Free Software Foundation; either version 3 of the License, or (at your
 * option) any later version.
 */

import St from 'gi://St';
import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import Soup from 'gi://Soup?version=3.0';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as MessageTray from 'resource:///org/gnome/shell/ui/messageTray.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';

import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';

const extIpServiceGeo = 'https://ipwho.is/';
const extIpServiceV4 = 'https://api4.ipify.org?format=json';
const extIpServiceV6 = 'https://api6.ipify.org?format=json';
const extCountryFlagService = 'https://flagcdn.com/<countrycode>.svg';

const Indicator = GObject.registerClass(
    class Indicator extends PanelMenu.Button {
        _init(ext) {
            super._init(0.0, ext.metadata.name);
            this.ext = ext;
            
            this.btn = new St.Button();            
            this.btn.set_style_class_name("notifyIcon");
            
            this.updateUI().catch(e => this.ext.lg(e));
                
            this.connect('button-press-event', this._onButtonClicked.bind(this));
            this.btn.connect('button-press-event', this._onButtonClicked.bind(this));

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
        }

        async _onButtonClicked(obj, e) {            
            if (this.menu) {
                this.menu.removeAll();                        
            
                let copyTextFunction = function(item, event) {                                
                    St.Clipboard.get_default().set_text(St.ClipboardType.CLIPBOARD, item.label.text);
                    return Clutter.EVENT_PROPAGATE;
                };
                
                let locIP = this.ext.locationIP;
                if (locIP) {
                    this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem("IP Addresses (Click to copy)"));
                    
                    if (locIP.ipv4) {
                        let v4Btn = new PopupMenu.PopupImageMenuItem(`IPv4: ${locIP.ipv4}`, this.ext.getIcon("ip.svg", true), { style_class: 'ipMenuItem'});
                        v4Btn.connect('activate', copyTextFunction);
                        this.menu.addMenuItem(v4Btn);
                    }
                    
                    if (locIP.ipv6) {
                        let v6Btn = new PopupMenu.PopupImageMenuItem(`IPv6: ${locIP.ipv6}`, this.ext.getIcon("ip.svg", true), { style_class: 'ipMenuItem'});
                        v6Btn.connect('activate', copyTextFunction);
                        this.menu.addMenuItem(v6Btn);
                    }
                    
                    if (!locIP.ipv4 && !locIP.ipv6 && locIP.primaryIp) {
                        let pBtn = new PopupMenu.PopupImageMenuItem(`${locIP.primaryIp}`, this.ext.getIcon("ip.svg", true), { style_class: 'ipMenuItem'});
                        pBtn.connect('activate', copyTextFunction);
                        this.menu.addMenuItem(pBtn);
                    }

                    this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem("Network Details"));

                    if (locIP.org || locIP.asn) {
                        let orgText = locIP.org ? locIP.org : locIP.asn;
                        let orgBtn = new PopupMenu.PopupImageMenuItem(orgText, this.ext.getIcon("company.svg", true), {});
                        orgBtn.connect('activate', copyTextFunction);
                        this.menu.addMenuItem(orgBtn);           
                    }

                    if (locIP.timezone) {           
                        let tzBtn = new PopupMenu.PopupImageMenuItem(locIP.timezone, this.ext.getIcon("timezone.svg", true), {});
                        tzBtn.connect('activate', copyTextFunction);
                        this.menu.addMenuItem(tzBtn);           
                    }

                    let flagIcon = this.ext.getIcon(await this.ext.getCachedFlag(locIP.countryCode), true);
                    let countryBtn = new PopupMenu.PopupImageMenuItem(`${locIP.countryName} (${locIP.countryCode}), ${locIP.cityName}`, flagIcon, {});
                    countryBtn.connect('activate', copyTextFunction);
                    this.menu.addMenuItem(countryBtn);         

                    if (locIP.latitude && locIP.longitude) {
                        let mapImageBtn = new PopupMenu.PopupBaseMenuItem({ style_class: 'mapMenuItem' });                                            
                        let mapUrl = await this.ext.getCachedMap(locIP.latitude, locIP.longitude);
                        
                        let mapWidget = new St.Widget({
                            style: `background-image: url('file://${mapUrl}'); background-size: cover; border-radius: 8px;`,
                            width: 250,
                            height: 150,
                            x_expand: true,
                            y_expand: true
                        });
                        mapImageBtn.add_child(mapWidget);

                        let mapsUrl = `https://maps.google.com/maps?q=${locIP.latitude},${locIP.longitude}`;
                        mapImageBtn.connect('activate', () => {           
                            GLib.spawn_command_line_async(`xdg-open "${mapsUrl}"`);
                            return Clutter.EVENT_PROPAGATE;
                        });

                        this.menu.addMenuItem(mapImageBtn);   
                    }
                    
                    this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
                    let settingsItem = new PopupMenu.PopupMenuItem("Extension Settings...");
                    settingsItem.connect('activate', () => {
                        this.ext.openPreferences();
                    });
                    this.menu.addMenuItem(settingsItem);
                }
                this.menu.toggle();            
            }
        }
    }
);

export default class ExternalIPExtension extends Extension {
    constructor(metadata) {
        super(metadata);
        this.disabled = false; 
        this.timeout = 60 * 10; 
        this.minTimeBetweenChecks = 4; 
        this.networkEventRefreshTimeout = 4;
        
        this.isIdle = false;
        this.lastCheck = 0;
        this.locationIP = null;
        
        this.notification_msg_sources = new Set();
        
        this._httpSession = new Soup.Session(); 
        this._httpSession.timeout = 8;
        
        this._settingsChangedId = 0;
    }

    lg(s) {
        if (!this.settings || !this.settings.get_boolean('enable-debug-logs')) return;
        let now = GLib.DateTime.new_now_local();
        let ms = now.get_microsecond().toString().padStart(6, '0').substring(0, 3);
        console.log(`[ShowExternalIP] [${now.format('%H:%M:%S')}.${ms}] ${s}`);
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
        let source = new MessageTray.Source(title, "network-transmit-receive-symbolic");
        this.notification_msg_sources.add(source);
        Main.messageTray.add(source);

        let notification = new MessageTray.Notification(source, title, msg, {        
            bannerMarkup: true,
            gicon: this.popup_icon
        });          
        
        notification.connect('destroy', (destroyed_source) => {
            this.notification_msg_sources.delete(destroyed_source.source);
        });

        source.showNotification(notification);
    }

    async refreshIP() {
        let t = new Date().getTime();
        if (t - this.lastCheck <= this.minTimeBetweenChecks * 1000) return true;
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

            if (primaryChanged) {
                this.lg('Note: External IP address has been changed into ' + this.locationIP.primaryIp);
                this.notify('External IP Address', 'Has been changed to ' + this.locationIP.primaryIp);
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
        if (!this.disabled && !this.isIdle) {
            this.sourceLoopID = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, this.timeout, () => {            
                this.refreshIP().catch(e => this.lg(e));
                return GLib.SOURCE_CONTINUE;
            });
        }    
    }

    async getCachedMap(lat, lon) {    
        let mapsDir = this.dir.get_child('maps');
        if (!mapsDir.query_exists(null)) mapsDir.make_directory_with_parents(null);

        let mapFileDestination = mapsDir.get_path() + `/${lat}_${lon}.svg`;
        let file = Gio.File.new_for_path(mapFileDestination);

        if (!file.query_exists(null)) {
            let svgContent = `<svg width="250" height="150" viewBox="0 0 250 150" xmlns="http://www.w3.org/2000/svg">
                <rect width="250" height="150" fill="#1e1e2e" rx="8"/>
                <g stroke="#313244" stroke-width="1">
                    <line x1="0" y1="75" x2="250" y2="75" />
                    <line x1="125" y1="0" x2="125" y2="150" />
                </g>
                <circle cx="125" cy="75" r="40" fill="none" stroke="#45475a" stroke-width="1" stroke-dasharray="4 4"/>
                <circle cx="125" cy="75" r="20" fill="none" stroke="#45475a" stroke-width="1"/>
                <circle cx="125" cy="75" r="5" fill="#f38ba8"/>
                <circle cx="125" cy="75" r="15" fill="#f38ba8" opacity="0.3">
                    <animate attributeName="r" values="5;25" dur="2s" repeatCount="indefinite" />
                    <animate attributeName="opacity" values="0.8;0" dur="2s" repeatCount="indefinite" />
                </circle>
                <text x="10" y="25" fill="#cdd6f4" font-family="monospace" font-size="12" font-weight="bold">LOCATION LOCK</text>
                <text x="10" y="125" fill="#a6adc8" font-family="monospace" font-size="11">LAT: ${lat}</text>
                <text x="10" y="140" fill="#a6adc8" font-family="monospace" font-size="11">LON: ${lon}</text>
            </svg>`;
            file.replace_contents(svgContent, null, false, Gio.FileCreateFlags.REPLACE_DESTINATION, null);
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
                file.replace_contents_bytes_async(bytes, null, false, Gio.FileCreateFlags.REPLACE_DESTINATION, null, null);
            }
        }
        return iconFileDestination;
    }

    getIcon(fileName, isAbsolutePath=false) {
        let path = isAbsolutePath ? fileName : this.dir.get_child('img').get_path() + '/' + fileName;
        
        let file = Gio.File.new_for_path(path);
        if (!file.query_exists(null) && !isAbsolutePath) {
             path = this.dir.get_child('img').get_path() + '/ip.svg';
             file = Gio.File.new_for_path(path);
        }
        
        return new Gio.FileIcon({ file });
    }

    _onNetworkStatusChanged(monitor, network_available) {        
        if (network_available && !this.isIdle) {        
            this.lg("Network event has been triggered. Re-check ext. IP");
            
            if (this.networkEventRefreshLoopID) {
                GLib.Source.remove(this.networkEventRefreshLoopID);
            }

            this.networkEventRefreshLoopID = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, this.networkEventRefreshTimeout, () => {         
                this.refreshIP();
                this.networkEventRefreshLoopID = null;
                return GLib.SOURCE_REMOVE;
            });   
        }
    }

    enable() {
        this.disabled = false;
        this.settings = this.getSettings();
        
        this.popup_icon = this.getIcon("ip.svg");

        if (!this.panelButton) {
            this.panelButton = new Indicator(this);
        }
        
        Main.panel.addToStatusArea(this.uuid, this.panelButton, 0, 'right');    
        
        this.network_monitor = Gio.network_monitor_get_default();      
        this.network_monitor_connection = this.network_monitor.connect('network-changed', this._onNetworkStatusChanged.bind(this));

        this._settingsChangedId = this.settings.connect('changed', () => {
            if (this.panelButton) this.panelButton.updateUI();
        });

        this.refreshIP();
        this.timer();
        
        this.lg("Extension Enabled");
    }

    disable() {
        this.lg("Disabling Extension");
        this.disabled = true;

        if (this._settingsChangedId && this.settings) {
            this.settings.disconnect(this._settingsChangedId);
            this._settingsChangedId = 0;
        }

        for (let source of this.notification_msg_sources) {
            source.destroy();        
        }
        this.notification_msg_sources.clear();

        this.popup_icon = null;

        if (this.panelButton) {
            this.panelButton.destroy();
            this.panelButton = null;
        }

        if (this.network_monitor && this.network_monitor_connection) {
            this.network_monitor.disconnect(this.network_monitor_connection);
            this.network_monitor_connection = null;
        }

        if (this.networkEventRefreshLoopID) {
            GLib.Source.remove(this.networkEventRefreshLoopID);
            this.networkEventRefreshLoopID = null;
        }

        if (this.sourceLoopID) {
            GLib.Source.remove(this.sourceLoopID);
            this.sourceLoopID = null;
        }
        
        if (this._httpSession) {
            this._httpSession.abort();
        }
        
        this.settings = null;
    }
}