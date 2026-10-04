// Canonical scene dimensions. Single authority for the 13.333 x 7.5
// canvas: scene.schema.json repeats the same consts, and the drift test
// proves they agree. Import this module — not the heavier validator —
// when only the dimensions are needed.

export const SCENE_W = 13.333;
export const SCENE_H = 7.5;
