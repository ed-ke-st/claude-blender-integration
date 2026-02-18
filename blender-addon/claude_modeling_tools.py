bl_info = {
    "name": "Claude Modeling Tools",
    "author": "Eddie Stewart",
    "version": (1, 1, 0),
    "blender": (5, 0, 0),
    "location": "View3D > Sidebar > Claude Tools",
    "description": "AI-assisted modeling tools with Claude integration",
    "category": "3D View",
}

import bpy
import bmesh
from mathutils import Vector
import random
import math
import json
import os
import time
import urllib.request
import urllib.error


# File watching globals — one watch file per AI source
WATCH_FILES = {
    "claude": "/tmp/blender_claude_execute.py",
    "openai": "/tmp/blender_openai_execute.py",
}
RESULT_FILE = "/tmp/blender_result.json"
# Keep the legacy path as an alias so old MCP configs still work
WATCH_FILE_PATH = WATCH_FILES["claude"]
last_modified_times = {key: 0 for key in WATCH_FILES}


def check_and_execute_file():
    """Check all watched files for modifications and execute them"""
    for source, path in WATCH_FILES.items():
        if not os.path.exists(path):
            continue

        try:
            current_modified_time = os.path.getmtime(path)

            if current_modified_time > last_modified_times[source]:
                last_modified_times[source] = current_modified_time

                with open(path, 'r') as f:
                    code = f.read()

                if code.strip():
                    try:
                        scene = bpy.context.scene
                        model_name = source if source == "claude" else getattr(
                            scene, 'claude_openai_model', source
                        )
                        execute_blender_code(code, scene, model_name=model_name)
                        print(f"✓ Auto-executed code from {path} ({source})")
                    except Exception as e:
                        print(f"✗ Auto-execution error ({source}): {str(e)}")
                        if hasattr(bpy.context.scene, 'claude_last_error'):
                            bpy.context.scene.claude_last_error = str(e)

        except Exception as e:
            print(f"File watcher error ({source}): {str(e)}")

    return 0.5


def file_watcher_timer():
    return check_and_execute_file()


def get_or_create_collection(name):
    """Get existing collection by name, or create it and link to the scene."""
    col = bpy.data.collections.get(name)
    if col is None:
        col = bpy.data.collections.new(name)
        bpy.context.scene.collection.children.link(col)
    return col


def move_objects_to_collection(objects, collection):
    """Move objects into the target collection, unlinking from others."""
    for obj in objects:
        for col in list(obj.users_collection):
            col.objects.unlink(obj)
        collection.objects.link(obj)


def _obj_info(obj):
    """Return a dict describing an object's key properties."""
    info = {
        "name": obj.name,
        "type": obj.type,
        "location": [round(v, 4) for v in obj.location],
        "dimensions": [round(v, 4) for v in obj.dimensions],
    }
    if obj.type == 'MESH' and obj.data:
        info["vertices"] = len(obj.data.vertices)
        info["faces"] = len(obj.data.polygons)
    return info


def write_result(status, message, created=None, model_name=None, code=None):
    """Write execution result to JSON file for MCP server to read."""
    result = {
        "status": status,
        "message": message,
        "timestamp": time.time(),
        "model": model_name,
        "last_code": code,
        "objects_created": created or [],
        "scene_objects": [_obj_info(o) for o in bpy.data.objects],
        "collections": [c.name for c in bpy.data.collections],
    }
    try:
        with open(RESULT_FILE, "w", encoding="utf-8") as f:
            json.dump(result, f, indent=2)
    except Exception as e:
        print(f"Failed to write result file: {e}")


