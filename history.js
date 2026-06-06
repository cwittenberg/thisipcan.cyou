/*
 * Copyright (c) 2024 Christian Wittenberg
 * History Manager & Dialog Overlay
 */

import GObject from 'gi://GObject';
import St from 'gi://St';
import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import * as ModalDialog from 'resource:///org/gnome/shell/ui/modalDialog.js';

function getFlagEmoji(countryCode) {
    if (!countryCode || countryCode.length !== 2) return '🌐';
    const codePoints = countryCode
        .toUpperCase()
        .split('')
        .map(char => 127397 + char.charCodeAt());
    return String.fromCodePoint(...codePoints);
}

export class HistoryManager {
    constructor(dir, ext) {
        this.file = dir.get_child('history.json');
        this.ext = ext;
    }

    async readHistoryAsync() {
        return new Promise((resolve) => {
            if (!this.file.query_exists(null)) {
                resolve([]);
                return;
            }

            this.file.load_contents_async(null, (file, res) => {
                try {
                    let [success, contents] = file.load_contents_finish(res);
                    if (success) {
                        let decoder = new TextDecoder('utf-8');
                        resolve(JSON.parse(decoder.decode(contents)));
                    } else {
                        resolve([]);
                    }
                } catch (e) {
                    if (this.ext) this.ext.lg(`History read error: ${e}`);
                    resolve([]);
                }
            });
        });
    }

    async addEntryIfNeeded(locIP) {
        let history = await this.readHistoryAsync();
        
        if (history.length > 0) {
            if (history[0].primaryIp === locIP.primaryIp) return;
        }
        
        let entry = {
            timestamp: new Date().getTime(),
            ...locIP
        };
        
        history.unshift(entry);
        if (history.length > 100) history = history.slice(0, 100);
        
        let content = JSON.stringify(history, null, 2);
        let bytes = new GLib.Bytes(new TextEncoder().encode(content));
        
        this.file.replace_contents_bytes_async(bytes, null, false, Gio.FileCreateFlags.REPLACE_DESTINATION, null, (f, res) => {
            try {
                f.replace_contents_finish(res);
            } catch (e) {
                if (this.ext) this.ext.lg(`History write error: ${e}`);
            }
        });
    }
}

