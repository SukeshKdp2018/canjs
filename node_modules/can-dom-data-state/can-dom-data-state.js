'use strict';
var namespace = require('can-namespace');
var CID = require("can-cid");

var data = {};

var isEmptyObject = function(obj){
	/* jshint -W098 */
	for(var prop in obj) {
		return false;
	}
	return true;
};

// set data for an element
// returns true if this is the first data for this element
// so that caller can track number of elements with data set
var setData = function(name, value) {
	var id = CID(this),
		store = data[id],
		newStore = false;

	if (!data[id]) {
		newStore = true;
		store = data[id] = {};
	}

	if (name !== undefined) {
		store[name] = value;
	}
	return newStore;
};

// delete this node's `data`
// returns true if the node was deleted.
var deleteNode = function() {
	var id = CID.get(this);
	var nodeDeleted = false;
	if(id && data[id]) {
		nodeDeleted = true;
		delete data[id];
	}
	return nodeDeleted;
};

/*
 * Core of domData that does not depend on mutationDocument
 * This is separated in order to prevent circular dependencies
 */
var domDataState = {
	_data: data,

	getCid: function() {
		// TODO log warning! to use can-cid directly
		return CID.get(this);
	},

	cid: function(){
		// TODO log warning!
		return CID(this);
	},

	expando: CID.domExpando,

	get: function(key) {
		var id = CID.get(this),
			store = id && data[id];
		return key === undefined ? store || setData(this) : store && store[key];
	},

	set: setData,

	clean: function(prop) {
		var id = CID.get(this);
		var itemData = data[id];
		if (itemData && itemData[prop]) {
			delete itemData[prop];
		}
		if(isEmptyObject(itemData)) {
			deleteNode.call(this);
		}
	},

	delete: deleteNode
};

if (namespace.domDataState) {
	throw new Error("You can't have two versions of can-dom-data-state, check your dependencies");
} else {
	module.exports = namespace.domDataState = domDataState;
}
