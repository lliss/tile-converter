# Tile Converter Virtual Machine

This project consists of an ansible role which will provision a virtualbox virtual machine using Vagrant. Once provisioned it provides tools to allow you to view and extract map tiles from a tm2 folder creted with Mapbox Studio.

## Requirements

 * [VirtualBox](https://www.virtualbox.org/)
 * [Vagrant](https://www.vagrantup.com/)
 * [Ansible](http://docs.ansible.com/intro_installation.html)

## Before you start

Open the ```Vagrantfile``` and change some values. The default RAM for this VM is 512Mb. This is not much and may be too slow for you. If you can spare the RAM, 2048 would be better. The default will be fine if this intimidates you for some reason.

If you are using a datasource from Mapbox rather than your own, you will need your Mapbox API key. Log in to your Mapbox account and get the Access Token. Paste it into the ```VagrantFile``` where noted. If you use local sources, this may not be necessary.

## Usage

You will need to use the command line to use these tools. Some familiraity with basic command line navigation on Linux/Unix will be helpful.

This folder will be mounted inside the virtual machine at /vagrant. So you will likeley want to copy your tm2 folder here to access it within the VM.

Once copies

