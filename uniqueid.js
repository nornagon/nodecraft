

function UniqueIDGenerator()
{
	this.currentID = 0;
}

UniqueIDGenerator.prototype.allocate = function()
{
	return this.currentID++;
}

UniqueIDGenerator.prototype.release = function(id)
{
}

module.exports.UniqueIDGenerator = UniqueIDGenerator
