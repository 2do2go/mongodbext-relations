'use strict';

var utils = require('./utils');
var EmbeddedDocument = require('./embeddedDocument');

// this object is used to detect empty field in embedded docs wrapping
var empty = {};

var relationFieldRegExp = new RegExp(
	'^' +
	'[^\\.\\$]+(?:\\.\\$)?' +
	'(?:' +
		'\\.' +
		'[^\\.\\$]+(?:\\.\\$)?' +
	')*' +
	'$'
);

var splitRelationField = function(field) {
	if (!relationFieldRegExp.test(field)) {
		throw new Error('Field "' + field + '" has wrong format');
	}

	var fieldParts = field.split('.');

	return fieldParts.reduce(function(parts, part) {
		var lastPart = parts[parts.length - 1];

		if (!lastPart || lastPart === '$' || part === '$') {
			parts.push(part);
		} else {
			parts[parts.length - 1] += '.' + part;
		}

		return parts;
	}, []);
};

var wrapEmbeddedField = function(object, fieldParts, embedder) {
	var fieldKeyPart = fieldParts[0];
	var positionalPart = fieldParts[1];

	var value = utils.deepGet(object, fieldKeyPart, empty);

	if (value === empty) return;

	if (positionalPart === '$') {
		if (!Array.isArray(value)) {
			throw new Error('Field `' + fieldKeyPart + '` should be an array');
		}

		var isLastPart = fieldParts.length <= 2;

		value.forEach(function(item, index) {
			if (isLastPart) {
				value[index] = embedder(item);
			} else {
				if (!utils.isObject(value)) {
					throw new Error(
						'Array field `' + fieldKeyPart + '` should have objects as items'
					);
				}

				wrapEmbeddedField(item, fieldParts.slice(2), embedder);
			}
		});
	} else {
		utils.deepSet(object, fieldKeyPart, embedder(value));
	}
};

var getFindParamsHash = function(object) {
	var findParamsHash = {};

	var processObject = function(object) {
		Object.keys(object).forEach(function(key) {
			var value = object[key];

			if (!Array.isArray(value) && !utils.isSimpleObject(value)) return;

			if (value instanceof EmbeddedDocument) {
				var uniqGroupId = value.getUniqGroupId();

				var params = findParamsHash[uniqGroupId];

				if (!params) {
					params = findParamsHash[uniqGroupId] = {
						key: value.key,
						identifiers: [],
						collection: value.collection,
						projection: value.projection
					};
				}

				params.identifiers.push(value.identifier);
			} else {
				processObject(value);
			}
		});
	};

	processObject(object);

	return findParamsHash;
};

var getEmbeddedDocumentsHash = function(object, callback) {
	var findParamsHash = getFindParamsHash(object);

	var uniqGroupIds = Object.keys(findParamsHash);

	var funcs = uniqGroupIds.map(function(uniqGroupId) {
		return function(callback) {
			var params = findParamsHash[uniqGroupId];

			var projectionKeys = Object.keys(params.projection);
			if (projectionKeys.length === 1 && params.projection[params.key]) {
				var documents = params.identifiers.map(function(identifier) {
					return utils.createObject(params.key, identifier);
				});
				callback(null, documents);
			} else {
				var condition = utils.createObject(params.key, {$in: params.identifiers});
				params.collection.find(condition, params.projection).toArray(callback);
			}
		};
	});

	utils.asyncParallel(funcs, function(err, documentsGroups) {
		if (err) return callback(err);

		var documentsHash = {};
		uniqGroupIds.forEach(function(uniqGroupId, index) {
			var params = findParamsHash[uniqGroupId];
			var documents = documentsGroups[index];
			documentsHash[uniqGroupId] = utils.indexBy(documents, params.key);
		});

		callback(null, documentsHash);
	});
};

var replaceEmbeddedDocuments = function(object, documentsHash) {
	Object.keys(object).forEach(function(key) {
		var value = object[key];

		if (!Array.isArray(value) && !utils.isSimpleObject(value)) return;

		if (value instanceof EmbeddedDocument) {
			var uniqGroupId = value.getUniqGroupId();

			var embeddedDocument = documentsHash[uniqGroupId][value.identifier];

			if (!embeddedDocument) {
				throw new Error(
					'Document with ' + value.key + '=' + value.identifier +
					' is not found in `' + value.collection.collectionName + '` collection'
				);
			}

			object[key] = embeddedDocument;
		} else {
			replaceEmbeddedDocuments(value, documentsHash);
		}
	});
};

var processEmbeddedDocuments = function(object, relations, callback) {
	try {
		Object.keys(relations).forEach(function(field) {
			var options = relations[field];
			wrapEmbeddedField(object, splitRelationField(field), options.embedder);
		});

		getEmbeddedDocumentsHash(object, function(err, documentsHash) {
			if (err) return callback(err);

			try {
				replaceEmbeddedDocuments(object, documentsHash);
			} catch(err) {
				return callback(err);
			}

			callback();
		});
	} catch(err) {
		return callback(err);
	}
};

exports.setup = function(collection, relations) {
	collection.on('beforeInsertOne', function(params, callback) {
		processEmbeddedDocuments(params.obj, relations, callback);
	});

	collection.on('beforeInsertMany', function(params, callback) {
		utils.asyncParallel(params.objs.map(function(object) {
			return function(callback) {
				processEmbeddedDocuments(object, relations, callback);
			};
		}), callback);
	});

	var beforeUpdate = function(params, callback) {
		var object;
		if (params.modifier) {
			if (utils.isModifier(params.modifier)) {
				if (params.modifier.$set) {
					object = params.modifier.$set;
				}
			} else {
				object = params.modifier;
			}
		} else if (params.replacement) {
			object = params.replacement;
		}

		if (!object) return callback();

		processEmbeddedDocuments(object, relations, callback);
	};

	collection.on('beforeUpdateOne', beforeUpdate);
	collection.on('beforeUpdateMany', beforeUpdate);
	collection.on('beforeUpsertOne', beforeUpdate);
	collection.on('beforeReplaceOne', beforeUpdate);
};
