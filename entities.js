function EntityTracker(world)
{
	this.world = world;
	this.entity_areas = {};
	this.entity_uids = {};
}

var GATHER_RADIUS = 4*32;
var AREA_MAG = 5;


EntityTracker.prototype.spawnEntity = function(x,y,z,type,rotation,pitch,velocity)
{
	var entity_index = [x >> AREA_MAG, z >> AREA_MAG];

	if (!(entity_index in this.entity_areas)) {
		this.entity_areas[entity_index] = [];
	}

	var entity = {uid: this.world.uidgen.allocate(),
		x:x, y:y, z:z, type:type, rotation:rotation, pitch:pitch, velocity:velocity};

	this.entity_areas[entity_index].push(entity); 
	this.entity_uids[entity.uid] = entity;

	return entity;
};

EntityTracker.prototype.findPickups = function(x,y,z)
{
	var pickups = [];

	var x_index = x>>AREA_MAG;
	var z_index = z>>AREA_MAG;

	for (var x_i = x_index-1; x_i <= x_index+1; x_i++) {
		for (var z_i = z_index-1; z_i <= z_index+1; z_i++)
		{
			var entity_index = [x_i, z_i];
			if (entity_index in this.entity_areas)
			{
				var entity_list = this.entity_areas[entity_index];

				for (var i=0; i<entity_list.length; i++)
				{
					var entity = entity_list[i];

					var x_d = entity.x - x;
					var y_d = entity.y - y;
					var z_d = entity.z - z;

					if (Math.sqrt(x_d * x_d + y_d * y_d + z_d * z_d) < GATHER_RADIUS) {
						pickups.push(entity);
					}
				}
			}
		}
	}

	return pickups;
};

EntityTracker.prototype.destroyEntity = function(uid)
{

	var entity = this.entity_uids[uid];
	delete this.entity_uids[uid];

	if (!entity) { return; }

	var x_index = entity.x >> AREA_MAG;
	var z_index = entity.z >> AREA_MAG;
	
	var entity_index = [x_index, z_index];

	var entity_list = this.entity_areas[entity_index];

	for (var i=0; i<entity_list.length; i++)
	{
		if (entity_list[i].uid == uid)
		{
			entity_list.splice(i,1);
			break;
		}
	}
	
};

module.exports.EntityTracker = EntityTracker;
