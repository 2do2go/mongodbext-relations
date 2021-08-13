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
		var document = this.identifier;
		this.identifier = this.identifier[this.key];

		if (options.trustEmbeddedValue) {
			var embeddedValue = utils.applyProjection(document, this.projection);
			this.setEmbeddedValue(embeddedValue);
		}
	}
};

EmbeddedDocument.prototype.getUniqGroupId = function() {
	return utils.getUniqGroupId(this);
};

EmbeddedDocument.prototype.getString = function() {
	return String(this.identifier);
};

EmbeddedDocument.prototype.valueOf = function() {
	return this.identifier;
};

EmbeddedDocument.prototype.toJSON = function() {
	return this.identifier;
};

EmbeddedDocument.prototype.setEmbeddedValue = function(embeddedValue) {
	if (embeddedValue && embeddedValue[this.key] === this.identifier) {
		this.embeddedValue = embeddedValue;
	} else {
		throw new Error('Invalid embedded value');
	}
};

module.exports = EmbeddedDocument;