def execute_blender_code(code, scene=None, model_name=None):
    """Execute generated code in Blender context, moving new objects to a model collection.
    Rolls back if existing objects are deleted."""
    objects_before = set(bpy.data.objects)
    names_before = {o.name for o in objects_before}

    # Save undo state so we can roll back destructive code
    bpy.ops.ed.undo_push(message="Before AI code execution")

    try:
        exec(code, {"bpy": bpy, "bmesh": bmesh, "Vector": Vector,
                    "math": math, "random": random})
    except Exception as e:
        write_result("error", str(e), model_name=model_name, code=code)
        raise

    # Check if any pre-existing objects were removed
    names_after = {o.name for o in bpy.data.objects}
    deleted = names_before - names_after
    if deleted:
        bpy.ops.ed.undo()
        msg = (f"Generated code deleted existing objects ({', '.join(sorted(deleted))}). "
               "Execution was rolled back.")
        write_result("rolled_back", msg, model_name=model_name, code=code)
        raise RuntimeError(msg)

    new_objects = [o for o in bpy.data.objects if o not in objects_before]
    new_names = [o.name for o in new_objects]
    if new_objects and model_name:
        col = get_or_create_collection(f"Generated — {model_name}")
        move_objects_to_collection(new_objects, col)

    write_result("success", f"Created {len(new_names)} object(s)",
                 created=new_names, model_name=model_name, code=code)


def strip_code_fences(text):
    """Remove markdown code fences if present"""
    cleaned = text.strip()
    if cleaned.startswith("```") and cleaned.endswith("```"):
        lines = cleaned.splitlines()
        if len(lines) >= 2:
            return "\n".join(lines[1:-1]).strip()
    return cleaned


def extract_response_text(payload):
    """Extract text from OpenAI responses API payload"""
    if payload.get("output_text"):
        return payload["output_text"]
    
    text_parts = []
    for item in payload.get("output", []):
        for content in item.get("content", []):
            if content.get("type") in {"output_text", "text"}:
                text_value = content.get("text") or content.get("value") or ""
                if text_value:
                    text_parts.append(text_value)
    
    return "\n".join(text_parts).strip()


def build_openai_generate_prompt(description, context_text=""):
    """Build a strict prompt for Blender Python code generation"""
    return f"""Generate Blender Python code for the following request.

REQUIREMENTS:
- Use bpy and bmesh where appropriate
- Code must run in Blender 5.0+
- Include basic error handling
- Return ONLY Python code, no markdown fences
- NEVER delete or remove existing objects — only create new ones
- Do NOT manage collections — new objects are organized automatically
- Blender 4.0+ API changes: shader node inputs were renamed:
  - "Fac" is now "Factor"
  - "Color1"/"Color2" are now "A"/"B" (Mix nodes)
  - Principled BSDF: "Base Color", "Metallic", "Roughness", "IOR", "Alpha"
  - NEVER use old names like "Fac", "Color1", "Color2"

REQUEST: {description}
{f'CONTEXT: {context_text}' if context_text else ''}"""


# Operator to clear error message
class CLAUDE_OT_clear_error(bpy.types.Operator):
    """Clear the error message"""
    bl_idname = "claude.clear_error"
    bl_label = "Clear Error"
    
    def execute(self, context):
        context.scene.claude_last_error = ""
        return {'FINISHED'}


# Operator to show error in text editor
class CLAUDE_OT_show_error(bpy.types.Operator):
    """Show error in text editor for easy copying"""
    bl_idname = "claude.show_error"
    bl_label = "Show in Text Editor"
    
    def execute(self, context):
        error_text = context.scene.claude_last_error
        
        if not error_text:
            self.report({'INFO'}, "No error to show")
            return {'CANCELLED'}
        
        # Create or get text block
        text_name = "Claude_Error_Log"
        if text_name in bpy.data.texts:
            text_block = bpy.data.texts[text_name]
            text_block.clear()
        else:
            text_block = bpy.data.texts.new(text_name)
        
        # Write error to text block
        text_block.write(error_text)
        
        # Try to show in a text editor
        # Find or create a text editor area
        found_text_editor = False
        for area in bpy.context.screen.areas:
            if area.type == 'TEXT_EDITOR':
                area.spaces[0].text = text_block
                found_text_editor = True
                break
        
        if not found_text_editor:
            self.report({'INFO'}, f"Error saved to text block '{text_name}'. Open Text Editor to view/copy.")
        else:
            self.report({'INFO'}, "Error displayed in Text Editor. Select all (Cmd+A) and copy (Cmd+C)")
        
        return {'FINISHED'}


