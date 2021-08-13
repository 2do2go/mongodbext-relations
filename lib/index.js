'use strict';

var defaults = require('./defaults');
var EmbeddedDocument = require('./embeddedDocument');
var embedderHooks = require('./embedderHooks');
var relationHooks = require('./relationHooks');

var createEmbedder = function(options) {
	options = options || {};

	if (!options.collection) {
		throw new Error('`collection` option is required');
	}

	return function(identifier, embedderOptions) {
		if (identifier instanceof EmbeddedDocument) {
			return identifier;
		} else {
			return new EmbeddedDocument({
				identifier: identifier,
				key: options.key,
				collection: options.collection,
				projection: options.projection,
				trustEmbeddedValue: embedderOptions && embedderOptions.trustEmbeddedValue
			});
		}
	};
};

var prepareRelations = function(relations) {
	var preparedRelations = {};

	Object.keys(relations).forEach(function(field) {
		var relation = relations[field];

		var preparedRelation = {
			collection: relation.collection
		};

		// set default values
		if (relation.embedder) {
			// create fake embedded document and get options from it
			var fakeEmbeddedDocument = relation.embedder(1);

			preparedRelation.key = fakeEmbeddedDocument.key;
			preparedRelation.projection = fakeEmbeddedDocument.projection;

			preparedRelation.embedder = relation.embedder;
		} else {
			preparedRelation.key = relation.key || defaults.key;
			preparedRelation.projection = relation.projection || defaults.projection;

			preparedRelation.embedder = createEmbedder(preparedRelation);
		}

		preparedRelation.onDelete = relation.onDelete || defaults.onDelete;
		preparedRelation.onUpdate = relation.onUpdate || defaults.onUpdate;

		var fieldPath = field.replace('.$', '');
		preparedRelation.paths = {
			field: fieldPath,
			identifier: fieldPath + '.' + preparedRelation.key,
			modifier: field
		};

		preparedRelations[field] = preparedRelation;
	});

	return preparedRelations;
};

var exports = module.exports = function(collection, options) {
	options = options || {};

	if (!options.relations) {
		throw new Error('`relations` option is required');
	}

	// prepare relations options
	var relations = prepareRelations(options.relations);

	// setup hooks
	embedderHooks.setup(collection, relations);
	relationHooks.setup(collection, relations);
};

exports.EmbeddedDocument = EmbeddedDocument;
exports.createEmbedder = createEmbedder;
