var sys = require('sys');

var Chunk = function () {
	this.sizeX = 16;
	this.sizeY = 128;
	this.sizeZ = 16;

	this.sectionSize = this.sizeX * this.sizeY * this.sizeZ;
	this.lit = false;

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

Chunk.prototype.getLighting = function (x, y, z) {
	var idx = this.indexOf(x, y, z),
	    byte = Math.floor(idx / 2),
	    top = idx % 2 === 1,
	    value = this.data[byte + this.sectionSize * 2];
	if (top) {
		return (value & 0xf0) >> 4;
	} else {
		return (value & 0xf);
	}
};

Chunk.prototype.clearLight = function () {
	var x, z, y;
	for (x = 0; x < this.sizeX; x++) {
		for (z = 0; z < this.sizeZ; z++) {
			for (y = this.sizeY-1; y >= 0; y--) {
				if (transmitsLight(this.getType(x, y, z))) {
					this.setLighting(x, y, z, 0x1);
				} else {
					this.setLighting(x, y, z, 0x0);
				}
			}
		}
	}
}

Chunk.prototype.setSkyLight = function (light) {
	var x, z, y;
	for (x = 0; x < this.sizeX; x++) {
		for (z = 0; z < this.sizeZ; z++) {
			for (y = this.sizeY-1; y >= 0; y--) {
				if (!transmitsLight(this.getType(x, y, z))) {
					break;
				}
				this.setLighting(x, y, z, light);
			}
		}
	}
};

var ChunkTypes = {
	AIR: 0x00,
	STONE: 0x01,
	GRASS: 0x02,
	DIRT: 0x03,
	COBBLESTONE: 0x04,
	WOOD: 0x05,
	SAPLING: 0x06,
	ADMINIUM: 0x07,
	WATER: 0x08,

	GLASS: 0x14,
};

var transmitsLight = function (type) {
	return type === ChunkTypes.AIR || type === ChunkTypes.GLASS;
}

exports.ChunkTypes = ChunkTypes;
exports.Chunk = Chunk;
exports.transmitsLight = transmitsLight;
