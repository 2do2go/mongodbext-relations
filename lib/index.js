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

	return function(identifier) {
		if (identifier instanceof EmbeddedDocument) {
			return identifier;
		} else {
			return new EmbeddedDocument({
				identifier: identifier,
				key: options.key,
				collection: options.collection,
				projection: options.projection
			});
		}
	};
};

var prepareRelations = function(relations) {
	var preparedRelations = {};

	Object.keys(relations).forEach(function(field) {
		var relation = relations[field];

		// clone object
		relation = Object.create(relation);

		// set default values
		relation.key = relation.key || defaults.key;
		relation.projection = relation.projection || defaults.projection;

		relation.embedder = relation.embedder || createEmbedder(relation);

		relation.onDelete = relation.onDelete || defaults.onDelete;
		relation.onUpdate = relation.onUpdate || defaults.onUpdate;

		var fieldPath = field.replace('.$', '');
		relation.paths = {
			field: fieldPath,
			identifier: fieldPath + '.' + relation.key,
			modifier: field
		};

		preparedRelations[field] = relation;
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
