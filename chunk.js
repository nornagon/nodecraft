var sys = require('sys');

Chunk = function () {
	this.sizeX = 16;
	this.sizeY = 128;
	this.sizeZ = 16;

	this.sectionSize = this.sizeX * this.sizeY * this.sizeZ;

	this.data = new Buffer(this.sizeX * this.sizeY * this.sizeZ * 2.5);
	for (var i = 0; i < this.data.length; i++) {
		this.data[i] = 0;
	}
}

Chunk.prototype.indexOf = function (x, y, z) {
	return y + (z * this.sizeY) + (x * this.sizeY * this.sizeZ);
}

Chunk.prototype.setType = function (x, y, z, type) {
	this.data[this.indexOf(x,y,z)] = type;
}
Chunk.prototype.setMetadata = function (x, y, z, meta) {
	this.data[this.indexOf(x,y,z) + this.sectionSize] = meta;
}
Chunk.prototype.setLighting = function (x, y, z, lighting) {
	var idx = this.indexOf(x,y,z)/2;
	var byte = Math.floor(idx);
	var top = byte % 2 == 0;
	var value = this.data[byte + this.sectionSize * 2];
	if (top) {
		value = (value & 0xf) | ((lighting & 0xf) << 4);
	} else {
		value = (value & 0xf0) | (lighting & 0xf);
	}
	this.data[byte + this.sectionSize * 2] = 0xFF;
}

exports.Chunk = Chunk;
