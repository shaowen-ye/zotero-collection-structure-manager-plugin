var CollectionStructureManagerPlugin;

function log(msg) {
  Zotero.debug("Collection Structure Manager: " + msg);
}

function install() {
  log("Installed");
}

async function startup({ id, version, rootURI }) {
  log(`Starting ${version}`);
  Services.scriptloader.loadSubScript(rootURI + "collection-structure-manager-plugin.js");
  CollectionStructureManagerPlugin.init({ id, version, rootURI });
  CollectionStructureManagerPlugin.addToAllWindows();
}

function onMainWindowLoad({ window }) {
  CollectionStructureManagerPlugin.addToWindow(window);
}

function onMainWindowUnload({ window }) {
  CollectionStructureManagerPlugin.removeFromWindow(window);
}

function shutdown() {
  log("Shutting down");
  if (CollectionStructureManagerPlugin) {
    CollectionStructureManagerPlugin.removeFromAllWindows();
    CollectionStructureManagerPlugin = undefined;
  }
}

function uninstall() {
  log("Uninstalled");
}
