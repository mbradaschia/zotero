/*
    ***** BEGIN LICENSE BLOCK *****

    Copyright © 2026 Corporation for Digital Scholarship
                     Vienna, Virginia, USA
                     https://www.zotero.org

    This file is part of Zotero.

    Zotero is free software: you can redistribute it and/or modify
    it under the terms of the GNU Affero General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    Zotero is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public License
    along with Zotero.  If not, see <http://www.gnu.org/licenses/>.

    ***** END LICENSE BLOCK *****
*/

// Stores a per-item reading-progress label as a structured key in the existing
// `extra` field. Same pattern used for `citation-key`: no schema migration,
// syncs natively, survives BBT and other extra-field consumers.
Zotero.ReadingStatus = {
	VALUES: ['Unread', 'In Progress', 'Done', 'Abandoned'],
	EXTRA_KEY: 'Reading-Status',

	get: function (item) {
		if (!item) return '';
		let extra = item.getField('extra') || '';
		let m = extra.match(/^Reading-Status:[ \t]*(.+)$/m);
		if (!m) return '';
		let value = m[1].trim();
		return this.VALUES.includes(value) ? value : '';
	},

	setNoSave: function (item, value) {
		let extra = item.getField('extra') || '';
		let stripped = extra.replace(/^Reading-Status:[ \t]*.*(?:\r?\n|$)/m, '');
		stripped = stripped.replace(/\s+$/, '');
		let next;
		if (value && this.VALUES.includes(value)) {
			next = stripped
				? stripped + '\n' + this.EXTRA_KEY + ': ' + value
				: this.EXTRA_KEY + ': ' + value;
		}
		else {
			next = stripped;
		}
		item.setField('extra', next);
	},

	set: async function (item, value) {
		this.setNoSave(item, value);
		await item.saveTx();
	},

	// Localized labels keyed by canonical English value
	getLocalizedLabel: function (value) {
		switch (value) {
			case 'Unread': return Zotero.getString('reading-status-unread');
			case 'In Progress': return Zotero.getString('reading-status-in-progress');
			case 'Done': return Zotero.getString('reading-status-done');
			case 'Abandoned': return Zotero.getString('reading-status-abandoned');
			default: return '';
		}
	},

	// Accept either canonical English or localized label, return canonical or ''
	parseInput: function (text) {
		let trimmed = (text || '').trim();
		if (!trimmed) return '';
		for (let v of this.VALUES) {
			if (trimmed.toLowerCase() === v.toLowerCase()) return v;
			if (trimmed.toLowerCase() === this.getLocalizedLabel(v).toLowerCase()) return v;
		}
		return null; // signals invalid
	},

	init: function () {
		if (this._registered) return;
		try {
			Zotero.ItemPaneManager.registerInfoRow({
				rowID: 'reading-status',
				label: { l10nID: 'items-column-reading-status' },
				position: 'end',
				editable: true,
				onGetData: ({ item }) => {
					let v = this.get(item);
					return v ? this.getLocalizedLabel(v) : '';
				},
				onSetData: ({ item, value }) => {
					let parsed = this.parseInput(value);
					if (parsed === null) {
						// Invalid input — don't change anything
						return;
					}
					this.set(item, parsed);
				},
				onItemChange: ({ tabType, setEnabled }) => {
					setEnabled(tabType === 'library' || tabType === 'reader');
				},
			});
			this._registered = true;
		}
		catch (e) {
			Zotero.logError(e);
		}
	},
};
