var sys = require('sys');
var pack = require('jspack').jspack;

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

var packString = function (str) {
	if (!(str instanceof Buffer))
		str = new Buffer(str);
	return concat(makers['short'](str.length), str);
}
var unpackString = function (pkt) {
	var len = parsers.short(pkt);
	pkt.needs(len);
	var str = pkt.data.slice(pkt.cursor, pkt.cursor + len).toString('utf8');
	pkt.cursor += len;
	return str;
}
var packIntString = function (str) {
	if (!(str instanceof Buffer))
		str = new Buffer(str);
	return concat(makers['int'](str.length), str);
}
var unpackIntString = function (pkt) {
	var len = parsers.int(pkt);
	pkt.needs(len);
	var str = pkt.data.slice(pkt.cursor, pkt.cursor + len);
	pkt.cursor += len;
	return str;
}

var packBlockArr = function (blks) {
	var buf = makers.short(blks.length);
	var coordArr = new Buffer(0);
	var typeArr = new Buffer(0);
	var metadataArr = new Buffer(0);
	blks.forEach(function (b) {
		var coord = ((b.x & 0xf) << 12) | ((b.z & 0xf) << 8) | (b.y & 0xff);
		coordArr = concat(coordArr, makers.short(coord));
		typeArr = concat(typeArr, makers.byte(b.type));
		metadataArr = concat(metadataArr, makers.byte(b.metadata));
	});

	return concat(buf, concat(coordArr, concat(typeArr, concat(metadataArr))));
}
var unpackBlockArr = function (pkt) {
	var len = parsers.short(pkt);
	var blks = [];
	for (var i = 0; i < len; i++) {
		var coord = parsers.short(pkt);
		var x = (coord & 0xf000) >> 12;
		var z = (coord & 0xf00) >> 8;
		var y = (coord & 0xff);
		blks.push({x: x, z: z, y: y});
	}
	for (var i = 0; i < len; i++) {
		blks[i].type = parsers.byte(pkt);
	}
	for (var i = 0; i < len; i++) {
		blks[i].metadata = parsers.byte(pkt);
	}
	return blks;
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
	var buf = makers['short'](items.length);
	for (var i = 0; i < items.length; i++) {
		buf = concat(buf, makers['short'](items[i].id));
		if (items[i].id != -1) {
			buf = concat(buf, makers['byte'](items[i].count));
			buf = concat(buf, makers['short'](items[i].health));
		}
	}
	return buf;
}

var unpackMultiBlocks = function (pkt) {
	var blocks = [];
	var numBlocks = parsers.short(pkt);
	for (var i = 0; i < numBlocks; i++)
	{
		coord = parsers.short(pkt);
		blocks.push({x: (coord >> 12), z: ((coord >> 8) & 0xF), y: (coord & 0xFF)})
	}
	for (var i = 0; i < numBlocks; i++)
		blocks[i].type = parsers.byte(pkt);
	
	for (var i = 0; i < numBlocks; i++)
		blocks[i].meta = parsers.byte(pkt);
	
	return blocks;
}

var unpackItems = function (pkt) {
	var items = [];
	var numItems = parsers.short(pkt);
	for (var i = 0; i < numItems; i++) {
		var id = parsers.short(pkt),
		    count, health;
		if (id != -1) {
			count = parsers.byte(pkt);
			health = parsers.short(pkt);
		}
		items.push({id: id, count: count, health: health});
	}
	return items;
}

function byte(name) { return ['byte', name]; }
function short(name) { return ['short', name]; }
function int(name) { return ['int', name]; }
function long(name) { return ['long', name]; }
function str(name) { return ['str', name]; }
function bool(name) { return ['bool', name]; }
function double(name) { return ['double', name]; }
function float(name) { return ['float', name]; }
function items(name) { return ['items', name]; }
function multiblock(name) { return ['multiblock', name]; }
function intstr(name) { return ['intstr', name]; }
function blockarr(name) { return ['blockarr', name]; }

var clientPacketStructure = {
	0x00: [],
	0x01: [int('protoVer'), str('username'), str('password')],
	0x02: [str('username')],
	0x03: [str('message')],
	0x05: [int('invType'), items('items')],
	0x0a: [bool('isFlying')],
	0x0b: [double('x'), double('y'), double('stance'), double('z'),
	       bool('flying')],
	0x0c: [float('rotation'), float('pitch'), bool('flying')],
	0x0d: [double('x'), double('y'), double('stance'), double('z'),
	       float('rotation'), float('pitch'), bool('flying')],

	0x0e: [byte('status'), int('x'), byte('y'), int('z'), byte('face')],
	0x0f: [short('item'), int('x'), byte('y'), int('z'), byte('face')],
	0x10: [int('uid'), short('item')],
	0x12: [int('uid'), byte('unk')],
	0x15: [int('uid'), short('item'), byte('unk'), int('x'), int('y'), int('z'), byte('rotation'), byte('pitch'), byte('hvel')], // Hvel is horizontal velocity [undoc'ed on wiki]
		
	0xff: [str('message')], // disconnect

}

