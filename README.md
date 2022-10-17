# Show External IP (thisipcan.cyou) GNOME extension
This GNOME extension displays your external IP in the Toolbar and sends a system notification if changed.

- See your public IP in the tray bar, including country flag (of the active public IP)
- Get notified when your public IP is changed. 
- Copy the IP (or other information) to the clipboard quickly by clicking menu items.
- Clicking the map will open Google Maps to the location found.

Notification (left) and menu options (right):

![image](https://user-images.githubusercontent.com/4825211/196243623-3d998bf2-f0ed-418d-a43c-6bdfae1314c3.png)

The solution watches for local network events and uses the free thisipcan.cyou service. It also refreshes every few mins to check if the external IP has been changed. This extension is handy to quickly see your public IP and is especially handy for those who work at different locations or with different VPNs.

# Installation
After completing one of the installation methods below, restart GNOME Shell (Xorg: Alt+F2, r, Enter - Wayland: log out or reboot) and enable the extension through the gnome-extensions app.

## From official GNOME Extensions site
Visit the official GNOME page to quickly Toggle enablement of the extension here:

[<img src="https://raw.githubusercontent.com/cwittenberg/thisipcan.cyou/main/img/get-it-on-ego.svg?sanitize=true" alt="Get it on GNOME Extensions" height="100" align="middle">](https://extensions.gnome.org/extension/5368/show-external-ip-thisipcancyou/)

## Using GNOME Extension Manager
Start Extension Manager in GNOME and search for 'External IP' which will show you the extension with a quick 'Install' button.

![image](https://user-images.githubusercontent.com/4825211/192793423-17aa2a49-0a2a-48ff-8bce-24ca097ef0fd.png)

## From source
Go to your extension directory and clone this repo
        
    cd ~/.local/share/gnome-shell/extensions/
    git clone https://github.com/cwittenberg/thisipcan.cyou external-ip-extension@ipcan.cyou 

# License
The thisipcan.cyou gnome extension is free software; you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation; either version 3 of the License, or (at your option) any later version.

# Author
Developed by Christian Wittenberg.
Questions: gnome@ipcan.cyou