# Example Operator 1: Create Parametric Object
class CLAUDE_OT_create_parametric(bpy.types.Operator):
    """Create a parametric object"""
    bl_idname = "claude.create_parametric"
    bl_label = "Create Parametric Mesh"
    bl_options = {'REGISTER', 'UNDO'}
    
    segments: bpy.props.IntProperty(name="Segments", default=8, min=3, max=64)
    radius: bpy.props.FloatProperty(name="Radius", default=2.0, min=0.1, max=10.0)
    height: bpy.props.FloatProperty(name="Height", default=2.0, min=0.1, max=10.0)
    
    def execute(self, context):
        # Simple example: create a cylinder-like mesh
        mesh = bpy.data.meshes.new("Parametric")
        obj = bpy.data.objects.new("Parametric", mesh)
        context.collection.objects.link(obj)
        
        bm = bmesh.new()
        
        # Create top and bottom circles
        verts_bottom = []
        verts_top = []
        
        for i in range(self.segments):
            angle = (i / self.segments) * 2 * math.pi
            x = math.cos(angle) * self.radius
            y = math.sin(angle) * self.radius
            
            verts_bottom.append(bm.verts.new((x, y, 0)))
            verts_top.append(bm.verts.new((x, y, self.height)))
        
        # Create faces
        for i in range(self.segments):
            next_i = (i + 1) % self.segments
            bm.faces.new([verts_bottom[i], verts_bottom[next_i], 
                         verts_top[next_i], verts_top[i]])
        
        # Cap bottom and top
        bm.faces.new(verts_bottom)
        bm.faces.new(reversed(verts_top))
        
        bm.to_mesh(mesh)
        bm.free()
        
        return {'FINISHED'}


# Example Operator 2: Randomize Selected Mesh
class CLAUDE_OT_randomize_mesh(bpy.types.Operator):
    """Add random displacement to selected mesh vertices"""
    bl_idname = "claude.randomize_mesh"
    bl_label = "Randomize Mesh"
    bl_options = {'REGISTER', 'UNDO'}
    
    strength: bpy.props.FloatProperty(name="Strength", default=0.1, min=0.0, max=2.0)
    
    def execute(self, context):
        obj = context.active_object
        
        if not obj or obj.type != 'MESH':
            self.report({'ERROR'}, "Select a mesh object")
            return {'CANCELLED'}
        
        mesh = obj.data
        bm = bmesh.new()
        bm.from_mesh(mesh)
        
        for vert in bm.verts:
            offset = Vector((
                random.uniform(-1, 1),
                random.uniform(-1, 1),
                random.uniform(-1, 1)
            )) * self.strength
            vert.co += offset
        
        bm.to_mesh(mesh)
        bm.free()
        mesh.update()
        
        return {'FINISHED'}


# Operator to toggle file watching
class CLAUDE_OT_toggle_file_watcher(bpy.types.Operator):
    """Toggle automatic code execution from file"""
    bl_idname = "claude.toggle_file_watcher"
    bl_label = "Toggle Auto-Execute"
    
    def execute(self, context):
        scene = context.scene
        
        if scene.claude_file_watcher_enabled:
            # Disable watcher
            if bpy.app.timers.is_registered(file_watcher_timer):
                bpy.app.timers.unregister(file_watcher_timer)
            scene.claude_file_watcher_enabled = False
            self.report({'INFO'}, "Auto-execute disabled")
        else:
            # Enable watcher
            if not bpy.app.timers.is_registered(file_watcher_timer):
                bpy.app.timers.register(file_watcher_timer)
            scene.claude_file_watcher_enabled = True
            paths = ", ".join(WATCH_FILES.values())
            self.report({'INFO'}, f"Auto-execute enabled. Watching: {paths}")
        
        return {'FINISHED'}


