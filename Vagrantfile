# -*- mode: ruby -*-
# vi: set ft=ruby :

VAGRANT_PROXYCONF_ENDPOINT = ENV["VAGRANT_PROXYCONF_ENDPOINT"]
VAGRANTFILE_API_VERSION = "2"

Vagrant.configure(VAGRANTFILE_API_VERSION) do |config|
  config.vm.box = "ubuntu/trusty64"

  config.vm.provider :virtualbox do |vb|
    # You may want to boost this up if you have enough RAM.
    vb.customize ["modifyvm", :id, "--memory", "2048"]
  end

  # Wire up the proxy if:
  #
  #   - The vagrant-proxyconf Vagrant plugin is installed
  #   - The user set the VAGRANT_PROXYCONF_ENDPOINT environment variable
  #
  if Vagrant.has_plugin?("vagrant-proxyconf") &&
     !VAGRANT_PROXYCONF_ENDPOINT.nil?
    config.proxy.http     = VAGRANT_PROXYCONF_ENDPOINT
    config.proxy.https    = VAGRANT_PROXYCONF_ENDPOINT
    config.proxy.no_proxy = "localhost,127.0.0.1"
  end

  config.vm.define "converter" do |converter|
    converter.vm.hostname = "tile-converter"

    if Vagrant::Util::Platform.windows? || Vagrant::Util::Platform.cygwin?
      converter.vm.synced_folder ".", "/vagrant", type: "rsync"
    else
      converter.vm.synced_folder ".", "/vagrant"
    end

    # Tessera defaults to 8080.
    converter.vm.network "forwarded_port", {
      guest: 8080,
      host: 8080
    }

    converter.vm.provision "ansible" do |ansible|
      ansible.extra_vars = {
        mapbox_access_token: "YOUR_KEY_HERE"
      }
      ansible.playbook = "deployment/ansible/tile-converter.yml"
      ansible.raw_arguments = ["--timeout=60"]
    end
  end
end
