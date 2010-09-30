var chunk = require('./chunk');
var sys = require('sys');

function WorldTerrain() {
	this.chunk_xz_granularity = 16;

	// TODO - this masking solution only works for power of two chunks
	this.chunk_xz_mask = 0xF;
	this.chunk_xz_shift = 4;

	this.chunks = {};
}

function fillChunk(chunk_data, x, z) {
	for (var x2 = 0; x2 < 16; x2++) {
		for (var y2 = 0; y2 < 128; y2++) {
			for (var z2 = 0; z2 < 16; z2++) {
				var threshold = 64 + Math.floor(Math.sin(Math.sqrt((x+x2)*(x+x2)+(z+z2)*(z + z2))/64) * 16);

				if (y2 == 0) {
					chunk_data.setType(x2, y2, z2, 0x07);
				} else if (y2 < threshold) {
					chunk_data.setType(x2, y2, z2, 0x03);
				} else if (y2 == threshold) {
					chunk_data.setType(x2, y2, z2, 0x02);
				} else {
					chunk_data.setType(x2, y2, z2, 0x00);
				}
			}
		}
	}
	
	if (Math.floor(Math.random()*4) == 1)
	{
		/* add a tree */
		var tx = Math.floor(Math.random()*16);
		var tz = Math.floor(Math.random()*16);
		var th = Math.floor(Math.random()*6)+3;
		var ty;

		for (var i=127; i>=0; i--)
			if (chunk_data.getType(tx,i,tz) != 0)
			{
				ty = i;
				break;
			}
		

		for (var i=Math.floor(th/2); i<th+2; i++)
		{
			for (var j=-2; j<3; j++)
				for (var k=-2; k<3; k++)
				{
					if (j+tx < 0 || j+tx>15 || k+tz <0||k+tz>15)
						continue;
					chunk_data.setType(tx+j, i+ty, tz+k, 18);
				}
		}

		for (var i=1; i<=th; i++)
			chunk_data.setType(tx, i+ty, tz, 17);
		
	}
}

/* Stubbed out with procedural terrain generator */
WorldTerrain.prototype.loadTerrain = function(x,z, done_callback) {
	var chunk_data = new chunk.Chunk();
	fillChunk(chunk_data, x, z);

	this.chunks[[this.chunkIndex(x),this.chunkIndex(z)]] = chunk_data;
	done_callback(chunk_data);
}

WorldTerrain.prototype.getChunk = function(x, z, done_callback) {
	var x_i = this.chunkIndex(x);
	var z_i = this.chunkIndex(z);
	if (!this.chunks[[x_i,z_i]])
		this.loadTerrain(x, z, done_callback)
	else
		done_callback(this.chunks[[x_i,z_i]]);
}

WorldTerrain.prototype.chunkIndex = function(n)
{
	return n >> this.chunk_xz_shift;
}

WorldTerrain.prototype.getCellType = function(x,y,z, done_callback)
{	
	var me = this;

	this.getChunk(x, z,
			function(chunk_data) {
				var x_i = x & me.chunk_xz_mask;
				var z_i = z & me.chunk_xz_mask;
				done_callback(chunk_data.getType(x_i, y, z_i));
			});

}

WorldTerrain.prototype.setCellType = function (x,y,z,t) {	
	var me = this;

	this.getChunk(x, z,
			function (chunk_data) {
				var x_i = x & me.chunk_xz_mask;
				var z_i = z & me.chunk_xz_mask;
				chunk_data.setType(x_i, y, z_i, t);
				if (t == 0) {
					// HACK ALERT: TODO - RECALCULATE LIGHTING / set deferred recalculate
					chunk_data.setLighting(x_i, y, z_i, 0xF);
					chunk_data.setLighting(x_i-1, y, z_i, 0xF);
					chunk_data.setLighting(x_i+1, y, z_i, 0xF);
					chunk_data.setLighting(x_i, y-1, z_i, 0xF);
					chunk_data.setLighting(x_i, y+1, z_i, 0xF);
					chunk_data.setLighting(x_i, y, z_i-1, 0xF);
					chunk_data.setLighting(x_i, y, z_i+1, 0xF);
				}
			});
}

function asyncMap (fn, list, cb_) {
  if (typeof cb_ !== "function") throw new Error(
    "No callback provided to asyncMap");
  var data = []
    , l = list.length;
  if (!l) return cb_(null, []);
  function cb (d) {
    data = data.concat(d);
    if (-- l === 0) cb_(data);
  }
  list.forEach(function (ar) { fn(ar, cb) });
}

