'use strict';

var utils = require('./utils');

var setupRelationHooks = function(relatedCollection, relation) {
	// before hooks are used to save original object identifiers
	// or to check restrictions
	var getModifiedIdentifiers = function(condition, callback) {
		var projection = utils.createObject(relation.key, true);

		relation.collection
			.find(condition, projection)
			.toArray(function(err, docs) {
				if (err) return callback(err);

				var identifiers = docs.map(function(doc) {
					return doc[relation.key];
				});

				callback(null, identifiers);
			});
	};

	var getEmbeddedDocuments = function(identifiers, callback) {
		var projectionKeys = Object.keys(relation.projection);
		if (projectionKeys.length === 1 && relation.projection[relation.key]) {
			var documents = identifiers.map(function(identifier) {
				return utils.createObject(relation.key, identifier);
			});
			callback(null, documents);
		} else {
			var condition = utils.createObject(relation.key, {$in: identifiers});
			relation.collection.find(condition, relation.projection).toArray(callback);
		}
	};

	var getEmbeddedDocumentsHash = function(identifiers, callback) {
		getEmbeddedDocuments(identifiers, function(err, documents) {
			if (err) return callback(err);

			var documentsHash = utils.indexBy(documents, relation.key);

			callback(null, documentsHash);
		});
	};

	var beforeUpdate = function(params, callback) {
		if (relation.onUpdate === 'cascade') {
			getModifiedIdentifiers(params.condition, function(err, identifiers) {
				if (err) return callback(err);

				params.meta.modifiedIdentifiers = identifiers;

				if (!identifiers.length) return callback();

				// fetch current embedded documents to skip unnecessary updates later
				getEmbeddedDocumentsHash(identifiers, function(err, documentsHash) {
					if (err) return callback(err);

					params.meta.originalEmbeddedDocumentsHash = documentsHash;

					callback();
				});
			});
		} else {
			callback();
		}
	};

	relation.collection.on('beforeUpdateOne', beforeUpdate);
	relation.collection.on('beforeUpdateMany', beforeUpdate);

	var afterUpdate = function(params, callback) {
		var identifiers = params.meta.modifiedIdentifiers || [];
		var originalDocumentsHash = params.meta.originalEmbeddedDocumentsHash || {};

		if (!identifiers.length) return callback();

		if (relation.onUpdate === 'cascade') {
			getEmbeddedDocumentsHash(identifiers, function(err, newDocumentsHash) {
				if (err) return callback(err);

				// in cascade mode we need to update each updated identifier
				var funcs = identifiers.map(function(identifier) {
					return function(callback) {
						var originalDocument = originalDocumentsHash[identifier];
						var newDocument = newDocumentsHash[identifier];
						if (
							originalDocument && newDocument &&
							utils.isDeepStrictEqual(originalDocument, newDocument)
						) {
							return callback();
						}

						var condition = utils.createObject(
							relation.paths.identifier,
							identifier
						);

						var modifier = {
							$set: utils.createObject(
								relation.paths.modifier,
								relation.embedder(identifier)
							)
						};

						relatedCollection.updateMany(condition, modifier, callback);
					};
				});

				utils.asyncParallel(funcs, callback);
			});
		} else {
			callback();
		}
	};

	relation.collection.on('afterUpdateOne', afterUpdate);
	relation.collection.on('afterUpdateMany', afterUpdate);

	var checkDeleteRestictions = function(identifiers, callback) {
		var condition = utils.createObject(
			relation.paths.identifier,
			{$in: identifiers}
		);

		relatedCollection.findOne(condition, {_id: 1}, function(err, doc) {
			if (err) return callback(err);

			if (doc) {
				return callback(
					new Error(
						'Could not delete document from collection ' +
						'`' + relation.collection.collectionName + '` ' +
						'because it is embedded to related collection ' +
						'`' + relatedCollection.collectionName + '` ' +
						'in the field `' + relation.paths.field + '` of document ' +
						'with ' + relation.key + '=' + doc._id
					)
				);
			}

			callback();
		});
	};

	var beforeDelete = function(params, callback) {
		if (
			relation.onDelete === 'restrict' || relation.onDelete === 'cascade' ||
			relation.onDelete === 'unset' || relation.onDelete === 'pull'
		) {
			getModifiedIdentifiers(params.condition, function(err, identifiers) {
				if (err) return callback(err);

				params.meta.modifiedIdentifiers = identifiers;

				if (relation.onDelete === 'restrict') {
					checkDeleteRestictions(identifiers, callback);
				} else {
					callback();
				}
			});

		} else {
			callback();
		}
	};

	relation.collection.on('beforeDeleteOne', beforeDelete);
	relation.collection.on('beforeDeleteMany', beforeDelete);

	var afterDelete = function(params, callback) {
		var identifiers = params.meta.modifiedIdentifiers || [];

		if (!identifiers.length) return callback();

		var condition = utils.createObject(
			relation.paths.identifier,
			{$in: identifiers}
		);

		if (relation.onDelete === 'cascade') {
			relatedCollection.deleteMany(condition, callback);
		} else if (
			relation.onDelete === 'unset' || relation.onDelete === 'pull'
		) {
			var modifier = {};

			if (relation.onDelete === 'unset') {
				modifier.$unset = utils.createObject(
					relation.paths.field,
					true
				);
			} else if (relation.onDelete === 'pull') {
				modifier.$pull = utils.createObject(
					relation.paths.field,
					utils.createObject(relation.key, {$in: identifiers})
				);
			}

			relatedCollection.updateMany(condition, modifier, callback);
		} else {
			callback();
		}
	};

	relation.collection.on('afterDeleteOne', afterDelete);
	relation.collection.on('afterDeleteMany', afterDelete);
};

exports.setup = function(collection, relations) {
	Object.keys(relations).forEach(function(field) {
		setupRelationHooks(collection, relations[field]);
	});
};
