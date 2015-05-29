# Tile Converter Virtual Machine

This project consists of an ansible role which will provision a virtualbox virtual machine using Vagrant. Once provisioned it provides tools to allow you to view and extract map tiles from a tm2 folder created with Mapbox Studio.


## Requirements

 * [VirtualBox](https://www.virtualbox.org/)
 * [Vagrant](https://www.vagrantup.com/)
 * [Ansible](http://docs.ansible.com/intro_installation.html)


## Before you start

Open the ```Vagrantfile``` and change some values. The default RAM for this VM is 512Mb. This is not much and may be too slow for you. If you can spare the RAM, 2048 would be better. The default will be fine if this intimidates you for some reason.

If you are using a datasource from Mapbox rather than your own, you will need your Mapbox API key. Log in to your Mapbox account and get the Access Token. Paste it into the ```VagrantFile``` where noted. If you use local sources, this may not be necessary.


## Usage

You will need to use the command line to use these tools. Some familiarity with basic command line navigation on Linux/Unix will be helpful.

This folder will be mounted inside the virtual machine at /vagrant. So you will likely want to copy your tm2 folder here to access it within the VM.

Once copies of the project folder are on the server you should be able to start a demo map server by entering the following command: ```tessera tmstyle:///path/to/your/mapproject.tm2```

If you've added the project to this same folder then it should be mounted at ```/vagrant``` and you can use the following:  ```tessera tmstyle:///vagrant/mapproject.tm2```

To export to a raster mbtiles file use ```tl``` with a command similar to the following:

```tl copy -z 17 -Z 18 -b "-75.171375 39.945049 -75.15554 39.956991" tmstyle:///path/to/your/mapproject.tm2 mbtiles:///path/to/save/tiles.mbtiles```

or if you are using the vagrant mount:

```tl copy -z 17 -Z 18 -b "-75.171375 39.945049 -75.15554 39.956991" tmstyle:///vagrant/mapproject.tm2 mbtiles:///vagrant/tiles.mbtiles```

This will create a raster tile set from zoom extents 17 through 18 with the specified bounds. In practice you probably don't want to create too large a set as this can take quite a lot of space and will take a long time. You should then see the ```tiles.mbtiles``` file in this directory.


## Fonts

If you see an error about missing fonts, you will need to supply your fonts to the virtual machine. There is a font folder in place. Copy any necessary fonts to that folder and start the command again. It should work as mapnik has been set to look for fonts in this directory.


## License

This code is released under an ISC License (http://opensource.org/licenses/ISC) so you are free to do with it what you will. I chose this because of a patch I applied to tilelive-streaming that required copying one of its files and it was released under this same license.