export const HistoryDialog = GObject.registerClass(
    class HistoryDialog extends ModalDialog.ModalDialog {
        _init(ext) {
            super._init({ styleClass: 'history-dialog' });
            this.ext = ext;
            this.historyItems = []; 
            
            // Allow Escape key to close without needing the massive bottom buttons
            this.connect('key-press-event', (actor, event) => {
                if (event.get_key_symbol() === Clutter.KEY_Escape) {
                    this.close();
                    return Clutter.EVENT_STOP;
                }
                return Clutter.EVENT_PROPAGATE;
            });

            let contentBox = new St.BoxLayout({
                vertical: true,
                style: 'padding: 16px; width: 850px;' // slightly wider for columnar view
            });
            
            // --- HEADER ROW (Title + Close Button) ---
            let titleBox = new St.BoxLayout({
                vertical: false,
                style: 'margin-bottom: 16px;',
                x_expand: true
            });

            let title = new St.Label({
                text: "IP Address History",
                style: 'font-weight: bold; font-size: 18px; color: #FFFFFF;',
                y_align: Clutter.ActorAlign.CENTER,
                x_expand: true
            });

            let closeBtn = new St.Button({
                label: "✖",
                style: 'padding: 6px 10px; border-radius: 6px; font-weight: bold; background-color: rgba(255,255,255,0.1); color: #FFFFFF;',
                reactive: true,
                track_hover: true,
                y_align: Clutter.ActorAlign.CENTER
            });
            closeBtn.connect('clicked', () => this.close());

            titleBox.add_child(title);
            titleBox.add_child(closeBtn);
            contentBox.add_child(titleBox);

            // --- SEARCH & EXPORT ROW ---
            let searchRow = new St.BoxLayout({
                vertical: false,
                style: 'margin-bottom: 16px;'
            });

            let searchEntry = new St.Entry({
                hint_text: "Search by IP, city, country, ISP, or coordinates...",
                style_class: 'search-entry',
                style: 'padding: 8px 12px; border-radius: 6px; background-color: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.15); color: white;',
                x_expand: true,
                can_focus: true
            });
            
            searchEntry.clutter_text.connect('text-changed', () => {
                let query = searchEntry.get_text().toLowerCase();
                for (let item of this.historyItems) {
                    if (item.searchText.includes(query)) {
                        item.widget.show();
                    } else {
                        item.widget.hide();
                    }
                }
            });

            let exportBtn = new St.Button({
                label: "Export CSV",
                style_class: 'button',
                style: 'margin-left: 12px; padding: 6px 16px; font-weight: bold; border-radius: 6px;',
                reactive: true,
                track_hover: true,
                y_align: Clutter.ActorAlign.CENTER
            });

            exportBtn.connect('clicked', () => {
                let csvContent = "Date,IPv4,IPv6,Country,Country Code,City,ISP/Org,ASN,Latitude,Longitude\n";
                
                for (let item of this.historyItems) {
                    if (item.widget.visible) {
                        let e = item.data;
                        let dateStr = new Date(e.timestamp).toLocaleString();
                        let row = `"${dateStr}","${e.ipv4 || ''}","${e.ipv6 || ''}","${e.countryName || ''}","${e.countryCode || ''}","${e.cityName || ''}","${e.org || ''}","${e.asn || ''}","${e.latitude || ''}","${e.longitude || ''}"\n`;
                        csvContent += row;
                    }
                }

                let downloadsDir = GLib.get_user_special_dir(GLib.UserDirectory.DIRECTORY_DOWNLOAD);
                if (!downloadsDir) downloadsDir = GLib.get_home_dir();
                
                let filename = `IP_History_${new Date().getTime()}.csv`;
                let path = GLib.build_filenamev([downloadsDir, filename]);
                let file = Gio.File.new_for_path(path);
                
                let bytes = new GLib.Bytes(new TextEncoder().encode(csvContent));
                
                file.replace_contents_bytes_async(bytes, null, false, Gio.FileCreateFlags.REPLACE_DESTINATION, null, (f, res) => {
                    try {
                        f.replace_contents_finish(res);
                        exportBtn.set_label("Saved to Downloads!");
                    } catch (err) {
                        this.ext.lg(`CSV Export Error: ${err}`);
                        exportBtn.set_label("Export Failed!");
                    }
                    GLib.timeout_add(GLib.PRIORITY_DEFAULT, 2000, () => {
                        if (exportBtn && exportBtn.get_parent && exportBtn.get_parent()) {
                            exportBtn.set_label("Export CSV");
                        }
                        return GLib.SOURCE_REMOVE;
                    });
                });
            });

            searchRow.add_child(searchEntry);
            searchRow.add_child(exportBtn);
            contentBox.add_child(searchRow);

            // --- TABLE LAYOUT ---
            let scrollView = new St.ScrollView({
                style: 'height: 450px; background-color: rgba(0,0,0,0.2); border-radius: 8px; padding: 12px; border: 1px solid rgba(0,0,0,0.4);',
                x_expand: true,
                y_expand: true,
                hscrollbar_policy: St.PolicyType.NEVER,
                vscrollbar_policy: St.PolicyType.AUTOMATIC
            });
            
            let historyList = new St.BoxLayout({
                vertical: true,
                style: 'spacing: 8px;'
            });

            // Column Header
            let colHeaderRow = new St.BoxLayout({
                vertical: false,
                style: 'padding-bottom: 8px; border-bottom: 1px solid rgba(255,255,255,0.1); margin-bottom: 4px;'
            });
            colHeaderRow.add_child(new St.Label({ text: "Date", style: 'width: 140px; font-weight: bold; color: #aaaaaa;' }));
            colHeaderRow.add_child(new St.Label({ text: "IP Addresses", style: 'width: 180px; font-weight: bold; color: #aaaaaa;' }));
            colHeaderRow.add_child(new St.Label({ text: "Location", style: 'width: 170px; font-weight: bold; color: #aaaaaa;' }));
            colHeaderRow.add_child(new St.Label({ text: "ISP", style: 'width: 160px; font-weight: bold; color: #aaaaaa;' }));
            colHeaderRow.add_child(new St.Label({ text: "Actions", style: 'width: 100px; font-weight: bold; color: #aaaaaa;' }));
            historyList.add_child(colHeaderRow);

            this.ext.historyManager.readHistoryAsync().then(history => {
                if (history.length === 0) {
                    historyList.add_child(new St.Label({ text: "No history available yet.", style: 'color: #aaaaaa; margin-top: 10px;' }));
                }

                let withCopyConfirm = (btn, textToCopy, originalLabel) => {
                    btn.connect('clicked', () => {
                        if (textToCopy && textToCopy !== "N/A") {
                            St.Clipboard.get_default().set_text(St.ClipboardType.CLIPBOARD, textToCopy);
                            btn.set_label("Copied ✔");
                            GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1500, () => {
                                if (btn && btn.get_parent && btn.get_parent()) {
                                    btn.set_label(originalLabel);
                                }
                                return GLib.SOURCE_REMOVE;
                            });
                        }
                    });
                };

                let mapProvider = this.ext.settings.get_string('map-provider');

                for (let entry of history) {
                    let date = new Date(entry.timestamp);
                    let dateStr = `${date.toLocaleDateString()}\n${date.toLocaleTimeString()}`;
                    let fullSearchString = `${date.toLocaleDateString()} ${date.toLocaleTimeString()} ${entry.ipv4} ${entry.ipv6} ${entry.countryName} ${entry.countryCode} ${entry.cityName} ${entry.org} ${entry.asn} ${entry.latitude} ${entry.longitude}`.toLowerCase();
                    
                    // Table Row
                    let rowBox = new St.BoxLayout({
                        vertical: false,
                        style: 'padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.05);'
                    });

                    // 1. Date Col
                    let dateLabel = new St.Label({
                        text: dateStr,
                        style: 'width: 140px; font-size: 13px; color: #dddddd;',
                        y_align: Clutter.ActorAlign.CENTER
                    });
                    rowBox.add_child(dateLabel);

                    // 2. IPs Col
                    let ipColBox = new St.BoxLayout({ vertical: true, style: 'width: 180px; spacing: 4px;', y_align: Clutter.ActorAlign.CENTER });
                    
                    let v4LabelStr = entry.ipv4 || "N/A";
                    let v4Btn = new St.Button({ label: `v4: ${v4LabelStr}`, style: 'color: #E95420; text-decoration: underline; background-color: transparent; text-align: left;', reactive: true });
                    withCopyConfirm(v4Btn, entry.ipv4, `v4: ${v4LabelStr}`);
                    ipColBox.add_child(v4Btn);

                    let v6LabelStr = entry.ipv6 || "N/A";
                    let v6Btn = new St.Button({ label: `v6: ${v6LabelStr}`, style: 'color: #E95420; text-decoration: underline; background-color: transparent; text-align: left;', reactive: true });
                    withCopyConfirm(v6Btn, entry.ipv6, `v6: ${v6LabelStr}`);
                    ipColBox.add_child(v6Btn);

                    rowBox.add_child(ipColBox);

                    // 3. Location Col (With Flag)
                    let locColBox = new St.BoxLayout({ vertical: true, style: 'width: 170px; spacing: 2px;', y_align: Clutter.ActorAlign.CENTER });
                    let flagEmoji = getFlagEmoji(entry.countryCode);
                    let countryLabel = new St.Label({ text: `${flagEmoji} ${entry.countryName}`, style: 'color: #ffffff; font-weight: bold; font-size: 13px;' });
                    let cityLabel = new St.Label({ text: entry.cityName || 'Unknown City', style: 'color: #aaaaaa; font-size: 12px;' });
                    locColBox.add_child(countryLabel);
                    locColBox.add_child(cityLabel);
                    rowBox.add_child(locColBox);

                    // 4. ISP Col
                    let ispLabel = new St.Label({
                        text: entry.org || entry.asn || 'Unknown',
                        style: 'width: 160px; color: #dddddd; font-size: 13px;',
                        y_align: Clutter.ActorAlign.CENTER
                    });
                    // Simple text wrapping fix for long ISP names inside St
                    ispLabel.clutter_text.line_wrap = true;
                    ispLabel.clutter_text.line_wrap_mode = 1; // Pango.WrapMode.CHAR
                    rowBox.add_child(ispLabel);

                    // 5. Actions Col
                    let actionsColBox = new St.BoxLayout({ vertical: true, style: 'width: 100px; spacing: 6px;', y_align: Clutter.ActorAlign.CENTER });
                    
                    let copyAllBtn = new St.Button({
                        label: "Copy Info",
                        style_class: 'button',
                        style: 'padding: 2px 8px; font-size: 12px; border-radius: 4px;',
                        reactive: true,
                        track_hover: true
                    });
                    
                    let fullText = `Date: ${dateStr.replace('\n', ' ')}\nIPv4: ${entry.ipv4 || 'N/A'}\nIPv6: ${entry.ipv6 || 'N/A'}\nLocation: ${entry.countryName}, ${entry.cityName}\nISP: ${entry.org || entry.asn || 'N/A'}\nCoordinates: ${entry.latitude}, ${entry.longitude}`;
                    withCopyConfirm(copyAllBtn, fullText, "Copy Info");
                    actionsColBox.add_child(copyAllBtn);

                    let mapBtn = new St.Button({ 
                        label: "Map View ↗", 
                        style: 'color: #62A0EA; text-decoration: underline; background-color: transparent; font-size: 12px;', // Standard blue link instead of orange
                        reactive: true 
                    });
                    
                    mapBtn.connect('clicked', () => {
                        let mapsUrl = `https://maps.google.com/?q=${entry.latitude},${entry.longitude}`;
                        if (mapProvider === 'osm') {
                            mapsUrl = `https://www.openstreetmap.org/?mlat=${entry.latitude}&mlon=${entry.longitude}#map=12/${entry.latitude}/${entry.longitude}`;
                        } else if (mapProvider === 'apple') {
                            mapsUrl = `https://maps.apple.com/?ll=${entry.latitude},${entry.longitude}`;
                        }
                        
                        try {
                            Gio.app_info_launch_default_for_uri(mapsUrl, null);
                        } catch (err) {
                            this.ext.lg(`Map Link Error: ${err}`);
                        }
                    });
                    actionsColBox.add_child(mapBtn);

                    rowBox.add_child(actionsColBox);

                    this.historyItems.push({ widget: rowBox, searchText: fullSearchString, data: entry });
                    historyList.add_child(rowBox);
                }
            });

            scrollView.add_child(historyList);
            contentBox.add_child(scrollView);
            this.contentLayout.add_child(contentBox);
        }
    }
);