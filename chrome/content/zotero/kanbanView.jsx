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

const React = require('react');
const ReactDOM = require('react-dom');
const PropTypes = require('prop-types');

const COLUMNS = [
	{ key: '', l10nKey: 'kanban-column-unset' },
	{ key: 'Unread', l10nKey: 'reading-status-unread' },
	{ key: 'In Progress', l10nKey: 'reading-status-in-progress' },
	{ key: 'Done', l10nKey: 'reading-status-done' },
	{ key: 'Abandoned', l10nKey: 'reading-status-abandoned' },
];

const DRAG_MIME = 'application/x-zotero-kanban-item';

class KanbanBoard extends React.Component {
	static propTypes = {
		getItemsView: PropTypes.func,
	};

	constructor(props) {
		super(props);
		this.state = {
			items: [],
			dragOverColumn: null,
		};
		this._unsubscribe = null;
		this._notifierID = null;
		this._refreshTimer = null;
	}

	componentDidMount() {
		this._subscribeToItemsView();
		this._notifierID = Zotero.Notifier.registerObserver(
			{ notify: () => this._scheduleRefresh() },
			['item'],
			'kanbanView'
		);
		this.refresh();
	}

	componentWillUnmount() {
		this._unsubscribeFromItemsView();
		if (this._notifierID) {
			Zotero.Notifier.unregisterObserver(this._notifierID);
			this._notifierID = null;
		}
		if (this._refreshTimer) {
			clearTimeout(this._refreshTimer);
			this._refreshTimer = null;
		}
	}

	_subscribeToItemsView() {
		let view = this.props.getItemsView && this.props.getItemsView();
		if (!view) return;
		this._unsubscribeFromItemsView();
		let listener = () => this._scheduleRefresh();
		if (view.onRefresh && view.onRefresh.addListener) {
			view.onRefresh.addListener(listener);
		}
		this._unsubscribe = () => {
			if (view.onRefresh && view.onRefresh.removeListener) {
				view.onRefresh.removeListener(listener);
			}
		};
	}

	_unsubscribeFromItemsView() {
		if (this._unsubscribe) {
			try {
				this._unsubscribe();
			}
			catch {
				// ignore
			}
			this._unsubscribe = null;
		}
	}

	_scheduleRefresh() {
		if (this._refreshTimer) return;
		this._refreshTimer = setTimeout(() => {
			this._refreshTimer = null;
			this.refresh();
		}, 50);
	}

	refresh() {
		let view = this.props.getItemsView && this.props.getItemsView();
		if (!view || !view.rowCount) {
			this.setState({ items: [] });
			return;
		}

		let items = [];
		for (let i = 0; i < view.rowCount; i++) {
			let row;
			try {
				row = view.getRow(i);
			}
			catch {
				continue;
			}
			if (!row || !row.ref) continue;
			let item = row.ref;
			if (!(item instanceof Zotero.Item)) continue;
			// Skip child rows (notes/attachments under their parent) to keep the
			// board readable; only show items the user could see at top level.
			if (typeof view.getLevel === 'function' && view.getLevel(i) > 0) continue;
			items.push({ rowIndex: i, item });
		}
		this.setState({ items });
	}

	_bucket(items) {
		let buckets = new Map(COLUMNS.map(c => [c.key, []]));
		for (let entry of items) {
			let status = Zotero.ReadingStatus.get(entry.item) || '';
			if (!buckets.has(status)) status = '';
			buckets.get(status).push(entry);
		}
		return buckets;
	}

	_onCardClick(entry) {
		let view = this.props.getItemsView && this.props.getItemsView();
		if (!view || !view.selection) return;
		try {
			view.selection.select(entry.rowIndex);
		}
		catch {
			// ignore
		}
	}

	_onCardDragStart(entry, event) {
		event.dataTransfer.effectAllowed = 'move';
		event.dataTransfer.setData(DRAG_MIME, String(entry.item.id));
		event.currentTarget.classList.add('dragging');
	}

	_onCardDragEnd(event) {
		event.currentTarget.classList.remove('dragging');
	}

	_onColumnDragOver(columnKey, event) {
		if (!event.dataTransfer.types.includes(DRAG_MIME)) return;
		event.preventDefault();
		event.dataTransfer.dropEffect = 'move';
		if (this.state.dragOverColumn !== columnKey) {
			this.setState({ dragOverColumn: columnKey });
		}
	}

	_onColumnDragLeave(columnKey) {
		if (this.state.dragOverColumn === columnKey) {
			this.setState({ dragOverColumn: null });
		}
	}

	async _onColumnDrop(columnKey, event) {
		event.preventDefault();
		let itemID = parseInt(event.dataTransfer.getData(DRAG_MIME));
		this.setState({ dragOverColumn: null });
		if (!itemID) return;
		let item = await Zotero.Items.getAsync(itemID);
		if (!item) return;
		let next = columnKey || '';
		let current = Zotero.ReadingStatus.get(item);
		if (next === current) return;
		try {
			await Zotero.ReadingStatus.set(item, next);
		}
		catch (e) {
			Zotero.logError(e);
		}
	}

	_renderCard(entry) {
		let item = entry.item;
		let title = item.getDisplayTitle() || '';
		let creators = '';
		try {
			creators = item.getField('firstCreator') || '';
		}
		catch {
			// no-op
		}
		let year = '';
		try {
			let date = item.getField('date', true);
			if (date) year = date.substr(0, 4).replace(/^0+$/, '');
		}
		catch {
			// no-op
		}
		return (
			<div
				key={item.id}
				className="kanban-card"
				draggable
				onClick={() => this._onCardClick(entry)}
				onDragStart={e => this._onCardDragStart(entry, e)}
				onDragEnd={e => this._onCardDragEnd(e)}
			>
				<div className="kanban-card-title">{title}</div>
				{(creators || year) && (
					<div className="kanban-card-meta">
						{creators}{creators && year ? ' · ' : ''}{year}
					</div>
				)}
			</div>
		);
	}

	_renderColumn(col, entries) {
		let label = Zotero.getString(col.l10nKey);
		let isOver = this.state.dragOverColumn === col.key;
		return (
			<div
				key={col.key || '__unset__'}
				className={'kanban-column' + (isOver ? ' drag-over' : '')}
				onDragOver={e => this._onColumnDragOver(col.key, e)}
				onDragLeave={() => this._onColumnDragLeave(col.key)}
				onDrop={e => this._onColumnDrop(col.key, e)}
			>
				<div className="kanban-column-header">
					<span className="kanban-column-title">{label}</span>
					<span className="kanban-column-count">{entries.length}</span>
				</div>
				<div className="kanban-column-cards">
					{entries.map(entry => this._renderCard(entry))}
				</div>
			</div>
		);
	}

	render() {
		let buckets = this._bucket(this.state.items);
		return (
			<div className="kanban-board">
				{COLUMNS.map(col => this._renderColumn(col, buckets.get(col.key) || []))}
			</div>
		);
	}
}

const KanbanView = {
	async init(domEl, opts = {}) {
		let ref;
		await new Promise((resolve) => {
			ReactDOM.createRoot(domEl).render(
				<KanbanBoard
					ref={(c) => {
						ref = c;
						resolve();
					}}
					getItemsView={opts.getItemsView}
				/>
			);
		});
		return {
			refresh: () => ref && ref.refresh(),
			_ref: ref,
		};
	},
};

module.exports = KanbanView;
