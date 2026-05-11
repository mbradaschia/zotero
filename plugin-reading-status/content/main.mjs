/* global Zotero, Services, ChromeUtils, Cc, Ci */

import * as ReadingStatus from './readingStatus.js';
import { openKanbanTab } from './kanbanTab.js';

const PLUGIN_ID = 'reading-status@example.com';
const FTL_NAME = 'reading-status.ftl';
const L10N_SOURCE_NAME = 'reading-status';

let state = {
	rootURI: null,
	infoRowID: null,
	columnID: null,
	menuIDs: [],
	stylesheetURI: null,
	l10nSourceRegistered: false,
	windows: new Set(),
	// window -> Set<tabID> for Kanban tabs we've opened in that window
	openTabs: new WeakMap(),
};

export async function startup({ rootURI }) {
	state.rootURI = rootURI;

	// Expose helpers on the Zotero namespace so anything else in the running
	// session can reach them (e.g. our own kanban tab, future plugin extensions,
	// the Browser Console during development).
	Zotero.ReadingStatus = ReadingStatus;

	_registerL10nSource(rootURI);
	_registerStylesheet(rootURI);
	_registerInfoRow();
	_registerColumn();
	_registerMenus();
}

function _registerL10nSource(rootURI) {
	// Zotero auto-registers locale/<lang>/*.ftl from the plugin XPI in theory,
	// but in practice that can fail silently (e.g. if an earlier install was
	// broken) and not retry on reinstall, leaving data-l10n-id attributes
	// unresolved. Register the FTL source explicitly so we don't depend on
	// auto-discovery.
	try {
		let { L10nFileSource, L10nRegistry } = ChromeUtils.importESModule(
			'resource://gre/modules/L10nRegistry.sys.mjs'
		);
		let registry = L10nRegistry.getInstance();
		if (registry.hasSource(L10N_SOURCE_NAME)) {
			registry.removeSources([L10N_SOURCE_NAME]);
		}
		let source = new L10nFileSource(
			L10N_SOURCE_NAME,
			'app',
			['en-US'],
			rootURI + 'locale/{locale}/'
		);
		registry.registerSources([source]);
		state.l10nSourceRegistered = true;
	}
	catch (e) {
		Zotero.logError(e);
	}
}

function _unregisterL10nSource() {
	if (!state.l10nSourceRegistered) return;
	try {
		let { L10nRegistry } = ChromeUtils.importESModule(
			'resource://gre/modules/L10nRegistry.sys.mjs'
		);
		L10nRegistry.getInstance().removeSources([L10N_SOURCE_NAME]);
	}
	catch (e) {
		Zotero.logError(e);
	}
	state.l10nSourceRegistered = false;
}

export async function onMainWindowLoad({ window }) {
	state.windows.add(window);
	state.openTabs.set(window, new Set());
	// Auto-registration of locale/<lang>/reading-status.ftl only puts strings
	// into the global L10n service. The main window's document still needs a
	// <link rel="localization"> entry for data-l10n-id attributes on our
	// injected elements (menu labels, info-row label, column header) to
	// resolve. insertFTLIfNeeded adds that link idempotently.
	window.MozXULElement.insertFTLIfNeeded(FTL_NAME);
}

export async function onMainWindowUnload({ window }) {
	_closeTabsInWindow(window);
	state.windows.delete(window);
}

function _closeTabsInWindow(window) {
	let ids = state.openTabs.get(window);
	if (!ids) return;
	for (let id of [...ids]) {
		try {
			window.Zotero_Tabs.close(id);
		}
		catch (e) {
			Zotero.logError(e);
		}
	}
	ids.clear();
}

function _removeFTLFromWindow(window) {
	try {
		let link = window.document.querySelector(
			`link[href="${FTL_NAME}"]`
		);
		if (link) link.remove();
	}
	catch (e) {
		Zotero.logError(e);
	}
}

export async function shutdown() {
	for (let id of state.menuIDs) {
		try {
			Zotero.MenuManager.unregisterMenu(id);
		}
		catch (e) {
			Zotero.logError(e);
		}
	}
	state.menuIDs = [];
	if (state.columnID) {
		try {
			Zotero.ItemTreeManager.unregisterColumn(state.columnID);
		}
		catch (e) {
			Zotero.logError(e);
		}
		state.columnID = null;
	}
	if (state.infoRowID) {
		try {
			Zotero.ItemPaneManager.unregisterInfoRow(state.infoRowID);
		}
		catch (e) {
			Zotero.logError(e);
		}
		state.infoRowID = null;
	}
	// Close every open Kanban tab we opened, and remove the FTL link.
	for (let window of state.windows) {
		_closeTabsInWindow(window);
		_removeFTLFromWindow(window);
	}
	state.windows.clear();
	_unregisterStylesheet();
	_unregisterL10nSource();
	delete Zotero.ReadingStatus;
}


