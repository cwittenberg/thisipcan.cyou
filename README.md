# Show External IP (thisipcan.cyou) GNOME extension
This GNOME extension displays your external IP in the Toolbar and sends a system notification if changed.

The solution uses the thisipcan.cyou service and refreshes every 2 mins. This extension is handy to quickly see your public IP and is especially handy for those who work at different locations or with different VPNs.

# Screenshot
![image](https://user-images.githubusercontent.com/4825211/192637499-b1459699-467d-4072-afb7-55b9e9578abe.png)

# Installation
After completing one of the installation methods below, restart GNOME Shell (Xorg: Alt+F2, r, Enter - Wayland: log out or reboot) and enable the extension through the gnome-extensions app.

## From source
Go to your extension directory and clone this repo
        
    cd ~/.local/share/gnome-shell/extensions/
    git clone https://github.com/cwittenberg/thisipcan.cyou external-ip-extension@ipcan.cyou 

## From official GNOME Extensions site
(Pending review)

# License
The thisipcan.cyou gnome extension is free software; you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation; either version 3 of the License, or (at your option) any later version.

# Author
Developed by Christian Wittenberg.
Questions: gnome@ipcan.cyou
