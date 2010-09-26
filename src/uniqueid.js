

function UniqueIDGenerator()
{
	// Unique ID 0 has weird effects in some places, start at 1
	this.currentID = 1;
}

UniqueIDGenerator.prototype.allocate = function()
{
	return this.currentID++;
}

UniqueIDGenerator.prototype.release = function(id)
{
}

module.exports.UniqueIDGenerator = UniqueIDGenerator