# Operator to lock/preserve current generated objects
class CLAUDE_OT_lock_generated(bpy.types.Operator):
    """Lock selected objects to prevent them from being deleted on next generation"""
    bl_idname = "claude.lock_generated"
    bl_label = "Lock Selected Objects"
    
    def execute(self, context):
        locked_count = 0
        
        for obj in context.selected_objects:
            # Add custom property to mark as locked
            obj["claude_locked"] = True
            locked_count += 1
        
        self.report({'INFO'}, f"Locked {locked_count} object(s). They won't be deleted on next generation.")
        return {'FINISHED'}


# Operator to unlock objects
class CLAUDE_OT_unlock_generated(bpy.types.Operator):
    """Unlock selected objects (allow deletion on next generation)"""
    bl_idname = "claude.unlock_generated"
    bl_label = "Unlock Selected Objects"
    
    def execute(self, context):
        unlocked_count = 0
        
        for obj in context.selected_objects:
            if "claude_locked" in obj:
                del obj["claude_locked"]
                unlocked_count += 1
        
        self.report({'INFO'}, f"Unlocked {unlocked_count} object(s)")
        return {'FINISHED'}


# Example Operator 3: Claude-Assisted Generation
class CLAUDE_OT_generate_from_prompt(bpy.types.Operator):
    """Generate geometry from text description using Claude"""
    bl_idname = "claude.generate_from_prompt"
    bl_label = "Generate from Prompt"
    bl_options = {'REGISTER', 'UNDO'}
    
    def execute(self, context):
        scene = context.scene
        prompt = scene.claude_prompt
        
        if not prompt:
            self.report({'ERROR'}, "Enter a description first")
            return {'CANCELLED'}
        
        # Store the prompt for Claude Desktop to use
        scene.claude_last_prompt = prompt
        scene.claude_waiting_for_code = True
        
        self.report({'INFO'}, f"Copy this to Claude Desktop: Generate Blender code for: {prompt}")
        
        # Copy prompt to clipboard would be nice but requires pyperclip
        # For now, user copies manually from the text field
        
        return {'FINISHED'}


# Operator to execute generated code
class CLAUDE_OT_execute_code(bpy.types.Operator):
    """Execute the Python code from Claude"""
    bl_idname = "claude.execute_code"
    bl_label = "Execute Code"
    bl_options = {'REGISTER', 'UNDO'}
    
    def execute(self, context):
        scene = context.scene
        code = scene.claude_generated_code
        
        if not code:
            self.report({'ERROR'}, "No code to execute. Paste code from Claude first.")
            return {'CANCELLED'}
        
        try:
            # Execute the code
            execute_blender_code(code, scene)
            
            self.report({'INFO'}, "Code executed successfully")
            scene.claude_waiting_for_code = False
            
        except Exception as e:
            self.report({'ERROR'}, f"Execution error: {str(e)}")
            scene.claude_last_error = str(e)
            return {'CANCELLED'}
        
        return {'FINISHED'}


