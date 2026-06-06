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

export class HistoryManager {
    constructor(dir) {
        this.file = dir.get_child('history.json');
    }

    readHistory() {
        try {
            if (this.file.query_exists(null)) {
                let [success, contents] = this.file.load_contents(null);
                if (success) {
                    let decoder = new TextDecoder('utf-8');
                    return JSON.parse(decoder.decode(contents));
                }
            }
        } catch (e) {
            console.log(`[ShowExternalIP] History read error: ${e}`);
        }
        return [];
    }

    addEntryIfNeeded(locIP) {
        let history = this.readHistory();
        if (history.length > 0) {
            // Prevent duplicate contiguous entries
            if (history[0].primaryIp === locIP.primaryIp) return;
        }
        
        let entry = {
            timestamp: new Date().getTime(),
            ...locIP
        };
        
        history.unshift(entry);
        // Keep cache clean - max 100 entries
        if (history.length > 100) history = history.slice(0, 100);
        
        try {
            let content = JSON.stringify(history, null, 2);
            let uint8Array = new TextEncoder().encode(content);
            this.file.replace_contents(uint8Array, null, false, Gio.FileCreateFlags.REPLACE_DESTINATION, null);
        } catch (e) {
            console.log(`[ShowExternalIP] History write error: ${e}`);
        }
    }
}

