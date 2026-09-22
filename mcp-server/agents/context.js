const MAX_OBJECTS = 100;
const MAX_COLLECTIONS = 50;

function round(value) {
  return Number.isFinite(Number(value)) ? Math.round(Number(value) * 1000) / 1000 : 0;
}

function vector(value) {
  return Array.isArray(value) ? value.slice(0, 3).map(round) : [0, 0, 0];
}

function sceneBounds(objects) {
  if (!objects.length) return [0, 0, 0];
  const minimum = [Infinity, Infinity, Infinity];
  const maximum = [-Infinity, -Infinity, -Infinity];
  for (const object of objects) {
    const location = vector(object.location);
    const dimensions = vector(object.dimensions);
    for (let axis = 0; axis < 3; axis += 1) {
      minimum[axis] = Math.min(minimum[axis], location[axis] - dimensions[axis] / 2);
      maximum[axis] = Math.max(maximum[axis], location[axis] + dimensions[axis] / 2);
    }
  }
  return maximum.map((value, axis) => round(value - minimum[axis]));
}

/**
 * Deliberately excludes raw addon results, code, conversation history, and logs.
 * This is the sole packet handed to the Scene Inspector.
 */
export function createSceneContextPacket({ userIntent, snapshot = {} } = {}) {
  const rawObjects = Array.isArray(snapshot?.scene_objects) ? snapshot.scene_objects : [];
  const objects = rawObjects.slice(0, MAX_OBJECTS).map((object) => ({
    name: String(object?.name || "Unnamed").slice(0, 128),
    type: String(object?.type || "UNKNOWN").slice(0, 32),
    location: vector(object?.location),
    dimensions: vector(object?.dimensions),
    ...(Number.isFinite(object?.vertices) ? { vertices: object.vertices } : {}),
    ...(Number.isFinite(object?.faces) ? { faces: object.faces } : {}),
  }));
  const types = Object.create(null);
  for (const object of objects) types[object.type] = (types[object.type] || 0) + 1;

  return {
    userIntent: String(userIntent || "").slice(0, 4000),
    sceneScale: sceneBounds(objects),
    objectCount: rawObjects.length,
    objects,
    objectTypes: types,
    collections: (Array.isArray(snapshot?.collections) ? snapshot.collections : [])
      .slice(0, MAX_COLLECTIONS)
      .map((collection) => String(collection).slice(0, 128)),
    renderEngine: typeof snapshot?.render_engine === "string" ? snapshot.render_engine : undefined,
  };
}
