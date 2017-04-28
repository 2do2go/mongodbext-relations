'use strict';

var utils = require('./utils');
var defaults = require('./defaults');

var EmbeddedDocument = function(options) {
	options = options || {};

	if (typeof options.identifier === 'undefined') {
		throw new Error('`identifier` option is required');
	}

	if (!options.collection) {
		throw new Error('`collection` option is required');
	}

	this.collection = options.collection;
	this.key = options.key || defaults.key;
	this.projection = options.projection || defaults.projection;
	this.identifier = options.identifier;

	if (
		utils.isSimpleObject(this.identifier) &&
		typeof this.identifier[this.key] !== 'undefined'
	) {
		this.identifier = this.identifier[this.key];
	}
};

EmbeddedDocument.prototype.getUniqGroupId = function() {
	return [
		this.collection.collectionName,
		this.key,
		utils.stringifyProjection(this.projection)
	].join('.');
};

module.exports = EmbeddedDocument;
