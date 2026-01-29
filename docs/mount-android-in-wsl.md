# Sync Android Phone



## Native way

```sh
 usbipd list
 usbipd bind --busid <busid>
 usbipd attach --wsl --busid <busid>
 ```

To reset:

```sh
usbipd detach --all
```

### WSL

If there are issues, make a new folder to jmptfs to

```sh
sudo apt update && sudo apt install jmtpfs
sudo mkdir /media/android
sudo jmtpfs -o allow_other /media/android/
```

unmount
```sh
sudo fusermount -u /media/android7
```

Powershell:
```sh
usbipd unbind --busid <BUSID>.
```