function _registerInfoRow() {
	state.infoRowID = Zotero.ItemPaneManager.registerInfoRow({
		rowID: 'reading-status',
		pluginID: PLUGIN_ID,
		label: { l10nID: 'reading-status-row-label' },
		position: 'end',
		editable: true,
		onGetData: ({ item }) => {
			let v = ReadingStatus.get(item);
			return v ? ReadingStatus.getLocalizedLabel(v) : '';
		},
		onSetData: ({ item, value }) => {
			let parsed = ReadingStatus.parseInput(value);
			// Invalid input — leave the field untouched.
			if (parsed === null) return;
			ReadingStatus.set(item, parsed).catch(e => Zotero.logError(e));
		},
		onItemChange: ({ tabType, setEnabled }) => {
			setEnabled(tabType === 'library' || tabType === 'reader');
		},
	});
}


function _registerColumn() {
	state.columnID = Zotero.ItemTreeManager.registerColumn({
		dataKey: 'readingStatus',
		pluginID: PLUGIN_ID,
		label: 'reading-status-column-label',
		dataProvider: item => ReadingStatus.get(item),
		minWidth: 90,
		showInColumnPicker: true,
		columnPickerSubMenu: true,
		zoteroPersist: ['width', 'hidden', 'sortDirection'],
	});
}


function _registerMenus() {
	// Set Reading Status submenu on item right-click
	let setSubmenu = Zotero.MenuManager.registerMenu({
		menuID: 'reading-status-set',
		pluginID: PLUGIN_ID,
		target: 'main/library/item',
		menus: [{
			menuType: 'submenu',
			l10nID: 'reading-status-set-submenu',
			menus: [
				..._statusMenuItem('', 'reading-status-none'),
				..._statusMenuItem('Unread', 'reading-status-unread'),
				..._statusMenuItem('In Progress', 'reading-status-in-progress'),
				..._statusMenuItem('Done', 'reading-status-done'),
				..._statusMenuItem('Abandoned', 'reading-status-abandoned'),
			],
		}],
	});
	if (setSubmenu) state.menuIDs.push(setSubmenu);

	// View → Open Kanban Board
	let openKanban = Zotero.MenuManager.registerMenu({
		menuID: 'reading-status-open-kanban',
		pluginID: PLUGIN_ID,
		target: 'main/menubar/view',
		menus: [{
			menuType: 'menuitem',
			l10nID: 'reading-status-open-kanban',
			onCommand: (ev) => {
				let win = ev.target.ownerGlobal;
				let ids = state.openTabs.get(win);
				if (!ids) {
					ids = new Set();
					state.openTabs.set(win, ids);
				}
				openKanbanTab(win, {
					onOpen: id => ids.add(id),
					onClose: id => ids.delete(id),
				}).catch(e => Zotero.logError(e));
			},
		}],
	});
	if (openKanban) state.menuIDs.push(openKanban);
}

function _statusMenuItem(value, l10nID) {
	return [{
		menuType: 'menuitem',
		l10nID,
		onCommand: async (ev) => {
			let win = ev.target.ownerGlobal;
			let items = win.ZoteroPane?.getSelectedItems?.() ?? [];
			for (let item of items) {
				try {
					await ReadingStatus.set(item, value);
				}
				catch (e) {
					Zotero.logError(e);
				}
			}
		},
	}];
}


function _registerStylesheet(rootURI) {
	let uri = Services.io.newURI(rootURI + 'styles/kanban.css');
	let sss = Cc['@mozilla.org/content/style-sheet-service;1']
		.getService(Ci.nsIStyleSheetService);
	if (!sss.sheetRegistered(uri, sss.AUTHOR_SHEET)) {
		sss.loadAndRegisterSheet(uri, sss.AUTHOR_SHEET);
	}
	state.stylesheetURI = uri;
}

function _unregisterStylesheet() {
	if (!state.stylesheetURI) return;
	let sss = Cc['@mozilla.org/content/style-sheet-service;1']
		.getService(Ci.nsIStyleSheetService);
	if (sss.sheetRegistered(state.stylesheetURI, sss.AUTHOR_SHEET)) {
		sss.unregisterSheet(state.stylesheetURI, sss.AUTHOR_SHEET);
	}
	state.stylesheetURI = null;
}