// Recalculate lighting for the given chunk.
WorldTerrain.prototype.recalculateLighting = function (x, z, cb) {
	var me = this;
	var x_i = x >> me.chunk_xz_shift, z_i = z >> me.chunk_xz_shift;

	sys.debug("light for " + x + "," + z);

	// make sure all the terrain is loaded around x_i,y_i.
	asyncMap(function (d, cb) {
		me.getChunk(
			(x_i+d[0]) << me.chunk_xz_shift,
			(z_i+d[1]) << me.chunk_xz_shift, cb);
	},
	  [[-1,-1], [0,-1], [1,-1],
	   [-1, 0], [0, 0], [1, 0],
	   [-1, 1], [0, 1], [1, 1]], done);

	// once that's done, ...
	function done(data) {
		function dchunk(dx, dz) {
			return data[dx+1+(dz+1)*3];
		}
		function chunkFor(x,z) {
			var lx_i = x >> me.chunk_xz_shift, lz_i = z >> me.chunk_xz_shift;
			var dx_i = x_i - lx_i, dz_i = z_i - lz_i;
			return dchunk(dx_i, dz_i);
		}
		// step 1: set everything above ground to 0xf
		for (var dx = -1; dx <= 1; dx++) {
			for (var dz = -1; dz <= 1; dz++) {
				var chunk_data = dchunk(dx, dz);
				if (chunk_data.lit < 1) {
					chunk_data.clearLight();
					chunk_data.setSkyLight(0xf);
					chunk_data.lit = 1;
				}
			}
		}

		var numFlooded = 0;
		// step 2: find lit blocks that haven't correctly filled adjacent blocks.
		// TODO: don't hardcode chunk size :/
		var baseX = (x_i-1) << me.chunk_xz_shift;
		var baseZ = (z_i-1) << me.chunk_xz_shift;
		for (var x = 0; x < 16*3; x++) {
			for (var z = 0; z < 16*3; z++) {
				for (var y = 0; y < 128; y++) {
					// don't flood from impenetrable blocks, since they are all dark.
					if (!isPenetrable(x+baseX, y, z+baseZ)) continue;
					if (!isFlooded(x+baseX, y, z+baseZ)) {
						floodLightFrom(x+baseX, y, z+baseZ);
						numFlooded++;
					}
				}
			}
		}
		sys.debug("flooded: " + numFlooded);

		dchunk(0,0).lit = 2;

		cb();

		function isFlooded(x,y,z) {
			var light = lightingAt(x,y,z);
			if (light <= 1) return true;
			// TODO: unroll?
			for (var dx = -1; dx <= 1; dx++) {
				for (var dz = -1; dz <= 1; dz++) {
					for (var dy = -1; dy <= 1; dy++) {
						if ((dx<0?-dx:dx)+(dz<0?-dz:dz)+(dy<0?-dy:dy) != 1) continue;
						if (inBounds(x+dx,y+dy,z+dz)) {
							if (isPenetrable(x+dx,y+dy,z+dz) &&
									lightingAt(x+dx,y+dy,z+dz) < light-1) {
								return false;
							}
						}
					}
				}
			}
			return true;
		}

		function floodLightFrom(x,y,z) {
			var light = lightingAt(x,y,z);
			if (light <= 1) return;
			for (var dx = -1; dx <= 1; dx++) {
				for (var dz = -1; dz <= 1; dz++) {
					for (var dy = -1; dy <= 1; dy++) {
						if (dx === 0 && dz === 0 && dy === 0) { continue; }
						if (!inBounds(x+dx, y+dy, z+dz)) { continue; }
						if (!isPenetrable(x+dx, y+dy, z+dz)) { continue; }
						if (lightingAt(x+dx, y+dy, z+dz) < light-1) {
							setLightingAt(x+dx, y+dy, z+dz, light-1);
							if (light-1 > 1) {
								floodLightFrom(x+dx, y+dy, z+dz);
							}
						}
					}
				}
			}
		}

		function inBounds(x,y,z) {
			return x >= ((x_i-1) << me.chunk_xz_shift) &&
			       x <  ((x_i+1) << me.chunk_xz_shift) &&
			       z >= ((z_i-1) << me.chunk_xz_shift) &&
			       z <  ((z_i+1) << me.chunk_xz_shift) &&
			       y >= 0 && y < 128;
		}

		// TODO: ugly ugly ugly :(
		function lightingAt(x,y,z) {
			var cx_i = x >> me.chunk_xz_shift,
			    cz_i = z >> me.chunk_xz_shift,
			    cx = cx_i << me.chunk_xz_shift,
			    cz = cz_i << me.chunk_xz_shift;
			return chunkFor(x,z).getLighting(x-cx, y, z-cz);
		}
		function setLightingAt(x,y,z, light) {
			var cx_i = x >> me.chunk_xz_shift,
			    cz_i = z >> me.chunk_xz_shift,
			    cx = cx_i << me.chunk_xz_shift,
			    cz = cz_i << me.chunk_xz_shift;
			return chunkFor(x,z).setLighting(x-cx, y, z-cz, light);
		}
		function isPenetrable(x,y,z) {
			var cx_i = x >> me.chunk_xz_shift,
			    cz_i = z >> me.chunk_xz_shift,
			    cx = cx_i << me.chunk_xz_shift,
			    cz = cz_i << me.chunk_xz_shift;
			return chunk.transmitsLight(chunkFor(x,z).getType(x-cx, y, z-cz));
		}
	}
}


WorldTerrain.prototype.getMaxHeight = function (x, z, done_callback) {
	var currentY = 127;
	var me = this;

	iterate = function(cell_code)
	{
		if (cell_code != 0x0 || currentY == 0)
		{
			done_callback(currentY);
			return;
		}
		currentY--;
		me.getCellType(x, currentY, z, iterate);
	}
	
	me.getCellType(x, currentY, z, iterate);
}

module.exports.WorldTerrain = WorldTerrain;