class CLAUDE_OT_generate_with_openai(bpy.types.Operator):
    """Generate Blender code with OpenAI API and run it"""
    bl_idname = "claude.generate_with_openai"
    bl_label = "Generate with OpenAI"
    bl_options = {'REGISTER', 'UNDO'}
    
    def execute(self, context):
        scene = context.scene
        prompt = scene.claude_prompt.strip()
        # Prefer env var — Blender's UI text input truncates long keys (~127 chars)
        api_key = os.getenv("OPENAI_API_KEY", "").strip() or scene.claude_openai_api_key.strip()
        model = scene.claude_openai_model.strip()
        context_text = scene.claude_openai_context.strip()
        
        if not scene.claude_openai_enabled:
            self.report({'ERROR'}, "Enable OpenAI API mode first")
            return {'CANCELLED'}
        
        if not prompt:
            self.report({'ERROR'}, "Enter a prompt first")
            return {'CANCELLED'}
        
        if not api_key:
            self.report({'ERROR'}, "Enter your OpenAI API key")
            return {'CANCELLED'}
        
        if not model:
            self.report({'ERROR'}, "Enter a model name")
            return {'CANCELLED'}
        
        scene.claude_last_error = ""
        scene.claude_last_prompt = prompt
        
        try:
            request_body = {
                "model": model,
                "input": [
                    {
                        "role": "system",
                        "content": "You write executable Blender Python only. No markdown. No explanation. NEVER delete, remove, or overwrite existing objects or data. NEVER call bpy.ops.object.delete or bpy.data.objects.remove. Only CREATE new objects. Do not create or manage collections — objects will be organized automatically. Target Blender 5.0+ API: shader node inputs were renamed in 4.0 — use 'Factor' not 'Fac', 'Roughness' not 'Roughness ' (no trailing space), 'Base Color' not 'Color'. Principled BSDF inputs: use 'Base Color', 'Metallic', 'Roughness', 'IOR', 'Alpha'. Mix nodes: use 'Factor', 'A', 'B' (not 'Fac', 'Color1', 'Color2')."
                    },
                    {
                        "role": "user",
                        "content": build_openai_generate_prompt(prompt, context_text)
                    }
                ]
            }
            
            req = urllib.request.Request(
                "https://api.openai.com/v1/responses",
                data=json.dumps(request_body).encode("utf-8"),
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                },
                method="POST",
            )
            
            with urllib.request.urlopen(req, timeout=90) as response:
                payload = json.loads(response.read().decode("utf-8"))
            
            generated_text = extract_response_text(payload)
            code = strip_code_fences(generated_text)
            
            if not code:
                raise RuntimeError("Model returned empty output")
            
            scene.claude_generated_code = code
            openai_watch = WATCH_FILES["openai"]
            with open(openai_watch, "w", encoding="utf-8") as f:
                f.write(code)

            if scene.claude_file_watcher_enabled:
                self.report({'INFO'}, f"Code generated and written to {openai_watch}")
            else:
                execute_blender_code(code, scene, model_name=model)
                self.report({'INFO'}, "Code generated and executed successfully")
            
            scene.claude_waiting_for_code = False
            return {'FINISHED'}
        
        except urllib.error.HTTPError as e:
            try:
                detail = e.read().decode("utf-8")
            except Exception:
                detail = str(e)
            scene.claude_last_error = f"OpenAI API error ({e.code}): {detail}"
            self.report({'ERROR'}, f"OpenAI API error ({e.code})")
            return {'CANCELLED'}
        except Exception as e:
            scene.claude_last_error = f"OpenAI generation error: {str(e)}"
            self.report({'ERROR'}, "OpenAI generation failed")
            return {'CANCELLED'}


class CLAUDE_OT_paste_api_key(bpy.types.Operator):
    """Paste OpenAI API key from clipboard (bypasses text field length limit)"""
    bl_idname = "claude.paste_api_key"
    bl_label = "Paste API Key from Clipboard"

    def execute(self, context):
        key = context.window_manager.clipboard.strip()
        if not key:
            self.report({'ERROR'}, "Clipboard is empty")
            return {'CANCELLED'}
        if not key.startswith("sk-"):
            self.report({'ERROR'}, "Clipboard doesn't look like an OpenAI key (should start with sk-)")
            return {'CANCELLED'}
        context.scene.claude_openai_api_key = key
        self.report({'INFO'}, f"API key pasted ({len(key)} chars)")
        return {'FINISHED'}


# Example Operator 4: Array on Curve
class CLAUDE_OT_array_on_curve(bpy.types.Operator):
    """Distribute selected object along active curve"""
    bl_idname = "claude.array_on_curve"
    bl_label = "Array on Curve"
    bl_options = {'REGISTER', 'UNDO'}
    
    count: bpy.props.IntProperty(name="Count", default=10, min=2, max=100)
    
    def execute(self, context):
        if len(context.selected_objects) < 2:
            self.report({'ERROR'}, "Select object to array and a curve")
            return {'CANCELLED'}
        
        # This is a placeholder - would need proper curve evaluation
        self.report({'INFO'}, "Array on curve - implementation coming")
        return {'FINISHED'}


