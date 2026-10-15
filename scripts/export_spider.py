"""Run: blender --background --python scripts/export_spider.py

Re-exports only the original spider, adding non-destructive procedural gait
pivots in memory. Does not save changes to the source .blend.
"""
from pathlib import Path
import bpy
from mathutils import Vector

repo = Path(__file__).resolve().parents[1]
source = repo / 'assets/source/spider_anatomy_lowpoly.blend'
output = repo / 'public/models/spider.glb'
bpy.ops.wm.open_mainfile(filepath=str(source))
root = bpy.data.objects['Spider_Anatomy']
meshes = [obj for obj in root.children_recursive if obj.type == 'MESH']
assert len(meshes) == 121, f'Unexpected source mesh count: {len(meshes)}'
original_vertices = {obj.name: [obj.matrix_world @ vertex.co for vertex in obj.data.vertices] for obj in meshes}

for side in ('L', 'R'):
    for number in range(1, 5):
        key = f'{side}{number}'
        coxa = bpy.data.objects[f'Leg_{key}_1_Coxa']
        # This mesh stores its proximal and distal four-vertex rings in order.
        hip = sum((coxa.matrix_world @ vertex.co for vertex in list(coxa.data.vertices)[:4]), Vector()) / 4
        pivot = bpy.data.objects.new(f'Gait_{key}', None)
        root.users_collection[0].objects.link(pivot)
        pivot.parent = root
        pivot.matrix_world.translation = hip
        bpy.context.view_layer.update()
        for obj in meshes:
            if obj.name.startswith((f'Leg_{key}_', f'Claw_{key}_')):
                world = obj.matrix_world.copy()
                obj.parent = pivot
                obj.matrix_world = world

bpy.context.view_layer.update()
for obj in meshes:
    assert all((obj.matrix_world @ v.co - p).length < 1e-5 for v, p in zip(obj.data.vertices, original_vertices[obj.name])), obj.name

floor = min(point.z for points in original_vertices.values() for point in points)
root.location.z -= floor
bpy.context.view_layer.update()
bpy.ops.object.select_all(action='DESELECT')
for obj in [root, *root.children_recursive]:
    obj.hide_set(False)
    obj.select_set(True)
output.parent.mkdir(parents=True, exist_ok=True)
bpy.ops.export_scene.gltf(filepath=str(output), export_format='GLB', use_selection=True,
                          export_yup=True, export_animations=False, export_materials='EXPORT')
print(f'EXPORTED {len(meshes)} original meshes and 8 gait pivots to {output}')
