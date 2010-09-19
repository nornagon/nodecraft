var sys = require('sys');
var pack = require('./jspack').jspack;

function concat(buf1, buf2) {
	var buf = new Buffer(buf1.length + buf2.length);
	buf1.copy(buf, 0, 0);
	buf2.copy(buf, buf1.length, 0);
	return buf;
}

Packet = function (data) {
	this.type = data[0];
	this.data = data;
	this.cursor = 1;
}

Packet.prototype.needs = function (nBytes) {
	if (this.data.length - this.cursor < nBytes)
		throw Error("oob");
}

var unpackString = function (pkt) {
	pkt.needs(2);
	var len = (pkt.data[pkt.cursor] << 8) + pkt.data[pkt.cursor+1];
	pkt.cursor += 2;
	pkt.needs(len);
	var str = pkt.data.slice(pkt.cursor, pkt.cursor + len).toString('utf8');
	pkt.cursor += len;
	return str;
}
var packString = function (str) {
	if (!(str instanceof Buffer))
		str = new Buffer(str);
	return concat(makers['short'](str.length), str);
}
var packIntString = function (str) {
	if (!(str instanceof Buffer))
		str = new Buffer(str);
	return concat(makers['int'](str.length), str);
}

var unpackBool = function (pkt) {
	pkt.needs(1);
	var ret = pkt.data[pkt.cursor] != 0;
	pkt.cursor += 1;
	return ret;
}

var packBool = function (bool) {
	return new Buffer([bool ? 1 : 0]);
}


var packItems = function (items) {
	var buf = new Buffer(0);
	for (var i = 0; i < items.length; i++) {
		buf = concat(buf, makers['short'](items[i].id));
		if (items[i].id != -1) {
			buf = concat(buf, makers['byte'](items[i].count));
			buf = concat(buf, makers['short'](items[i].health));
		}
	}
	return buf;
}

function int(name) { return ['int', name]; }
function byte(name) { return ['byte', name]; }
function str(name) { return ['str', name]; }
function bool(name) { return ['bool', name]; }
function double(name) { return ['double', name]; }
function float(name) { return ['float', name]; }
function short(name) { return ['short', name]; }
function items(name) { return ['items', name]; }
function intstr(name) { return ['intstr', name]; }

var clientPacketStructure = {
	0x00: [],
	0x01: [int('protoVer'), str('username'), str('password')],
	0x02: [str('username')],
	0x0a: [bool('isFlying')],
	0x0b: [double('x'), double('y'), double('stance'), double('z'),
	       bool('flying')],
	0x0c: [float('rotation'), float('pitch'), bool('flying')],
	0x0d: [double('x'), double('y'), double('stance'), double('z'),
	       float('rotation'), float('pitch'), bool('flying')],
}

var serverPacketStructure = {
	0x01: [int('playerID'), str('serverName'), str('motd')],
	0x02: [str('serverID')],
	0x03: [str('message')],
	0x05: [int('invType'), short('count'), items('items')],
	0x06: [int('x'), int('y'), int('z')],
	0x0d: [double('x'), double('y'), double('stance'), double('z'),
	       float('rotation'), float('pitch'), bool('flying')],
	0x32: [int('x'), int('z'), bool('mode')], // prechunk
	0x33: [int('x'), short('y'), int('z'), byte('sizeX'), byte('sizeY'),
	       byte('sizeZ'), intstr('chunk')], // map chunk, gzipped
	0xff: [str('message')], // disconnect
}

function unpack_fmt(fmt) {
	return function (pkt) {
		var len = pack.CalcLength(fmt);
		pkt.needs(len);
		var value = pack.Unpack(fmt, pkt.data, pkt.cursor);
		pkt.cursor += len;
		return value;
	};
}

function pack_fmt(fmt) {
	return function () {
		return new Buffer(pack.Pack(fmt, arguments));
	}
}

var parsers = {
	int: unpack_fmt('i'),
	short: unpack_fmt('h'),
	str: unpackString,
	bool: unpackBool,
	float: unpack_fmt('f'),
	double: unpack_fmt('d'),
}

var makers = {
	int: pack_fmt('i'),
	byte: pack_fmt('b'),
	short: pack_fmt('h'),
	str: packString,
	bool: packBool,
	float: pack_fmt('f'),
	double: pack_fmt('d'),
	items: packItems,
	intstr: packIntString,
}

exports.parsePacket = function (buf) {
	var pkt = new Packet(buf);
	var struct = clientPacketStructure[pkt.type];
	if (!struct)
		throw Error("unknown client packet type 0x" + pkt.type.toString(16));
	var pktData = {type: pkt.type};
	for (var field in struct) {
		var type = struct[field][0];
		var name = struct[field][1];
		pktData[name] = parsers[type](pkt);
	}
	pktData.length = pkt.cursor;
	return pktData;
}

exports.makePacket = function (pktData) {
	var struct = serverPacketStructure[pktData.type];
	if (!struct)
		throw Error("unknown server packet type 0x" + pkt.type.toString(16));
	var buf = new Buffer([pktData.type]);
	for (var field in struct) {
		var type = struct[field][0];
		var name = struct[field][1];
		sys.debug(type + "(" + name + ") = " + sys.inspect(pktData[name]) + " -> " + sys.inspect(makers[type](pktData[name])));
		buf = concat(buf, makers[type](pktData[name]));
	}
	return buf;
}