# UI Panel
class CLAUDE_PT_modeling_panel(bpy.types.Panel):
    """Creates a Panel in the 3D Viewport sidebar"""
    bl_label = "Claude Modeling Tools"
    bl_idname = "CLAUDE_PT_modeling_panel"
    bl_space_type = 'VIEW_3D'
    bl_region_type = 'UI'
    bl_category = 'Claude Tools'
    
    def draw(self, context):
        layout = self.layout
        scene = context.scene
        
        # File Watching section
        box = layout.box()
        box.label(text="Auto-Execute:", icon='FILE_REFRESH')
        
        row = box.row()
        if scene.claude_file_watcher_enabled:
            row.operator("claude.toggle_file_watcher", icon='PAUSE', text="Disable Auto-Execute")
            for source, path in WATCH_FILES.items():
                box.label(text=f"{source}: {path}", icon='CHECKMARK')
        else:
            row.operator("claude.toggle_file_watcher", icon='PLAY', text="Enable Auto-Execute")
            box.label(text="Enable to auto-run code from AI sources", icon='INFO')
        
        # Lock/Unlock section
        box2 = box.box()
        box2.label(text="Preserve Objects:", icon='LOCKED')
        row = box2.row(align=True)
        row.operator("claude.lock_generated", icon='LOCKED', text="Lock Selected")
        row.operator("claude.unlock_generated", icon='UNLOCKED', text="Unlock Selected")
        box2.label(text="Lock objects to prevent deletion", icon='INFO')
        
        layout.separator()
        
        # Claude AI Generation section (manual mode)
        box = layout.box()
        box.label(text="Manual Generation:", icon='CONSOLE')
        
        # Prompt input
        prompt_col = box.column()
        prompt_col.scale_y = 2.0
        prompt_col.prop(scene, "claude_prompt", text="")
        if scene.claude_openai_enabled:
            box.operator("claude.generate_with_openai", icon='URL', text="Generate with OpenAI")
        
        openai_box = box.box()
        openai_box.label(text="OpenAI API (Local):", icon='PREFERENCES')
        openai_box.prop(scene, "claude_openai_enabled", text="Enable OpenAI in Addon")
        
        if scene.claude_openai_enabled:
            if os.getenv("OPENAI_API_KEY"):
                openai_box.label(text="Using OPENAI_API_KEY from environment", icon='CHECKMARK')
            else:
                key = scene.claude_openai_api_key
                if key:
                    masked = key[:8] + "..." + key[-4:] + f"  ({len(key)} chars)"
                    openai_box.label(text=f"Key: {masked}", icon='LOCKED')
                openai_box.operator("claude.paste_api_key", icon='PASTEDOWN', text="Paste API Key from Clipboard")
            openai_box.prop(scene, "claude_openai_model", text="Model")
            openai_box.prop(scene, "claude_openai_context", text="Context")
            openai_box.label(text="Use prompt field above, then click Generate with OpenAI", icon='INFO')
        
        if scene.claude_waiting_for_code:
            box.label(text="Waiting for Claude...", icon='TIME')
            box.label(text="1. Copy prompt to Claude Desktop")
            box.label(text="2. Paste generated code below")
        
        # Code input area
        box.label(text="Generated Code:")
        box.prop(scene, "claude_generated_code", text="")
        box.operator("claude.execute_code", icon='PLAY', text="Execute Code")
        
        if scene.claude_last_error:
            error_box = box.box()
            error_box.alert = True
            row = error_box.row()
            row.label(text="Error occurred:", icon='ERROR')
            row.operator("claude.clear_error", text="", icon='X')
            
            # Show first line of error
            error_preview = scene.claude_last_error.split('\n')[0]
            if len(error_preview) > 60:
                error_preview = error_preview[:60] + "..."
            error_box.label(text=error_preview)
            
            # Button to show full error in text editor
            error_box.operator("claude.show_error", icon='TEXT', text="View Full Error (Copyable)")
        
        layout.separator()
        
        # Create section
        box = layout.box()
        box.label(text="Quick Create:", icon='ADD')
        box.operator("claude.create_parametric", icon='MESH_CYLINDER')
        
        # Modify section
        box = layout.box()
        box.label(text="Modify:", icon='MODIFIER')
        box.operator("claude.randomize_mesh", icon='RNDCURVE')
        
        # Advanced section
        box = layout.box()
        box.label(text="Advanced:", icon='NODETREE')
        box.operator("claude.array_on_curve", icon='CURVE_PATH')


