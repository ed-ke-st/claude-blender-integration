# AI Generation Contract

Use this contract to keep model output stable across Blender coordinate systems, UV workflows, and node APIs.

## System Prompt Template

Use this as the base system prompt for code generation:

```
You write executable Blender Python only. No markdown. No explanation.
Only CREATE new objects. NEVER delete, remove, or overwrite existing objects or data.
Never call bpy.ops.object.delete or bpy.data.objects.remove.
Do not create or manage collections - objects are organized automatically.
Target Blender 5.0+ API.
Socket naming rules: use 'Factor' not 'Fac'; use 'A'/'B' not 'Color1'/'Color2';
Principled BSDF inputs must be 'Base Color', 'Metallic', 'Roughness', 'IOR', 'Alpha'.
Coordinate conventions are mandatory: +Z is up, +X is right, -Y is forward, meters, right-handed system.
If your code creates image textures, it must also define UV usage explicitly
(create/ensure an active UV layer and use UV texture coordinates).
First non-empty line of output must be a comment formatted exactly like:
# CONVENTIONS_ACK: Z_UP,X_RIGHT,NEG_Y_FORWARD,METERS,RIGHT_HANDED
```

## Scene Contract JSON Schema

Include this payload in model context (and emit it in `blender_result.json`):

```json
{
  "generation_rules_version": "2026-02-22.1",
  "scene_conventions": {
    "up_axis": "Z",
    "forward_axis": "-Y",
    "right_axis": "X",
    "units": "meters",
    "unit_scale": 1.0,
    "handedness": "right-handed"
  },
  "uv_conventions": {
    "uv_origin": "bottom-left",
    "require_uv_unwrap_for_image_textures": true,
    "preferred_projection": "smart_project",
    "preferred_active_uv_map": "UVMap"
  },
  "material_conventions": {
    "principled_bsdf_inputs": [
      "Base Color",
      "Metallic",
      "Roughness",
      "IOR",
      "Alpha"
    ],
    "mix_node_inputs": ["Factor", "A", "B"],
    "forbidden_legacy_socket_names": ["Fac", "Color1", "Color2"]
  },
  "required_conventions_ack_tokens": [
    "Z_UP",
    "X_RIGHT",
    "NEG_Y_FORWARD",
    "METERS",
    "RIGHT_HANDED"
  ]
}
```

## Static Validator Checklist

Run these checks before execution:

1. First non-empty line is:
   `# CONVENTIONS_ACK: Z_UP,X_RIGHT,NEG_Y_FORWARD,METERS,RIGHT_HANDED`
2. Reject legacy socket names:
   `inputs["Fac"]`, `inputs["Color1"]`, `inputs["Color2"]`.
3. If image textures are used:
   - ensure UV layer setup exists (`uv_layers` or `bpy.ops.uv.*`), and
   - ensure UV coordinates are wired from `ShaderNodeTexCoord` UV output.
4. Keep existing destructive-operation protections in place (`bpy.ops.object.delete`, `bpy.data.objects.remove`).

## Recommended Runtime Flow

1. Build prompt with system template + `SCENE_CONTRACT_JSON`.
2. Generate code.
3. Static validate.
4. Execute in Blender.
5. Write `blender_result.json` with conventions + execution result.
6. On validation failure, return machine-readable error list and retry generation.