var serverPacketStructure = {
	0x00: [],
	0x01: [int('playerID'), str('serverName'), str('motd')],
	0x02: [str('serverID')],
	0x03: [str('message')],
	0x04: [long('time')],
	0x05: [int('invType'), items('items')],
	0x06: [int('x'), int('y'), int('z')],
	0x0d: [double('x'), double('y'), double('stance'), double('z'),
	       float('rotation'), float('pitch'), bool('flying')],
	//0x0e: [byte('status'), int('x'), byte('y'), int('z'), byte('face')],
	//0x0f: [short('id'), int('x'), byte('y'), int('z'), byte('direction')],
	0x10: [int('uid'), short('item')],
	0x11: [short('item'), byte('amount'), short('life')],
	0x12: [int('uid'), byte('unk')],
	0x14: [int('uid'), str('playerName'), int('x'), int('y'), int('z'), byte('rotation'), byte('pitch'), short('curItem')],
	0x15: [int('uid'), short('item'), byte('unk'), int('x'), int('y'), int('z'), byte('rotation'), byte('pitch'), byte('hvel')], // Hvel is horizontal velocity [undoc'ed on wiki]
	0x16: [int('collectedID'), int('collectorID')],
	0x17: [int('uid'), byte('objType'), int('x'), int('y'), int('z')],
	0x18: [int('uid'), byte('mobType'), int('x'), int('y'), int('z'), byte('rotation'), byte('pitch')],
	0x1d: [int('uid')],
	0x1e: [int('uid')],
	0x1f: [int('uid'), byte('x'), byte('y'), byte('z')],
	0x20: [int('uid'), byte('rotation'), byte('pitch')],
	0x21: [int('uid'), byte('x'), byte('y'), byte('z'), byte('rotation'), byte('pitch')],
	0x22: [int('uid'), int('x'), int('y'), int('z'), byte('rotation'), byte('pitch')],
	0x32: [int('x'), int('z'), bool('mode')], // prechunk
	0x33: [int('x'), short('y'), int('z'), byte('sizeX'), byte('sizeY'),
	       byte('sizeZ'), intstr('chunk')], // map chunk, gzipped
	0x34: [int('x'), int('z'), multiblock('blocks')], // multi block change
	0x35: [int('x'), byte('y'), int('z'), byte('blockType'), byte('blockMetadata')],
	0x3b: [int('x'), short('y'), int('z'), str('nbt')],
	0xff: [str('message')], // disconnect
}

var packetNames = {
	0x00: 'KEEPALIVE',
	0x01: 'LOGIN',
	0x02: 'HANDSHAKE',
	0x03: 'CHAT',
	0x04: 'TIME',
	0x05: 'INVENTORY',
	0x06: 'SPAWN_POS',
	0x0a: 'FLYING',
	0x0b: 'PLAYER_POSITION',
	0x0c: 'PLAYER_LOOK',
	0x0d: 'PLAYER_MOVE_LOOK',
	0x0e: 'DIG_BLOCK',
	0x0f: 'PLACE_BLOCK',
	0x10: 'WIELD',
	0x11: 'ADD_TO_INVENTORY',
	0x12: 'ARM_ANIM',
	0x14: 'PLAYER_SPAWN',
	0x15: 'PICKUP_SPAWN',
	0x16: 'COLLECT_ITEM',
	0x17: 'ADD_VEHICLE',
	0x18: 'MOB_SPAWN',
	0x1d: 'DESTROY_ENTITY',
	0x1e: 'CREATE_ENTITY',
	0x1f: 'REL_ENTITY_MOVE',
	0x20: 'ENTITY_LOOK',
	0x21: 'REL_ENTITY_MOVE_LOOK',
	0x22: 'ENTITY_TELEPORT',
	0x32: 'PRE_CHUNK',
	0x33: 'MAP_CHUNK',
	0x34: 'MULTI_BLOCK_CHANGE',
	0x35: 'BLOCK_CHANGE',
	0x3b: 'NBT_ENTITY',
	0xff: 'DISCONNECT',
}

function unpack_fmt(fmt) {
	return function (pkt) {
		var len = pack.CalcLength(fmt);
		pkt.needs(len);
		var value = pack.Unpack(fmt, pkt.data, pkt.cursor);
		pkt.cursor += len;
		return value[0];
	};
}

function pack_fmt(fmt) {
	return function () {
		return new Buffer(pack.Pack(fmt, arguments));
	}
}

var parsers = {
	byte: unpack_fmt('b'),
	short: unpack_fmt('h'),
	int: unpack_fmt('i'),
	long: unpack_fmt('l'),
	str: unpackString,
	bool: unpackBool,
	float: unpack_fmt('f'),
	double: unpack_fmt('d'),
	multiblock: unpackMultiBlocks,
	items: unpackItems,
	intstr: unpackIntString,
	blockarr: unpackBlockArr,
}

var makers = {
	byte: pack_fmt('b'),
	short: pack_fmt('h'),
	int: pack_fmt('i'),
	long: pack_fmt('l'),
	str: packString,
	bool: packBool,
	float: pack_fmt('f'),
	double: pack_fmt('d'),
	items: packItems,
	intstr: packIntString,
	blockarr: packBlockArr,
}

exports.parsePacket = function (buf) {
	return exports.parsePacketWith(buf, clientPacketStructure);
}

exports.parsePacketWith = function (buf, structures) {
	var pkt = new Packet(buf);
	var struct = structures[pkt.type];
	if (!struct)
		throw Error("unknown packet type while parsing: 0x" +pkt.type.toString(16));
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
	return exports.makePacketWith(pktData, serverPacketStructure);
}

exports.makePacketWith = function (pktData, structures) {
	var struct = structures[pktData.type];
	if (!struct)
		throw Error("unknown packet type while making: 0x" + pkt.type.toString(16));
	var buf = new Buffer([pktData.type]);
	for (var field in struct) {
		var type = struct[field][0];
		var name = struct[field][1];
		buf = concat(buf, makers[type](pktData[name]));
	}
	return buf;
}

exports.clientPacketStructure = clientPacketStructure;
exports.serverPacketStructure = serverPacketStructure;
exports.packetNames = packetNames;