# Scene properties for Claude integration
def register_properties():
    bpy.types.Scene.claude_file_watcher_enabled = bpy.props.BoolProperty(
        name="File Watcher Enabled",
        description="Auto-execute code when file changes",
        default=False
    )
    
    bpy.types.Scene.claude_prompt = bpy.props.StringProperty(
        name="Description",
        description="Describe what you want to create",
        default="Create a spiral staircase with 10 steps"
    )
    
    bpy.types.Scene.claude_generated_code = bpy.props.StringProperty(
        name="Code",
        description="Paste generated code from Claude here",
        default=""
    )
    
    bpy.types.Scene.claude_waiting_for_code = bpy.props.BoolProperty(
        name="Waiting",
        default=False
    )
    
    bpy.types.Scene.claude_last_prompt = bpy.props.StringProperty(
        name="Last Prompt",
        default=""
    )
    
    bpy.types.Scene.claude_last_error = bpy.props.StringProperty(
        name="Last Error",
        default=""
    )
    
    bpy.types.Scene.claude_openai_enabled = bpy.props.BoolProperty(
        name="Enable OpenAI",
        description="Use OpenAI API directly from Blender addon",
        default=False
    )
    
    bpy.types.Scene.claude_openai_api_key = bpy.props.StringProperty(
        name="OpenAI API Key",
        description="OpenAI API key (stored in scene)",
        default=os.getenv("OPENAI_API_KEY", ""),
    )
    
    bpy.types.Scene.claude_openai_model = bpy.props.EnumProperty(
        name="Model",
        description="OpenAI model to use",
        items=[
            ("gpt-4.1-nano", "GPT-4.1 Nano", "Fastest, cheapest"),
            ("gpt-4.1-mini", "GPT-4.1 Mini", "Fast and affordable"),
            ("gpt-4.1", "GPT-4.1", "Flagship model"),
            ("o4-mini", "o4-mini", "Reasoning, affordable"),
            ("o3", "o3", "Reasoning, powerful"),
        ],
        default="gpt-4.1-mini"
    )
    
    bpy.types.Scene.claude_openai_context = bpy.props.StringProperty(
        name="Context",
        description="Optional scene constraints/context",
        default=""
    )


def unregister_properties():
    del bpy.types.Scene.claude_file_watcher_enabled
    del bpy.types.Scene.claude_prompt
    del bpy.types.Scene.claude_generated_code
    del bpy.types.Scene.claude_waiting_for_code
    del bpy.types.Scene.claude_last_prompt
    del bpy.types.Scene.claude_last_error
    del bpy.types.Scene.claude_openai_enabled
    del bpy.types.Scene.claude_openai_api_key
    del bpy.types.Scene.claude_openai_model
    del bpy.types.Scene.claude_openai_context


# Registration
classes = (
    CLAUDE_OT_create_parametric,
    CLAUDE_OT_randomize_mesh,
    CLAUDE_OT_toggle_file_watcher,
    CLAUDE_OT_lock_generated,
    CLAUDE_OT_unlock_generated,
    CLAUDE_OT_clear_error,
    CLAUDE_OT_show_error,
    CLAUDE_OT_generate_from_prompt,
    CLAUDE_OT_execute_code,
    CLAUDE_OT_generate_with_openai,
    CLAUDE_OT_paste_api_key,
    CLAUDE_OT_array_on_curve,
    CLAUDE_PT_modeling_panel,
)

def register():
    for cls in classes:
        bpy.utils.register_class(cls)
    register_properties()

def unregister():
    # Stop file watcher if running
    if bpy.app.timers.is_registered(file_watcher_timer):
        bpy.app.timers.unregister(file_watcher_timer)
    
    unregister_properties()
    for cls in reversed(classes):
        bpy.utils.unregister_class(cls)

if __name__ == "__main__":
    register()