export const HistoryDialog = GObject.registerClass(
    class HistoryDialog extends ModalDialog.ModalDialog {
        _init(ext) {
            super._init({ styleClass: 'history-dialog' });
            this.ext = ext;
            this.historyItems = []; 
            
            this.setButtons([{
                label: "Close",
                action: () => this.close(),
                key: Clutter.KEY_Escape
            }]);

            let contentBox = new St.BoxLayout({
                vertical: true,
                style: 'padding: 16px; width: 680px;'
            });
            
            let title = new St.Label({
                text: "IP Address History",
                style: 'font-weight: bold; font-size: 18px; margin-bottom: 12px;'
            });
            contentBox.add_child(title);

            let searchRow = new St.BoxLayout({
                vertical: false,
                style: 'margin-bottom: 16px;'
            });

            let searchEntry = new St.Entry({
                hint_text: "Search by IP, city, country, ISP, or coordinates...",
                style: 'padding: 8px; border-radius: 6px; background-color: rgba(255,255,255,0.1); color: white;',
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
                style: 'background-color: #40a02b; color: #1e1e2e; border-radius: 6px; padding: 6px 16px; font-weight: bold; margin-left: 12px;',
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

                try {
                    let downloadsDir = GLib.get_user_special_dir(GLib.UserDirectory.DIRECTORY_DOWNLOAD);
                    if (!downloadsDir) downloadsDir = GLib.get_home_dir();
                    
                    let filename = `IP_History_${new Date().getTime()}.csv`;
                    let path = GLib.build_filenamev([downloadsDir, filename]);
                    let file = Gio.File.new_for_path(path);
                    
                    let uint8Array = new TextEncoder().encode(csvContent);
                    file.replace_contents(uint8Array, null, false, Gio.FileCreateFlags.REPLACE_DESTINATION, null);

                    exportBtn.set_label("Saved to Downloads!");
                    GLib.timeout_add(GLib.PRIORITY_DEFAULT, 2000, () => {
                        if (exportBtn && exportBtn.get_parent && exportBtn.get_parent()) {
                            exportBtn.set_label("Export CSV");
                        }
                        return GLib.SOURCE_REMOVE;
                    });
                } catch (err) {
                    this.ext.lg(`CSV Export Error: ${err}`);
                    exportBtn.set_label("Export Failed!");
                }
            });

            searchRow.add_child(searchEntry);
            searchRow.add_child(exportBtn);
            contentBox.add_child(searchRow);

            let scrollView = new St.ScrollView({
                style: 'height: 450px; background-color: rgba(0,0,0,0.3); border-radius: 8px; padding: 12px;',
                x_expand: true,
                y_expand: true,
                hscrollbar_policy: St.PolicyType.NEVER,
                vscrollbar_policy: St.PolicyType.AUTOMATIC
            });
            
            let historyList = new St.BoxLayout({
                vertical: true,
                style: 'spacing: 12px;'
            });

            let history = this.ext.historyManager.readHistory();
            
            if (history.length === 0) {
                historyList.add_child(new St.Label({ text: "No history available yet." }));
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
                let dateStr = `${date.toLocaleDateString()} ${date.toLocaleTimeString()}`;
                let fullSearchString = `${dateStr} ${entry.ipv4} ${entry.ipv6} ${entry.countryName} ${entry.countryCode} ${entry.cityName} ${entry.org} ${entry.asn} ${entry.latitude} ${entry.longitude}`.toLowerCase();
                
                let entryBox = new St.BoxLayout({
                    vertical: true,
                    style: 'background-color: rgba(255,255,255,0.05); border-radius: 8px; padding: 16px;'
                });

                let headerBox = new St.BoxLayout({
                    vertical: false,
                    x_expand: true
                });
                
                let dateLabel = new St.Label({
                    text: dateStr,
                    style: 'font-weight: bold; font-size: 16px; color: #a6adc8;',
                    y_align: Clutter.ActorAlign.CENTER,
                    x_expand: true
                });
                
                let copyAllBtn = new St.Button({
                    label: "Copy Full Record",
                    style: 'background-color: #313244; color: #cdd6f4; border-radius: 6px; padding: 6px 12px; font-size: 13px; font-weight: bold;',
                    reactive: true,
                    track_hover: true,
                    y_align: Clutter.ActorAlign.CENTER
                });
                
                let fullText = `Date: ${dateStr}\nIPv4: ${entry.ipv4 || 'N/A'}\nIPv6: ${entry.ipv6 || 'N/A'}\nLocation: ${entry.countryName}, ${entry.cityName}\nISP: ${entry.org || entry.asn || 'N/A'}\nCoordinates: ${entry.latitude}, ${entry.longitude}`;
                withCopyConfirm(copyAllBtn, fullText, "Copy Full Record");
                
                headerBox.add_child(dateLabel);
                headerBox.add_child(copyAllBtn);
                entryBox.add_child(headerBox);

                let ipBox = new St.BoxLayout({ vertical: false, style: 'spacing: 8px; margin-top: 12px;' });
                
                let v4Box = new St.BoxLayout({ vertical: false, style: 'spacing: 6px;' });
                v4Box.add_child(new St.Label({ text: "IPv4:", style: 'color: #89b4fa; font-weight: bold;' }));
                let v4LabelStr = entry.ipv4 || "N/A";
                let v4Btn = new St.Button({ label: v4LabelStr, style: 'color: #cdd6f4; text-decoration: underline;', reactive: true });
                withCopyConfirm(v4Btn, entry.ipv4, v4LabelStr);
                v4Box.add_child(v4Btn);

                let v6Box = new St.BoxLayout({ vertical: false, style: 'spacing: 6px; margin-left: 24px;' });
                v6Box.add_child(new St.Label({ text: "IPv6:", style: 'color: #89b4fa; font-weight: bold;' }));
                let v6LabelStr = entry.ipv6 || "N/A";
                let v6Btn = new St.Button({ label: v6LabelStr, style: 'color: #cdd6f4; text-decoration: underline;', reactive: true });
                withCopyConfirm(v6Btn, entry.ipv6, v6LabelStr);
                v6Box.add_child(v6Btn);

                ipBox.add_child(v4Box);
                ipBox.add_child(v6Box);

                entryBox.add_child(ipBox);

                let locBox = new St.BoxLayout({ vertical: false, style: 'spacing: 8px; margin-top: 8px;' });
                locBox.add_child(new St.Label({ text: "Location:", style: 'color: #f9e2af; font-weight: bold;' }));
                locBox.add_child(new St.Label({ text: `${entry.countryName} (${entry.countryCode}), ${entry.cityName}` }));
                entryBox.add_child(locBox);

                let ispBox = new St.BoxLayout({ vertical: false, style: 'spacing: 8px; margin-top: 8px;' });
                ispBox.add_child(new St.Label({ text: "ISP:", style: 'color: #f9e2af; font-weight: bold;' }));
                ispBox.add_child(new St.Label({ text: `${entry.org || entry.asn || 'Unknown'}` }));
                entryBox.add_child(ispBox);

                let mapBox = new St.BoxLayout({ vertical: false, style: 'spacing: 8px; margin-top: 8px;' });
                mapBox.add_child(new St.Label({ text: "Coordinates:", style: 'color: #f38ba8; font-weight: bold;' }));
                
                let providerName = mapProvider === 'osm' ? 'OSM' : (mapProvider === 'apple' ? 'Apple Maps' : 'Google Maps');
                let mapBtn = new St.Button({ label: `${entry.latitude}, ${entry.longitude} (Open in ${providerName})`, style: 'color: #cdd6f4; text-decoration: underline;', reactive: true });
                
                mapBtn.connect('clicked', () => {
                    let mapsUrl = `https://www.google.com/maps?q=$${entry.latitude},${entry.longitude}`;
                    if (mapProvider === 'osm') {
                        mapsUrl = `https://www.openstreetmap.org/?mlat=${entry.latitude}&mlon=${entry.longitude}#map=12/${entry.latitude}/${entry.longitude}`;
                    } else if (mapProvider === 'apple') {
                        mapsUrl = `https://maps.apple.com/?ll=${entry.latitude},${entry.longitude}`;
                    }
                    GLib.spawn_command_line_async(`xdg-open "${mapsUrl}"`);
                });
                
                mapBox.add_child(mapBtn);
                entryBox.add_child(mapBox);

                this.historyItems.push({ widget: entryBox, searchText: fullSearchString, data: entry });
                historyList.add_child(entryBox);
            }

            scrollView.add_child(historyList);
            contentBox.add_child(scrollView);
            this.contentLayout.add_child(contentBox);
        }
    }
);