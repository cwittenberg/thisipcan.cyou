import Adw from 'gi://Adw?version=1';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk?version=4.0';
import { ExtensionPreferences } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

function createLinkButton(title, uri, styleClass = null) {
    const button = new Gtk.Button({
        label: title,
        valign: Gtk.Align.CENTER
    });
    
    if (styleClass) {
        button.add_css_class(styleClass);
    }
    
    button.connect('clicked', () => {
        Gio.app_info_launch_default_for_uri(uri, null);
    });
    
    return button;
}

function wrap(row) {
    if (row && typeof row.set_subtitle_lines === 'function') {
        row.set_subtitle_lines(0);
    }
    return row;
}

export default class ShowExternalIPPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();
        
        const pageSettings = new Adw.PreferencesPage({
            title: 'Settings & About',
            icon_name: 'dialog-information-symbolic'
        });

        // --- Panel Display Settings ---
        const groupDisplay = new Adw.PreferencesGroup({ title: 'Top Bar Display Options' });

        const rowTitleMode = new Adw.ComboRow({
            title: 'Information to Show',
            subtitle: 'Choose what is displayed in the GNOME panel',
            model: Gtk.StringList.new(['IP Address', 'Country Flag Only', 'ISP / Organization Name'])
        });
        
        let currentMode = settings.get_string('title-display-mode');
        if (currentMode === 'flag-only') rowTitleMode.selected = 1;
        else if (currentMode === 'isp') rowTitleMode.selected = 2;
        else rowTitleMode.selected = 0;

        rowTitleMode.connect('notify::selected', () => {
            if (rowTitleMode.selected === 1) settings.set_string('title-display-mode', 'flag-only');
            else if (rowTitleMode.selected === 2) settings.set_string('title-display-mode', 'isp');
            else settings.set_string('title-display-mode', 'ip');
        });

        const rowPriority = new Adw.ComboRow({
            title: 'IP Version Priority',
            subtitle: 'If both are available, which IP version to display in the panel',
            model: Gtk.StringList.new(['Prefer IPv4', 'Prefer IPv6'])
        });

        let currentPriority = settings.get_string('ip-version-priority');
        rowPriority.selected = (currentPriority === 'ipv6') ? 1 : 0;

        rowPriority.connect('notify::selected', () => {
            settings.set_string('ip-version-priority', rowPriority.selected === 1 ? 'ipv6' : 'ipv4');
        });

        // Toggle sensitivity based on display mode
        const syncSensitivity = () => {
            rowPriority.set_sensitive(rowTitleMode.selected === 0);
        };
        rowTitleMode.connect('notify::selected', syncSensitivity);
        syncSensitivity();

        groupDisplay.add(wrap(rowTitleMode));
        groupDisplay.add(wrap(rowPriority));

        // --- Extension Information Group ---
        const groupAboutInfo = new Adw.PreferencesGroup({ title: 'Extension Information' });

        const logoRow = new Adw.ActionRow({
            title: 'Show External IP',
            subtitle: 'Quickly see your public IP and country in the GNOME Top Bar.'
        });

        const versionStr = this.metadata.version ? this.metadata.version.toString() : 'Local / Development';
        const rowVersion = new Adw.ActionRow({ title: 'Version', subtitle: versionStr });
        const rowAuthor = new Adw.ActionRow({ title: 'Author', subtitle: 'Christian Wittenberg' });
        
        groupAboutInfo.add(wrap(logoRow));
        groupAboutInfo.add(wrap(rowVersion));
        groupAboutInfo.add(wrap(rowAuthor));

        // --- Advanced Settings Group ---
        const groupAdvanced = new Adw.PreferencesGroup({ title: 'Advanced Configuration' });
        
        const rowDebugLogs = new Adw.ActionRow({
            title: 'Enable Debug Logging',
            subtitle: 'Outputs verbose troubleshooting logs to journalctl'
        });
        
        const switchDebugLogs = new Gtk.Switch({
            active: settings.get_boolean('enable-debug-logs'),
            valign: Gtk.Align.CENTER
        });
        
        settings.bind('enable-debug-logs', switchDebugLogs, 'active', Gio.SettingsBindFlags.DEFAULT);
        rowDebugLogs.add_suffix(switchDebugLogs);
        groupAdvanced.add(wrap(rowDebugLogs));

        // --- Support & Links Group ---
        const groupLinks = new Adw.PreferencesGroup();

        const linkBox = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            spacing: 12,
            halign: Gtk.Align.CENTER,
            margin_top: 24,
            margin_bottom: 24
        });

        linkBox.append(createLinkButton('Buy me a coffee 💙☕', 'https://ko-fi.com/cwittenberg', 'suggested-action'));
        linkBox.append(createLinkButton('Report a Bug 🪲', 'https://github.com/cwittenberg/thisipcan.cyou/issues/new'));
        linkBox.append(createLinkButton('Request a Feature', 'https://github.com/cwittenberg/thisipcan.cyou/issues/new'));

        groupLinks.add(linkBox);

        pageSettings.add(groupDisplay);
        pageSettings.add(groupLinks);
        pageSettings.add(groupAboutInfo);
        pageSettings.add(groupAdvanced);

        window.add(pageSettings);
    }
}