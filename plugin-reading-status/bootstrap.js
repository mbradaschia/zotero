/* global Zotero, ChromeUtils, Services, Cc, Ci */

let lifecycle = null;
let chromeHandle = null;

async function startup({ id, version, rootURI }, reason) {
	// ChromeUtils.importESModule only accepts chrome:// and resource:// URLs,
	// not jar:file:// (which is what rootURI is). Register a chrome content
	// alias for our `content/` directory so we can import the main module via
	// chrome://reading-status/content/main.mjs.
	let aomStartup = Cc['@mozilla.org/addons/addon-manager-startup;1']
		.getService(Ci.amIAddonManagerStartup);
	let manifestURI = Services.io.newURI(rootURI + 'manifest.json');
	chromeHandle = aomStartup.registerChrome(manifestURI, [
		['content', 'reading-status', 'content/'],
	]);

	lifecycle = ChromeUtils.importESModule(
		'chrome://reading-status/content/main.mjs'
	);
	await lifecycle.startup({ id, version, rootURI, reason });
}

async function onMainWindowLoad({ window }, reason) {
	if (lifecycle) {
		await lifecycle.onMainWindowLoad({ window, reason });
	}
}

async function onMainWindowUnload({ window }, reason) {
	if (lifecycle) {
		await lifecycle.onMainWindowUnload({ window, reason });
	}
}

async function shutdown(_params, reason) {
	if (lifecycle) {
		await lifecycle.shutdown({ reason });
		lifecycle = null;
	}
	if (chromeHandle) {
		chromeHandle.destruct();
		chromeHandle = null;
	}
}

function install() {}
function uninstall() {}
