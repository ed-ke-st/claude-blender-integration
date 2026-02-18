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


# File watching globals
WATCH_FILE_PATH = "/tmp/blender_auto_execute.py"
last_modified_time = 0


def check_and_execute_file():
    """Check if the watched file has been modified and execute it"""
    global last_modified_time
    
    if not os.path.exists(WATCH_FILE_PATH):
        return 0.5  # Check every 0.5 seconds
    
    try:
        current_modified_time = os.path.getmtime(WATCH_FILE_PATH)
        
        if current_modified_time > last_modified_time:
            last_modified_time = current_modified_time
            
            # Read and execute the file
            with open(WATCH_FILE_PATH, 'r') as f:
                code = f.read()
            
            if code.strip():  # Only execute if file has content
                try:
                    exec(code, {"bpy": bpy, "bmesh": bmesh, "Vector": Vector, 
                               "math": math, "random": random})
                    print(f"✓ Auto-executed code from {WATCH_FILE_PATH}")
                except Exception as e:
                    print(f"✗ Auto-execution error: {str(e)}")
                    # Store error in scene for UI display
                    if hasattr(bpy.context.scene, 'claude_last_error'):
                        bpy.context.scene.claude_last_error = str(e)
    
    except Exception as e:
        print(f"File watcher error: {str(e)}")
    
    return 0.5  # Continue checking every 0.5 seconds


# Timer function
def file_watcher_timer():
    return check_and_execute_file()


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
            self.report({'INFO'}, f"Auto-execute enabled. Watching: {WATCH_FILE_PATH}")
        
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
            exec(code, {"bpy": bpy, "bmesh": bmesh, "Vector": Vector, 
                       "math": math, "random": random})
            
            self.report({'INFO'}, "Code executed successfully")
            scene.claude_waiting_for_code = False
            
        except Exception as e:
            self.report({'ERROR'}, f"Execution error: {str(e)}")
            scene.claude_last_error = str(e)
            return {'CANCELLED'}
        
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
            box.label(text=f"Watching: {WATCH_FILE_PATH}", icon='CHECKMARK')
            box.label(text="Ask Claude in claude.ai to generate code!")
        else:
            row.operator("claude.toggle_file_watcher", icon='PLAY', text="Enable Auto-Execute")
            box.label(text="Enable to auto-run code from Claude", icon='INFO')
        
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
        box.prop(scene, "claude_prompt", text="")
        box.operator("claude.generate_from_prompt", icon='PLAY', text="Request Code")
        
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


def unregister_properties():
    del bpy.types.Scene.claude_file_watcher_enabled
    del bpy.types.Scene.claude_prompt
    del bpy.types.Scene.claude_generated_code
    del bpy.types.Scene.claude_waiting_for_code
    del bpy.types.Scene.claude_last_prompt
    del bpy.types.Scene.claude_last_error


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
