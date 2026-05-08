"use strict";

describe("Zotero.ReadingStatus", function () {
	describe("#get()", function () {
		it("should return '' for an item with no extra field", async function () {
			let item = await createDataObject('item');
			assert.strictEqual(Zotero.ReadingStatus.get(item), '');
		});

		it("should return '' for an item with unrelated extra content", async function () {
			let item = await createDataObject('item', { extra: 'DOI: 10.1000/x\nPMID: 123' });
			assert.strictEqual(Zotero.ReadingStatus.get(item), '');
		});

		it("should return canonical value when set", async function () {
			let item = await createDataObject('item', { extra: 'Reading-Status: In Progress' });
			assert.strictEqual(Zotero.ReadingStatus.get(item), 'In Progress');
		});

		it("should return '' for unknown values", async function () {
			let item = await createDataObject('item', { extra: 'Reading-Status: Bogus' });
			assert.strictEqual(Zotero.ReadingStatus.get(item), '');
		});
	});

	describe("#set()", function () {
		it("should round-trip each canonical value", async function () {
			let item = await createDataObject('item');
			for (let value of Zotero.ReadingStatus.VALUES) {
				await Zotero.ReadingStatus.set(item, value);
				assert.strictEqual(Zotero.ReadingStatus.get(item), value);
			}
		});

		it("should clear the status when set to ''", async function () {
			let item = await createDataObject('item');
			await Zotero.ReadingStatus.set(item, 'Done');
			assert.strictEqual(Zotero.ReadingStatus.get(item), 'Done');
			await Zotero.ReadingStatus.set(item, '');
			assert.strictEqual(Zotero.ReadingStatus.get(item), '');
		});

		it("should preserve other extra-field content", async function () {
			let item = await createDataObject('item', {
				extra: 'DOI: 10.1000/x\nCitation Key: smith2020'
			});
			await Zotero.ReadingStatus.set(item, 'Unread');
			let extra = item.getField('extra');
			assert.include(extra, 'DOI: 10.1000/x');
			assert.include(extra, 'Citation Key: smith2020');
			assert.include(extra, 'Reading-Status: Unread');
		});

		it("should overwrite an existing Reading-Status without duplication", async function () {
			let item = await createDataObject('item', {
				extra: 'Reading-Status: Unread\nDOI: 10.1000/y'
			});
			await Zotero.ReadingStatus.set(item, 'Done');
			let extra = item.getField('extra');
			assert.equal((extra.match(/Reading-Status:/g) || []).length, 1);
			assert.include(extra, 'Reading-Status: Done');
			assert.include(extra, 'DOI: 10.1000/y');
		});

		it("should leave extractExtraFields parsing other keys intact", async function () {
			let item = await createDataObject('item', {
				extra: 'Citation Key: smith2020\nDOI: 10.1000/z'
			});
			await Zotero.ReadingStatus.set(item, 'In Progress');
			let { fields } = Zotero.Utilities.Internal.extractExtraFields(
				item.getField('extra')
			);
			assert.equal(fields.get('citationKey'), 'smith2020');
		});
	});
});
