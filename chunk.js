var sys = require('sys');

var Chunk = function () {
	this.sizeX = 16;
	this.sizeY = 128;
	this.sizeZ = 16;

	this.sectionSize = this.sizeX * this.sizeY * this.sizeZ;

	this.data = new Buffer(this.sizeX * this.sizeY * this.sizeZ * 2.5);
	for (var i = 0; i < this.data.length; i++) {
		this.data[i] = 0;
	}
};

Chunk.prototype.indexOf = function (x, y, z) {
	return y + (z * this.sizeY) + (x * this.sizeY * this.sizeZ);
};

Chunk.prototype.setType = function (x, y, z, type) {
	this.data[this.indexOf(x, y, z)] = type;
};

Chunk.prototype.getType = function (x, y, z) {
	return this.data[this.indexOf(x, y, z)];
};

Chunk.prototype.setMetadata = function (x, y, z, meta) {
	this.data[this.indexOf(x, y, z) + this.sectionSize] = meta;
};

Chunk.prototype.getMetadata = function (x, y, z) {
	return this.data[this.indexOf(x, y, z) + this.sectionSize];
};

Chunk.prototype.setLighting = function (x, y, z, lighting) {
	var idx = this.indexOf(x, y, z),
	    byte = Math.floor(idx / 2),
	    top = idx % 2 === 1,
	    value = this.data[byte + this.sectionSize * 2];
	if (top) {
		value = (value & 0xf) | ((lighting & 0xf) << 4);
	} else {
		value = (value & 0xf0) | (lighting & 0xf);
	}
	this.data[byte + this.sectionSize * 2] = value;
};

exports.Chunk = Chunk;
