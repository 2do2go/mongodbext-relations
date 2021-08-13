'use strict';

var util = require('util');
var defaults = require('./defaults');

var isObject = exports.isObject = function(obj) {
	var type = typeof obj;
	return type === 'function' || type === 'object' && !!obj;
};

exports.isSimpleObject = function(obj) {
	return (
		isObject(obj) &&
		!Array.isArray(obj) &&
		obj instanceof Date === false &&
		obj instanceof RegExp === false &&
		obj instanceof String === false &&
		obj instanceof Number === false &&
		obj instanceof Boolean === false
	);
};

var has = exports.has = function(obj, key) {
	return !!obj && Object.prototype.hasOwnProperty.call(obj, key);
};

var deepGet = exports.deepGet = function(object, field, fallback) {
	var fieldParts = field.split('.');

	return fieldParts.reduce(function(object, key) {
		return has(object, key) ? object[key] : fallback;
	}, object);
};

var deepSet = exports.deepSet = function(object, field, value) {
	var fieldParts = field.split('.');

	var subObject = fieldParts.slice(0, -1).reduce(function(object, key) {
		var subObject = object[key];

		if (!isObject(subObject)) {
			subObject = object[key] = {};
		}

		return subObject;
	}, object);

	subObject[fieldParts.pop()] = value;

	return object;
};

exports.isDeepStrictEqual = function(val1, val2) {
	return util.isDeepStrictEqual
		? util.isDeepStrictEqual(val1, val2)
		: JSON.stringify(val1) === JSON.stringify(val2);
};

exports.isModifier = function(modifier) {
	var keys = Object.keys(modifier);
	return keys.length && (/^\$/).test(keys[0]);
};

exports.indexBy = function(items, key) {
	var hash = {};
	items.forEach(function(item) {
		hash[item[key]] = item;
	});
	return hash;
};

exports.createObject = function(keys, values) {
	if (!Array.isArray(keys)) keys = [keys];
	if (!Array.isArray(values)) values = [values];
	var obj = {};
	for (var index = 0; index < Math.min(keys.length, values.length); ++index) {
		obj[keys[index]] = values[index];
	}
	return obj;
}

exports.asyncParallel = function(funcs, callback, context) {
	var totalCount = funcs.length;

	if (!totalCount) {
		return callback(null, []);
	}

	var completedCount = 0;
	var failed = false;
	var results = new Array(totalCount + 1);

	funcs.forEach(function(func, index) {
		func.call(context, function(err, result) {
			if (failed) return;

			if (err) {
				failed = true;
				callback(err);
			}

			results[index] = result;

			if (++completedCount === totalCount) {
				callback(null, results);
			}
		});
	});
};

exports.applyProjection = function(document, projection) {
	const result = {};
	Object.keys(projection).forEach(function(key) {
		if (key.indexOf('$') !== -1 || !projection[key]) {
			throw new Error('Cannot apply projection ' + key + ':' + projection[key]);
		}

		deepSet(result, key, deepGet(document, key));
	});

	return result;
};

var stringifyProjection = exports.stringifyProjection = function(projection) {
	var parts = [];

	Object.keys(projection).sort().forEach(function(key) {
		var value = projection[key];

		if (isObject(value)) {
			value = JSON.stringify(value);
		} else if (value === 0 || value === false || value === null || value === undefined) {
			value = '0';
		} else {
			value = '1';
		}

		parts.push(key + ':' + value);
	});

	return '{' + parts.join(',') + '}';
};

exports.getUniqGroupId = function(relation) {
	return [
		relation.collection.collectionName,
		relation.key || defaults.key,
		stringifyProjection(relation.projection || defaults.projection)
	].join('.');
};
