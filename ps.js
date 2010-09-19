var sys = require('sys');
var pack = require('./jspack').jspack;

Packet = function (data) {
	if (data == null || typeof data == 'number') {
		var d = data;
		data = new Buffer(1);
		if (typeof d == 'number') {
			data[0] = d;
		}
	}
	this.type = data[0];
	this.data = data;
	this.cursor = 1;
}

Packet.prototype.needs = function (nBytes) {
	if (this.data.length - this.cursor < nBytes)
		throw Error("oob");
}

Packet.prototype.readString = function () {
	var len = (this.data[this.cursor] << 8) + this.data[this.cursor+1];
	this.cursor += 2;
	if (this.cursor >= this.data.length) throw Error("oob");
	var str = this.data.slice(this.cursor, this.cursor + len).toString('utf8');
	this.cursor += len;
	return str;
}

Packet.prototype.readInt = function () {
	this.needs(4);
	var data = this.data.slice(this.cursor, this.cursor + 4);
	var x = (data[0] << 24) +
	        (data[1] << 16) +
	        (data[2] << 8) +
	        data[3];
	this.cursor += 4;
	return x;
}

Packet.prototype.readBool = function () {
	this.needs(1);
	var x = this.data.slice(this.cursor, this.cursor+1)[0] != 0x00;
	this.cursor += 1;
	return x;
}

Packet.prototype.readFloat = function () {
	this.needs(4);
	var x = pack.Unpack('f', this.data, this.cursor);
	this.cursor += 4;
	return x; // TODO
}

Packet.prototype.readDouble = function () {
	this.needs(8);
	var x = pack.Unpack('d', this.data, this.cursor);
	this.cursor += 8;
	return x; // TODO
}

Packet.prototype.putBytes = function (bytes) {
	if (this.cursor + bytes.length > this.data.length) {
		var newData = new Buffer(this.cursor + bytes.length);
		this.data.copy(newData, 0, 0);
		this.data = newData;
	}
	new Buffer(bytes).copy(this.data, this.cursor, 0);
	this.cursor += bytes.length;
}

var putByte = function (byte) {
	return new Buffer([byte]);
}

var putShort = function (shrt) {
	return new Buffer([(shrt & 0xff00) >> 8, shrt & 0xff]);
}

Packet.prototype.putShort = function (shrt) {
	this.putBytes([(shrt & 0xff00) >> 8, shrt & 0xff]);
}

var putInt = function (int) {
	return new Buffer([(int & 0xff000000) >> 24,
	                   (int &   0xff0000) >> 16,
	                   (int &     0xff00) >> 8,
	                   (int &       0xff)]);
}

Packet.prototype.putInt = function (int) {
	this.putBytes([(int & 0xff000000) >> 24,
	               (int &   0xff0000) >> 16,
	               (int &     0xff00) >> 8,
	               (int &       0xff)]);
}

var putString = function (str) {
	if (!(str instanceof Buffer))
		str = new Buffer(str);
	return concat(putShort(str.length), str);
}
var putIntString = function (str) {
	if (!(str instanceof Buffer))
		str = new Buffer(str);
	return concat(putInt(str.length), str);
}

Packet.prototype.putString = function (str) {
	this.putShort(str.length);
	this.putBytes(str);
}

var putFloat = function (flt) {
	return new Buffer(pack.Pack('f', [flt]));
}

var putDouble = function (dbl) {
	return new Buffer(pack.Pack('d', [dbl]));
}

var putBool = function (bool) {
	return new Buffer([bool ? 1 : 0]);
}

var putItems = function (items) {
	var buf = new Buffer(0);
	for (var i = 0; i < items.length; i++) {
		sys.p(items[i])
		buf = concat(buf, putShort(items[i].id));
		if (items[i].id != -1) {
			buf = concat(buf, putByte(items[i].count));
			buf = concat(buf, putShort(items[i].health));
		}
	}
	return buf;
}

function concat(buf1, buf2) {
	var buf = new Buffer(buf1.length + buf2.length);
	buf1.copy(buf, 0, 0);
	buf2.copy(buf, buf1.length, 0);
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
	0x0b: [double('x'), double('y'), double('stance'), double('z'), bool('flying')],
	0x0c: [float('rotation'), float('pitch'), bool('flying')],
	0x0d: [double('x'), double('y'), double('stance'), double('z'), float('rotation'), float('pitch'), bool('flying')],
}

var serverPacketStructure = {
	0x01: [int('playerID'), str('serverName'), str('motd')],
	0x02: [str('serverID')],
	0x03: [str('message')],
	0x05: [int('invType'), short('count'), items('items')],
	0x06: [int('x'), int('y'), int('z')],
	0x0d: [double('x'), double('y'), double('stance'), double('z'), float('rotation'), float('pitch'), bool('flying')],
	0x32: [int('x'), int('z'), bool('mode')], // prechunk
	0x33: [int('x'), short('y'), int('z'), byte('sizeX'), byte('sizeY'), byte('sizeZ'), intstr('chunk')], // map chunk, gzipped
	0xff: [str('message')], // disconnect
}

var parsers = {
	int: Packet.prototype.readInt,
	short: Packet.prototype.readShort,
	str: Packet.prototype.readString,
	bool: Packet.prototype.readBool,
	float: Packet.prototype.readFloat,
	double: Packet.prototype.readDouble,
}

var makers = {
	int: putInt,
	byte: putByte,
	short: putShort,
	str: putString,
	bool: putBool,
	float: putFloat,
	double: putDouble,
	items: putItems,
	intstr: putIntString,
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
		pktData[name] = parsers[type].apply(pkt);
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
