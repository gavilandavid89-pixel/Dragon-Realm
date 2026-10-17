// Server-authoritative collision checks for logical world coordinates.
// Rectangles are authored in world-config.js; the client only visualizes them.
const { WORLD_MAPS, WORLD_OBSTACLES } = require("./world-config");

const PLAYER_RADIUS = 18;
const SAMPLE_DISTANCE = 8;

function obstacleContains(mapId, x, y, radius = PLAYER_RADIUS) {
  return WORLD_OBSTACLES.some(obstacle =>
    obstacle.mapId === mapId &&
    x >= obstacle.x - radius &&
    x <= obstacle.x + obstacle.width + radius &&
    y >= obstacle.y - radius &&
    y <= obstacle.y + obstacle.height + radius
  );
}

function isPositionWalkable(mapId, x, y, radius = PLAYER_RADIUS) {
  const map = WORLD_MAPS.find(entry => entry.id === mapId);
  if (!map || !Number.isFinite(x) || !Number.isFinite(y)) return false;
  if (x < radius || y < radius || x > map.width - radius || y > map.height - radius) return false;
  return !obstacleContains(mapId, x, y, radius);
}

function canTraverseAxis(mapId, from, to, axis, radius = PLAYER_RADIUS) {
  const start = from[axis];
  const end = to[axis];
  const distance = end - start;
  const steps = Math.max(1, Math.ceil(Math.abs(distance) / SAMPLE_DISTANCE));
  for (let i = 1; i <= steps; i += 1) {
    const ratio = i / steps;
    const x = axis === "x" ? start + distance * ratio : from.x;
    const y = axis === "y" ? start + distance * ratio : from.y;
    if (!isPositionWalkable(mapId, x, y, radius)) return false;
  }
  return true;
}

// Axis-separated movement prevents tunnelling and allows sliding along obstacle edges.
function resolveMovement(mapId, from, proposed, radius = PLAYER_RADIUS) {
  const current = { x: from.x, y: from.y };
  const target = {
    x: Math.max(radius, Math.min(WORLD_MAPS.find(map => map.id === mapId).width - radius, proposed.x)),
    y: Math.max(radius, Math.min(WORLD_MAPS.find(map => map.id === mapId).height - radius, proposed.y))
  };
  const xFirst = Math.abs(target.x - current.x) >= Math.abs(target.y - current.y);
  const axes = xFirst ? ["x", "y"] : ["y", "x"];
  for (const axis of axes) {
    const candidate = { ...current, [axis]: target[axis] };
    if (canTraverseAxis(mapId, current, candidate, axis, radius)) current[axis] = candidate[axis];
  }
  return {
    x: Math.round(current.x),
    y: Math.round(current.y),
    blocked: current.x !== proposed.x || current.y !== proposed.y
  };
}

module.exports = { PLAYER_RADIUS, isPositionWalkable, resolveMovement };
