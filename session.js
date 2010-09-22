var EventEmitter = require('events').EventEmitter;
var sys = require('sys');


Session = function() {
	this.outgoingQueue = [];
}

Session.prototype = new EventEmitter();

/* pump the outgoing message queue */
Session.prototype.pump = function()
{
	if (!this.outgoingQueue.length)
		return;

	var item = this.outgoingQueue.shift();

	var me = this;
	item(function() { me.pump(); });
}

Session.prototype.addOutgoing = function (tocall)
{
	this.outgoingQueue.push(tocall);
}

exports.Session = Session;

