# Show External IP (thisipcan.cyou) GNOME extension
This GNOME extension displays your external IP in the Toolbar and sends a system notification if changed.

The solution watches for local network events and uses the free thisipcan.cyou service. It also refreshes every few mins to check if the external IP has been changed. This extension is handy to quickly see your public IP and is especially handy for those who work at different locations or with different VPNs. The country's public IP is also displayed with a small flag.

Notifications when changed:

[<img src="https://user-images.githubusercontent.com/4825211/194649944-fc0ab2ae-2fcd-44eb-83b7-0cf586bbb4fc.png" width="55%"/>](notification.png)

Clicking the IP in the top bar allows you to copy it and see location/city details:

[<img src="https://user-images.githubusercontent.com/4825211/194650537-8a02577e-a5c7-477e-a431-91c6b2647d83.png" width="55%"/>](click.png)


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
