'use strict';

module.exports = {
	key: '_id',
	projection: {_id: true},
	onDelete: 'restrict',
	onUpdate: 'cascade'
};
