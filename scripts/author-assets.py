"""Author the original runtime models. Run with Blender --background --python."""
import math
import random
import json
import sys
from pathlib import Path
import bpy
from mathutils import Vector
sys.path.insert(0, str(Path(__file__).resolve().parent))
from zombie_motion import apply_pose, clips, CONTACT_FRAME, LEAD

OUT = Path(__file__).resolve().parent.parent / "assets" / "art"
OUT.mkdir(parents=True, exist_ok=True)
RNG = random.Random(1308)
RIG_DATA = {}


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def material(name, rgb, rough=.72, metal=0):
    m = bpy.data.materials.new(name)
    m.diffuse_color = (*rgb, 1)
    m.use_nodes = True
    bsdf = m.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (*rgb, 1)
    bsdf.inputs["Metallic"].default_value = metal
    bsdf.inputs["Roughness"].default_value = rough
    return m


def decorate(obj, name, mat, parent=None):
    obj.name = name
    obj.data.materials.append(mat)
    if parent:
        obj.parent = parent
    return obj


def empty(name, where=(0, 0, 0)):
    obj = bpy.data.objects.new(name, None)
    bpy.context.collection.objects.link(obj)
    obj.location = where
    return obj


def bevel(obj, width):
    if width <= 0:
        return
    mod = obj.modifiers.new("Machined edges", "BEVEL")
    mod.width = width
    mod.segments = 1
    mod.affect = "EDGES"
    normals = obj.modifiers.new("Face normals", "WEIGHTED_NORMAL")
    normals.keep_sharp = True


def block(name, where, dims, mat, bevel_size=.002, parent=None, twist=0):
    bpy.ops.mesh.primitive_cube_add(size=1, location=where)
    obj = bpy.context.object
    obj.scale = dims
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.rotation_euler.x = twist
    bevel(obj, bevel_size)
    return decorate(obj, name, mat, parent)


def tube(name, where, radius, depth, mat, parent=None, axis="y", sides=14, tip=None):
    bpy.ops.mesh.primitive_cone_add(vertices=sides, radius1=radius,
                                   radius2=radius if tip is None else tip, depth=depth, location=where)
    obj = bpy.context.object
    if axis == "y":
        obj.rotation_euler.x = -math.pi / 2
    if axis == "x":
        obj.rotation_euler.y = math.pi / 2
    for face in obj.data.polygons:
        face.use_smooth = len(face.vertices) == 4
    return decorate(obj, name, mat, parent)


def profile(name, points, width, mat, parent=None, edge=.002):
    count = len(points)
    verts = [(sign * width / 2, y, z) for sign in [-1, 1] for y, z in points]
    faces = [tuple(range(count - 1, -1, -1)), tuple(range(count, count * 2))]
    faces += [(i, (i + 1) % count, (i + 1) % count + count, i + count) for i in range(count)]
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(verts, [], faces)
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.mesh.normals_make_consistent(inside=False)
    bpy.ops.object.mode_set(mode="OBJECT")
    obj.select_set(False)
    bevel(obj, edge)
    return decorate(obj, name, mat, parent)


def merge_static_materials():
    # Export weapon and landmark pieces as one mesh per material and moving assembly.
    by_key = {}
    for obj in list(bpy.context.scene.objects):
        if obj.type == "MESH":
            by_key.setdefault((obj.parent, obj.active_material), []).append(obj)
    for (_, mat), pieces in by_key.items():
        bpy.ops.object.select_all(action="DESELECT")
        for piece in pieces:
            piece.select_set(True)
            bpy.context.view_layer.objects.active = piece
            for mod in list(piece.modifiers):
                bpy.ops.object.modifier_apply(modifier=mod.name)
        if len(pieces) > 1:
            bpy.ops.object.join()
        bpy.context.object.name = mat.name
    bpy.ops.object.select_all(action="DESELECT")


def export(name, anim=False):
    bpy.ops.export_scene.gltf(filepath=str(OUT / (name + ".glb")), export_format="GLB",
                             export_animations=anim, export_animation_mode="NLA_TRACKS",
                             export_leaf_bone=False, export_apply=True)


def hardware(kind):
    reset()
    steel = material("Parkerized steel", (.127, .145, .15), .39, .7)
    edge = material("Worn steel", (.25, .27, .275), .35, .76)
    polymer = material("Weathered polymer", (.061, .065, .053), .77)
    carbon = material("Black rubber", (.021, .023, .021))
    wood = material("Oiled walnut", (.22, .096, .043), .68)
    ivory = material("Sight inserts", (.72, .70, .48))
    brass = material("Brass", (.47, .28, .074), .32, .65)
    red = material("Painted index mark", (.48, .086, .028))
    lens = material("Light reflector", (.6, .72, .72), .21, .71)
    root = empty("Housing")
    muzzle = .157
    if kind == "pistol":
        grip = [(-.066, .036), (-.060, -.087), (-.017, -.094), (.012, .026),
                (.139, .038), (.155, .069), (-.077, .069)]
        profile("Grip and dust cover", grip, .038, polymer, root, .005)
        slide = empty("Slide")
        profile("Slide steel", [(-.082, .063), (-.081, .093), (-.065, .105), (.14, .105), (.159, .09),
                                (.154, .064)], .039, steel, slide, .004)
        for sign in [-1, 1]:
            for i in range(7):
                block("Charging serration", (sign * .020, -.071 + .006 * i, .079),
                      (.002, .0025, .021), edge if i % 2 else carbon, .0005, slide, -.16)
            for i in range(6):
                block("Grip ridges", (sign * .019, -.037 + i * .002, -.065 + i * .013),
                      (.003, .036, .002), carbon, .0005, root, -.10)
        block("Ejection port", (.0188, .032, .088), (.006, .053, .019), carbon, .002, slide)
        block("Extractor", (.0205, .032, .091), (.002, .020, .004), edge, .0006, slide)
        block("Rear sight", (0, -.058, .109), (.031, .016, .008), carbon, .001, slide)
        block("Front sight", (0, .124, .109), (.007, .014, .007), edge, .0007, slide)
        block("Front notch", (0, .120, .113), (.0035, .003, .0025), ivory, .0002, slide)
        for sign in [-1, 1]:
            block("Rear notch", (sign * .011, -.066, .108), (.003, .002, .004), ivory, .0004, slide)
        tube("Barrel crown", (0, .155, .081), .0107, .011, edge, root)
        tube("Dark bore", (0, .161, .081), .0074, .001, carbon, root)
        block("Guard lower", (0, .061, .008), (.023, .070, .008), polymer, .0024, root)
        block("Guard nose", (0, .093, .023), (.025, .010, .032), polymer, .0024, root, -.22)
        block("Trigger", (0, .047, .031), (.008, .012, .027), edge, .001, root, -.36)
        mag = empty("Magazine")
        block("Mag body", (0, -.035, -.060), (.028, .030, .052), steel, .002, mag, -.14)
        block("Mag base plate", (0, -.041, -.092), (.038, .048, .008), carbon, .002, mag, -.14)
        muzzle, muzzle_y = .163, .081
    elif kind == "shotgun":
        profile("Stock", [(-.43, .031), (-.42, -.092), (-.35, -.106), (-.16, -.016), (-.046, -.010),
                          (-.052, .064), (-.23, .063)], .058, wood, root, .012)
        block("Butt plate", (0, -.428, -.028), (.060, .020, .123), carbon, .006, root, -.08)
        block("Receiver", (0, .097, .040), (.059, .293, .075), steel, .008, root)
        block("Loading gate", (0, .152, .006), (.028, .114, .009), edge, .003, root)
        block("Ejection port", (.028, .118, .045), (.009, .099, .035), carbon, .005, root)
        block("Guard", (0, .016, -.016), (.030, .071, .012), steel, .003, root)
        block("Trigger", (0, .021, -.004), (.009, .016, .038), edge, .002, root, -.36)
        tube("Barrel", (0, .429, .071), .018, .56, steel, root)
        tube("Magazine tube", (0, .383, .021), .019, .42, edge, root)
        tube("Mag cap", (0, .591, .021), .023, .032, steel, root)
        pump = empty("Pump")
        profile("Pump forend", [(.242, -.008), (.277, -.031), (.465, -.027), (.506, .003), (.501, .045),
                              (.260, .048)], .080, wood, pump, .008)
        for i in range(10):
            block("Forend collar", (0, .270 + i * .021, -.013), (.076, .0035, .037),
                  carbon if i % 2 else steel, .001, pump)
        for i in range(4):
            block("Ventilated rib", (0, .313 + .108 * i, .093), (.010, .092, .009), steel, .001, root)
        tube("Crown", (0, .709, .071), .020, .022, edge, root)
        tube("Bore", (0, .721, .071), .016, .002, carbon, root)
        tube("Bead sight", (0, .685, .103), .0038, .013, brass, root, "z", 8)
        mag = empty("Magazine")
        tube("Shell body", (0, .132, -.024), .011, .045, red, mag)
        tube("Shell base", (0, .104, -.024), .0115, .010, brass, mag)
        muzzle, muzzle_y = .723, .071
    elif kind == "smg":
        block("Stamped receiver", (0, .068, .055), (.066, .301, .078), steel, .006, root)
        block("Magazine housing", (0, .073, -.002), (.054, .080, .050), polymer, .003, root)
        block("Front shroud", (0, .254, .050), (.058, .105, .066), carbon, .006, root)
        tube("Barrel", (0, .324, .060), .0125, .123, edge, root)
        tube("Muzzle device", (0, .392, .060), .019, .036, steel, root)
        tube("Bore", (0, .411, .060), .011, .002, carbon, root)
        profile("Pistol grip", [(-.062, .028), (-.111, -.071), (-.066, -.097), (-.015, -.005),
                               (.005, .026)], .038, polymer, root, .006)
        block("Trigger guard", (0, .015, -.007), (.025, .066, .010), polymer, .002, root)
        block("Trigger", (0, -.004, .006), (.008, .016, .029), edge, .001, root, -.30)
        for side in [-1, 1]:
            block("Stock rail", (side * .026, -.207, .052), (.011, .232, .012), edge, .0018, root, .04)
            for i in range(5):
                block("Cooling slot", (side * .030, .218 + i*.013, .061), (.003, .008, .020), steel, .001, root)
        profile("Shoulder plate", [(-.31, .063), (-.326, -.058), (-.289, -.062), (-.273, .054)],
                .051, carbon, root, .008)
        block("Raised top rail", (0, .056, .101), (.026, .248, .014), carbon, .002, root)
        for i in range(12):
            block("Rail tooth", (0, -.052 + .019 * i, .110), (.030, .012, .005), edge, .0009, root)
        for y in [-.063, .226]:
            block("Sight pedestal", (0, y, .118), (.022, .018, .020), steel, .002, root)
            block("Sight point", (0, y, .129), (.006, .009, .006), ivory, .001, root)
        slide = empty("Slide")
        block("Bolt", (.030, .070, .059), (.008, .101, .020), carbon, .003, slide)
        block("Charging lever", (.039, .092, .077), (.020, .026, .012), edge, .002, slide)
        mag = empty("Magazine")
        profile("Deep magazine", [(.040, .015), (.032, -.112), (.002, -.201), (.060, -.199), (.095, -.085),
                                  (.103, .013)], .038, steel, mag, .004)
        block("Mag floor plate", (0, .035, -.200), (.046, .070, .014), carbon, .003, mag, .08)
        muzzle, muzzle_y = .414, .060
    elif kind == "carbine":
        profile("Fixed walnut stock", [(-.355, .046), (-.359, -.072), (-.299, -.082),
                (-.114, -.005), (-.098, .057), (-.233, .052)], .058, wood, root, .011)
        block("Rubber butt plate", (0, -.354, -.014), (.062, .016, .123), carbon, .005, root, -.045)
        block("Forged upper", (0, .058, .055), (.052, .284, .077), steel, .005, root)
        block("Lower receiver", (0, .051, .009), (.047, .223, .032), edge, .004, root)
        block("Ejection recess", (.026, .097, .060), (.005, .086, .025), carbon, .002, root)
        profile("Checkered pistol grip", [(-.076, .019), (-.117, -.076), (-.079, -.096),
                (-.030, .008)], .035, wood, root, .006)
        block("Trigger guard", (0, .006, -.022), (.024, .085, .010), steel, .004, root)
        block("Trigger", (0, -.018, -.002), (.008, .015, .036), edge, .001, root, -.30)
        profile("Tapered handguard", [(.165, .083), (.382, .077), (.409, .049),
                (.392, .004), (.184, -.008), (.158, .022)], .060, wood, root, .007)
        for side in [-1, 1]:
            for i in range(6):
                block("Handguard grooves", (side * .030, .199 + i * .029, .055),
                      (.002, .014, .006), carbon, .001, root)
        block("Angled foregrip", (0, .284, -.025), (.034, .081, .042), polymer, .009, root, -.23)
        tube("Free barrel", (0, .448, .063), .011, .215, steel, root)
        tube("Crown", (0, .554, .063), .016, .031, edge, root)
        tube("Bore", (0, .570, .063), .009, .002, carbon, root)
        block("Rear sight base", (0, -.066, .099), (.030, .025, .012), carbon, .003, root)
        for side in [-1, 1]:
            block("Rear sight ears", (side * .009, -.068, .113), (.009, .017, .020), steel, .002, root)
            block("Rear sight line", (side * .006, -.077, .117), (.003, .002, .004), ivory, .0005, root)
            block("Front sight ears", (side * .009, .409, .100), (.005, .025, .023), steel, .002, root)
        block("Front sight post", (0, .409, .104), (.005, .009, .029), edge, .001, root)
        block("Front sight insert", (0, .404, .117), (.003, .003, .005), ivory, .0005, root)
        slide = empty("Slide")
        block("Bolt", (.027, .088, .060), (.005, .063, .016), edge, .002, slide)
        block("Charging handle", (.037, .073, .061), (.023, .018, .013), steel, .002, slide)
        mag = empty("Magazine")
        profile("Box magazine", [(.025, .007), (.027, -.125), (.088, -.121),
                (.100, -.093), (.093, .007)], .036, steel, mag, .004)
        for side in [-1, 1]:
            block("Magazine rib", (side * .018, .059, -.058), (.002, .009, .095), edge, .001, mag, -.14)
        block("Magazine floor plate", (0, .056, -.121), (.041, .067, .009), carbon, .002, mag)
        muzzle, muzzle_y = .572, .063
    elif kind == "flaregun":
        orange = material("Weathered rescue orange", (.71, .16, .038), .79)
        profile("Grip shell", [(-.082, .046), (-.089, -.008), (-.111, -.084),
                (-.068, -.101), (-.034, -.097), (-.008, .020), (.100, .033), (.093, .052)],
                .045, orange, root, .007)
        profile("Rubber backstrap", [(-.088, .014), (-.111, -.076), (-.100, -.086),
                (-.092, -.079), (-.075, -.002)], .037, carbon, root, .004)
        for side in [-1, 1]:
            for i in range(5):
                block("Molded grip ribs", (side * .022, -.060 - i * .004, -.027 - i * .013),
                      (.004, .041, .006), polymer, .0015, root, -.16)
        block("Receiver saddle", (0, -.023, .062), (.047, .100, .036), steel, .004, root)
        block("Guard base", (0, .050, -.010), (.029, .084, .011), orange, .004, root)
        block("Guard front", (0, .091, .014), (.029, .012, .050), orange, .004, root, -.10)
        block("Trigger", (0, .023, .016), (.009, .010, .027), steel, .002, root, -.26)
        breech = empty("Breech", (0, .067, .045))
        breech.parent = root
        tube("Signal barrel", (0, .007, .038), .024, .182, orange, breech, sides=16)
        tube("Chamber band", (0, -.072, .038), .025, .021, steel, breech, sides=16)
        tube("Muzzle band", (0, .092, .038), .025, .022, steel, breech, sides=16)
        tube("Muzzle recess", (0, .104, .038), .017, .002, carbon, breech, sides=16)
        tube("Wear ring", (0, .106, .038), .025, .003, edge, breech, sides=16)
        tube("Recessed bore", (0, .108, .038), .018, .002, carbon, breech, sides=16)
        block("Front bead", (0, .076, .064), (.007, .009, .006), ivory, .001, breech)
        block("Rear sight", (0, -.068, .096), (.027, .013, .007), steel, .001, root)
        block("Break lever", (.026, -.043, .071), (.011, .030, .009), polymer, .002, root)
        muzzle, muzzle_y = .178, .083
    else:
        tube("Body", (0, .034, .020), .029, .196, polymer, root, sides=12)
        tube("Tail cap", (0, -.078, .020), .030, .019, carbon, root, sides=10)
        tube("Bell", (0, .132, .020), .028, .057, steel, root, sides=12, tip=.043)
        tube("Castellated ring", (0, .162, .020), .044, .018, carbon, root, sides=12)
        tube("Reflector", (0, .172, .020), .036, .003, lens, root)
        tube("Emitter", (0, .174, .020), .010, .001, ivory, root)
        for i in range(9):
            tube("Grip bands", (0, -.060 + .016*i, .020), .0305, .003, steel, root, sides=12)
        block("Rubber switch", (0, .086, .049), (.023, .029, .010), carbon, .003, root)
        block("Battery indicator", (0, .060, .050), (.006, .009, .002), red, .001, root)
        muzzle, muzzle_y = .175, .020
    palm = {
        "pistol": (0, -.037, -.020),
        "shotgun": (0, -.086, -.022),
        "smg": (0, -.075, -.033),
        "carbine": (0, -.079, -.028),
        "flaregun": (0, -.058, -.031),
        "flashlight": (0, -.011, -.008),
    }[kind]
    empty("GripSocket", palm).parent = root
    empty("MuzzleSocket", (0, muzzle, muzzle_y)).parent = root
    support = {
        "pistol": (.032, -.022, -.045),
        "shotgun": (.047, .350, -.025),
        "smg": (.042, .231, .012),
        "carbine": (.043, .275, -.024),
        "flaregun": (.034, -.044, -.055),
    }.get(kind)
    if support:
        empty("SupportSocket", support).parent = root
    merge_static_materials()
    export(kind)


def glove():
    reset()
    textile = material("Oilskin cuff", (.093, .111, .091))
    leather = material("Weathered leather", (.066, .064, .054))
    seam = material("Knuckle stitching", (.145, .132, .095))
    root = empty("Grip")
    block("Palm", (0, -.040, -.040), (.066, .069, .078), leather, .019, root, .14)
    block("Cuff", (0, -.092, -.059), (.078, .075, .086), textile, .018, root, -.22)
    for i in range(3):
        z = -.023 - i * .019
        block("Wrapped fingers", (-.029, -.004, z), (.027, .040 - i*.003, .016), leather, .007, root, -.15)
        block("Finger seam", (-.037, -.019, z), (.011, .006, .012), seam, .002, root)
    block("Trigger finger", (-.033, .011, .005), (.024, .066, .017), leather, .007, root, -.16)
    block("Trigger fingertip", (-.023, .044, -.002), (.028, .023, .016), leather, .007, root, -.31)
    block("Thumb", (.026, -.019, -.015), (.026, .050, .028), leather, .009, root, -.28)
    for i in range(3):
        block("Palm rib", (.036, -.054+i*.013, -.056), (.005, .005, .050), seam, .001, root)
    empty("GloveSocket", (0, -.031, -.035)).parent = root
    merge_static_materials()
    export("glove")


def wreck():
    reset()
    root = empty("Abandoned utility truck")
    paint = material("Oxidized forest service enamel", (.098, .170, .135), .88, .10)
    rust = material("Bare rust", (.271, .085, .032))
    dark = material("Rubber and voids", (.021, .022, .021))
    glass = material("Grimy blue glass", (.11, .175, .180), .23, .12)
    trim = material("Scuffed chrome", (.28, .28, .238), .48, .7)
    tail = material("Cracked tail lens", (.46, .068, .029))
    lamp = material("Clouded headlamp", (.54, .48, .32), .32)
    profile("Truck fenders", [(-1.87, .39), (-1.87, .81), (-1.49, .96), (-.45, .99), (-.37, 1.05),
                            (1.66, 1.01), (1.87, .78), (1.86, .38), (1.36, .34), (1.31, .72),
                            (.57, .71), (.49, .35), (-.81, .33), (-.91, .66), (-1.46, .65),
                            (-1.50, .34)], 1.80, paint, root, .067)
    profile("Cab shell", [(-.76, .78), (-.56, 1.45), (.42, 1.43), (.87, .86)], 1.66, paint, root, .053)
    for x in [-.854, .854]:
        for y in [-1.16, 1.00]:
            tube("All terrain tire", (x, y, .38), .365, .23, dark, root, "x", 17)
            tube("Steel wheels", (x * 1.151, y, .38), .21, .026, trim, root, "x", 12)
            tube("Hubs", (x * 1.171, y, .38), .08, .026, rust, root, "x", 10)
        block("Side window", (x * .969, .025, 1.184), (.025, .875, .34), glass, .061, root)
        block("Door line", (x * 1.058, .25, .78), (.017, .017, .35), dark, .001, root)
        block("Door handle", (x * 1.068, .26, .89), (.037, .16, .037), trim, .008, root)
        for _ in range(9):
            block("Rust along rocker", (x * 1.054, RNG.uniform(-1.48,1.48), RNG.uniform(.47,.55)),
                  (.017, RNG.uniform(.06,.38), .058), rust, .008, root)
    block("Windscreen", (0, -.656, 1.212), (1.52, .06, .53), glass, .046, root, -.27)
    block("Rear glass", (0, .628, 1.16), (1.48, .065, .358), glass, .039, root, .54)
    block("Bent front bumper", (0, -1.87, .44), (1.88, .14, .13), trim, .035, root, .09)
    block("Rear bumper", (0, 1.845, .44), (1.844, .15, .14), dark, .027, root)
    for x in [-.64, .64]:
        block("Dead headlights", (x, -1.84, .69), (.29,.079,.177), lamp, .012, root)
        block("Tail lamps", (x, 1.847, .668), (.22,.057,.216), tail, .021, root)
    for z in [.57, .61, .65, .69, .73]:
        block("Grille", (0, -1.85, z), (.90,.054,.015), dark, .004, root)
    merge_static_materials()
    export("wreck")


def organic(name, where, scale, mat, jitter=.07, jaw=False):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=10, ring_count=7, radius=1, location=where)
    obj = bpy.context.object
    for v in obj.data.vertices:
        tilt = 1 + RNG.uniform(-jitter, jitter)
        if jaw and v.co.z < -.25:
            v.co.x *= .72
        for axis in range(3):
            v.co[axis] *= tilt * scale[axis]
    for face in obj.data.polygons:
        face.use_smooth = True
    return decorate(obj, name, mat)


def zombie(kind, alternate=False):
    reset()
    height, width = {"shambler": (1.77, 1), "shrieker": (1.66, .82), "brute": (2.0, 1.32)}[kind]
    s = height / 1.77
    pal = {
        "shambler": ((.13,.151,.116), (.025,.045,.063), (.029,.035,.031)),
        "shrieker": ((.18,.142,.112), (.091,.037,.023), (.031,.030,.024)),
        "brute": ((.153,.167,.115), (.089,.107,.051), (.027,.032,.018)),
    }[kind]
    if alternate:
        pal = {
            "shambler": ((.159,.129,.099), (.30,.144,.037), (.045,.064,.073)),
            "shrieker": ((.133,.172,.142), (.077,.087,.103), (.057,.036,.048)),
            "brute": ((.168,.125,.102), (.097,.051,.037), (.055,.046,.038)),
        }[kind]
    skin = material("Discoloured skin", pal[0])
    cloth = material("Weathered coat", pal[1])
    trousers = material("Trousers", pal[2])
    tear = material("Ripped fabric", (.019,.017,.016))
    inner = material("Cloth seams", (.051,.047,.035))
    leather = material("Boots and straps", (.020,.017,.011))
    bone = material("Teeth", (.196,.182,.115))
    flesh = material("Scarred skin", (.105,.039,.028))
    socket = material("Deep eyes and mouth", (.012,.008,.006))
    eye = material("Milky sclera", (.121,.124,.100))
    color = material("Zombie vertex colors", (.5,.5,.5), .82)
    node = color.node_tree.nodes.new("ShaderNodeVertexColor")
    node.layer_name = "Tint"
    color.node_tree.links.new(node.outputs["Color"], color.node_tree.nodes.get("Principled BSDF").inputs["Base Color"])
    weights = {}

    def part(name, location, size, mat, joint, shape=False):
        pos = (location[0] * width, location[1] * s, location[2] * s)
        scales = (size[0] * width, size[1] * s, size[2] * s)
        obj = organic(name, pos, scales, mat, .08, shape)
        weights[obj] = [joint]
        return obj

    def connected(name, rings, mat, joints):
        vertices = []
        sides = 10
        for (x,y,z,rx,ry,blend) in rings:
            for i in range(sides):
                a = math.tau*i/sides
                vertices.append(((x+rx*math.cos(a))*width,(y+ry*math.sin(a))*s,z*s))
        faces = [tuple(reversed(range(sides)))]
        for row in range(len(rings)-1):
            for i in range(sides):
                j, k = row*sides+i, row*sides+(i+1)%sides
                faces.append((j,k,k+sides,j+sides))
        faces.append(tuple(range(len(vertices)-sides, len(vertices))))
        if rings[0][2] > rings[-1][2]:
            faces = [tuple(reversed(face)) for face in faces]
        mesh = bpy.data.meshes.new(name)
        mesh.from_pydata(vertices, [], faces)
        mesh.update()
        obj = bpy.data.objects.new(name, mesh)
        bpy.context.collection.objects.link(obj)
        obj.data.materials.append(mat)
        for face in mesh.polygons:
            face.use_smooth = True
        weights[obj] = list(joints)
        groups = [obj.vertex_groups.new(name=joint) for joint in joints]
        for i, ring in enumerate(rings):
            ids = list(range(i*sides, (i+1)*sides))
            blend = ring[-1]
            if blend < 0:
                groups[0].add(ids, -blend, "REPLACE")
                groups[1].add(ids, 1+blend, "REPLACE")
            else:
                groups[-2].add(ids, 1-blend, "REPLACE")
                groups[-1].add(ids, blend, "REPLACE")
        return obj

    coat = [(0,.026,.79,.188,.118,0),(0,.032,.89,.224,.15,0),
               (0,.015,1.00,.193,.132,.19),(0,-.003,1.08,.183,.135,.61),
               (0,-.025,1.21,.216,.148,1),(0,-.023,1.32,.243,.131,1),
               (0,-.023,1.395,.154,.097,1),(0,-.045,1.424,.078,.064,1)]
    if kind == "shrieker":
        coat = [(x,y,z,rx*.88,ry*.81,blend) for x,y,z,rx,ry,blend in coat]
        coat[0] = (.045,.03,.88,.15,.088,0)
        coat[5] = (0,-.011,1.325,.235,.107,1)
    elif kind == "brute":
        coat = [(x,y,z,rx*(.96 if z<1.08 else 1.15),ry*1.13,blend) for x,y,z,rx,ry,blend in coat]
    elif not alternate:
        coat[0] = (-.042,.027,.72,.222,.115,0)
    connected("Clothing", coat, cloth, ("Hips","Spine"))
    if kind == "shambler" and not alternate:
        part("Lapel L", (-.082,-.155,1.248), (.063,.025,.175), inner, "Spine").rotation_euler.y = -.24
        part("Lapel R", (.072,-.168,1.251), (.040,.019,.192), tear, "Spine").rotation_euler.y = .18
    part("Neck", (0,-.058,1.444), (.082,.084,.113), skin, "Neck")
    head_y = -.065 if kind != "shrieker" else -.16
    skull = {"shambler": (.113,.110,.143), "shrieker": (.098,.115,.148), "brute": (.122,.110,.135)}[kind]
    if alternate:
        skull = (skull[0]*1.06, skull[1], skull[2]*.96)
    part("Skull", (0,head_y,1.615), skull, skin, "Head", True)
    part("Jaw", (.007,head_y-.032,1.535), (.079,.083,.052), flesh, "Jaw")
    part("Mouth", (.011,head_y-.105,1.558), (.062,.020,.031 if kind == "shrieker" else .020), socket, "Head")
    part("Teeth", (.012,head_y-.120,1.572), (.040,.008,.008), bone, "Head")
    part("Lower teeth", (.012,head_y-.119,1.536), (.038,.009,.007), bone, "Jaw")
    part("Nose", (.002,head_y-.113,1.614), (.020,.030,.036), skin, "Head")
    part("Torn cheek", (.063,head_y-.088,1.583), (.029,.021,.035), flesh, "Head")
    part("Bruised temple", (-.085,head_y-.030,1.646), (.030,.050,.039), inner, "Head")
    part("Open collar", (-.043,-.081,1.394), (.077,.060,.055), skin, "Neck")
    if kind == "shambler" and not alternate:
        for button in range(3):
            part("Jacket snaps", (.027,-.168+.008*button,1.300-button*.105), (.012,.012,.012), leather, "Spine")
    for side in [-1,1]:
        part("Ear", (side*.106,head_y-.008,1.622), (.023,.031,.041), flesh if side==1 else skin, "Head")
        part("Brow", (side*.043,head_y-.092,1.665), (.045,.031,.026), skin, "Head")
        part("Orbital shadow", (side*.044,head_y-.107,1.638), (.033,.015,.016), socket, "Head")
        part("Clouded eye", (side*.044,head_y-.119,1.637), (.012,.005,.009), eye, "Head")
        part("Cheekbone", (side*.072,head_y-.083,1.600), (.028,.025,.044), flesh, "Head")
        suffix = ".L" if side < 0 else ".R"
        arm = [(side*.222,.0,1.404,.079,.091,-.68),(side*.244,-.01,1.32,.093,.09,-.23),
                  (side*.273,-.043,1.214,.078,.075,0),(side*.294,-.091,1.091,.065,.064,.22),
                  (side*.302,-.112,1.036,.063,.056,.52),(side*.306,-.132,.982,.055,.051,.86),
                  (side*.313,-.154,.904,.048,.045,1),(side*.321,-.176,.812,.039,.038,1)]
        bare = kind == "shrieker" and (alternate or side > 0)
        if bare:
            arm = [(x,y,z,rx*.83,ry*.86,blend) for x,y,z,rx,ry,blend in arm]
        connected("Arm and elbow", arm, skin if bare else cloth, ("Spine","Arm"+suffix,"Fore"+suffix))
        part("Palm", (side*.323,-.182,.797), (.039,.035,.057), skin, "Hand"+suffix)
        for i in range(4):
            x = side*.323 + (i-1.5)*.018
            part("Bent finger", (x,-.205,.747-abs(i-1)*.007), (.011,.015,.041-abs(i-1)*.004), skin, "Hand"+suffix)
            part("Finger joint", (x,-.220,.726-abs(i-1)*.007), (.011,.020,.015), flesh, "Hand"+suffix)
        part("Thumb", (side*.287,-.200,.783), (.015,.024,.035), flesh, "Hand"+suffix)
        connected("Trouser leg", [(side*.115,.02,.924,.111,.114,-.64),(side*.118,.026,.77,.116,.109,-.08),
                  (side*.130,.022,.605,.091,.09,.08),(side*.134,.031,.521,.082,.081,.32),
                  (side*.134,.025,.468,.083,.079,.67),(side*.138,.024,.375,.079,.081,1),
                  (side*.137,.026,.205,.064,.065,1),(side*.136,.020,.147,.058,.056,1)],trousers,("Hips","Thigh"+suffix,"Shin"+suffix))
        sneaker = kind == "shrieker"
        part("Boot" if not sneaker else "Scuffed sneaker", (side*.136,-.053,.083),
             (.079,.145,.057 if sneaker else .078), inner if sneaker else leather, "Foot"+suffix)
        part("Worn sole", (side*.136,-.058,.026), (.081,.144,.021), inner, "Foot"+suffix)
    if kind == "brute" and not alternate:
        part("Chest harness", (0,-.158,1.223), (.185,.049,.197), leather, "Spine")
        for sign in [-1, 1]:
            part("Harness straps", (sign*.103,-.185,1.267), (.029,.018,.157), inner, "Spine")
        part("Protective helmet", (0,head_y+.018,1.705), (.135,.129,.093), trousers, "Head")
        part("Forehead plate", (0,head_y-.098,1.701), (.124,.037,.041), cloth, "Head")
    elif kind == "brute":
        part("Padded collar", (0,.046,1.41), (.19,.115,.09), inner, "Spine")
        part("Shoulder pad", (-.235,-.01,1.35), (.106,.122,.11), tear, "Arm.L")
        part("Belt buckle", (.035,-.133,.926), (.088,.024,.041), leather, "Hips")
        part("Respirator", (0,head_y-.102,1.568), (.095,.055,.054), inner, "Head")
        part("Filter", (-.071,head_y-.143,1.556), (.038,.031,.034), leather, "Head")
    elif kind == "shrieker" and not alternate:
        part("Collapsed hood", (0,.065,1.374), (.159,.104,.14), tear, "Spine")
        part("Hood crown", (0,head_y+.028,1.708), (.118,.111,.081), cloth, "Head")
        part("Torn shirt hem", (.110,-.041,.87), (.090,.069,.072), tear, "Hips")
    elif kind == "shrieker":
        part("Shaved scalp", (0,head_y+.02,1.732), (.091,.088,.022), inner, "Head")
        part("Loose scarf", (.101,-.10,1.355), (.056,.046,.14), flesh, "Spine")
        part("Torn shoulder seam", (.165,-.058,1.357), (.103,.051,.066), tear, "Spine")
    elif alternate:
        strip = material("Weathered high visibility trim", (.24,.22,.134))
        for side in [-1,1]:
            part("Visibility stripe", (side*.115,-.147,1.213), (.033,.018,.173), strip, "Spine")
        part("Reflective belt", (0,-.125,.953), (.151,.034,.030), strip, "Hips")
        part("Knit cap", (0,head_y+.01,1.71), (.121,.12,.065), tear, "Head")
    else:
        part("Patch of hair", (-.025,head_y+.021,1.730), (.097,.104,.051), leather, "Head")
        part("Workwear pocket", (.129,-.158,1.229), (.062,.018,.071), inner, "Spine")
        part("Uneven coat hem", (-.117,.05,.821), (.10,.12,.101), cloth, "Hips")

    bpy.ops.object.select_all(action="DESELECT")
    arm_data = bpy.data.armatures.new("Humanoid")
    rig = bpy.data.objects.new("Humanoid", arm_data)
    bpy.context.collection.objects.link(rig)
    rig.select_set(True)
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.mode_set(mode="EDIT")

    def bone_at(name, start, end, parent=None):
        b = arm_data.edit_bones.new(name)
        b.head = (start[0]*width, start[1]*s, start[2]*s)
        b.tail = (end[0]*width, end[1]*s, end[2]*s)
        if parent:
            b.parent = arm_data.edit_bones[parent]

    bone_at("Hips", (0,0,.91), (0,0,1.065))
    bone_at("Spine", (0,0,1.065), (0,-.028,1.48), "Hips")
    bone_at("Neck", (0,-.044,1.413), (0,-.054,1.496), "Spine")
    bone_at("Head", (0,-.054,1.496), (0,-.054,1.75), "Neck")
    bone_at("Jaw", (0,head_y+.014,1.565), (0,head_y-.105,1.536), "Head")
    for side in [-1,1]:
        suff = ".L" if side < 0 else ".R"
        bone_at("Arm"+suff,(side*.23,0,1.34),(side*.302,-.114,1.04),"Spine")
        bone_at("Fore"+suff,(side*.302,-.114,1.04),(side*.322,-.176,.81),"Arm"+suff)
        bone_at("Hand"+suff,(side*.322,-.176,.81),(side*.323,-.20,.735),"Fore"+suff)
        bone_at("Thigh"+suff,(side*.116,.01,.91),(side*.132,.03,.49),"Hips")
        bone_at("Shin"+suff,(side*.132,.03,.49),(side*.137,.026,.105),"Thigh"+suff)
        bone_at("Foot"+suff,(side*.137,.026,.105),(side*.137,-.164,.080),"Shin"+suff)
    bpy.ops.object.mode_set(mode="OBJECT")

    bpy.ops.object.select_all(action="DESELECT")
    for obj, joints in weights.items():
        rgb = obj.active_material.diffuse_color
        palette = obj.data.color_attributes.new(name="Tint", type="FLOAT_COLOR", domain="POINT")
        for i, v in enumerate(palette.data):
            co = obj.data.vertices[i].co
            folds = math.sin(co.z * 38 + math.sin(co.x*47)*1.8) * .11
            grime = math.sin(co.z*17+co.x*28)*math.cos(co.y*23-co.z*8)
            shade = .72 + RNG.random() * .16 + folds - max(0,grime)*.24
            v.color = (rgb[0]*shade, rgb[1]*shade, rgb[2]*shade, 1)
        obj.data.materials.clear()
        obj.data.materials.append(color)
        if len(joints)==1:
            group = obj.vertex_groups.new(name=joints[0])
            group.add(list(range(len(obj.data.vertices))), 1, "REPLACE")
        obj.select_set(True)
        bpy.context.view_layer.objects.active = obj
    bpy.ops.object.join()
    model = bpy.context.object
    model.name = kind.capitalize()
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    model.parent = rig
    skinning = model.modifiers.new("Skin", "ARMATURE")
    skinning.object = rig
    bpy.context.scene.render.fps = 24
    for b in rig.pose.bones:
        b.rotation_mode = "XYZ"

    anchors = [
        ("Head", (0, head_y, 1.570)), ("Head", (0, head_y, 1.666)),
        ("Spine", (0, -.028, 1.33)), ("Hips", (0, .014, .96)),
    ]
    radii = [(.126 if kind == "brute" else .113) * max(s, width), .205 * width]
    for side, suffix in [(-1, ".L"), (1, ".R")]:
        anchors.extend([
            ("Arm"+suffix, (side*.236,.002,1.331)),
            ("Fore"+suffix, (side*.301,-.117,1.037)),
            ("Hand"+suffix, (side*.322,-.207,.737)),
            ("Thigh"+suffix, (side*.115,.020,.881)),
            ("Shin"+suffix, (side*.134,.033,.497)),
            ("Foot"+suffix, (side*.136,-.047,.071)),
        ])
        radii.extend([.082*width,.061*width,.108*width,.077*width])

    def action(name, frames, motion):
        anim = bpy.data.actions.new(name)
        rig.animation_data_create()
        rig.animation_data.action = anim
        if name in ("Attack", "Ambush"):
            anim.pose_markers.new("Contact").frame = CONTACT_FRAME[kind]
        if name in ("Walk", "Sprint"):
            anim.pose_markers.new("Left Plant").frame = 0
            anim.pose_markers.new("Right Plant").frame = round(frames*(.57 if kind=="shambler" and name=="Walk" else .5))
        for frame in range(frames + 1):
            bpy.context.scene.frame_set(frame)
            progress = frame/frames
            apply_pose(rig, motion(progress), s, width, bpy.context.view_layer.update)
            if name.startswith("Fall") and progress > .32:
                # Keep a hand or knee from disappearing below the floor as the body settles.
                clearance = min((rig.pose.bones[j].head.z-r*s for j,r in
                    [("Head",.077),("Hips",.13),("Shin.L",.064),("Shin.R",.064),
                     ("Foot.L",.065),("Foot.R",.065),("Hand.L",.040),("Hand.R",.040)]))
                if clearance < .008:
                    hips = rig.pose.bones["Hips"]
                    hips.location += hips.bone.matrix_local.to_quaternion().inverted() @ Vector((0,0,.008-clearance))
            for b in rig.pose.bones:
                b.keyframe_insert(data_path="rotation_quaternion", frame=frame, group=b.name)
                b.keyframe_insert(data_path="location", frame=frame, group=b.name)
        rig.animation_data.action = None
        track = rig.animation_data.nla_tracks.new()
        track.name = name
        track.strips.new(name, 0, anim)
        track.mute = True

    actions = clips(kind)
    if not alternate:
        for name, frames, motion in actions:
            action(name, frames, motion)
        RIG_DATA[kind] = {
            "radii": radii,
            "anchors": [[joint.replace(".", ""), [x*width,z*s,-y*s]] for joint,(x,y,z) in anchors],
            "stride": LEAD[kind]*s,
            "contact": CONTACT_FRAME[kind]/next(frames for name,frames,_ in actions if name=="Attack"),
            "frames": {name:frames for name,frames,_ in actions},
        }
    bpy.context.scene.frame_set(0)
    apply_pose(rig, actions[0][2](0), s, width, bpy.context.view_layer.update)
    bpy.context.scene.frame_end = 49
    source = OUT.parent.parent / "art-source"
    source.mkdir(exist_ok=True)
    bpy.context.preferences.filepaths.save_version = 0
    name = kind + ("-alt" if alternate else "")
    export(name, not alternate)
    bpy.ops.wm.save_as_mainfile(filepath=str(source / (name + ".blend")), compress=True)


weapons = ["pistol", "shotgun", "smg", "carbine", "flaregun", "flashlight"]
zombies = ["shambler", "shrieker", "brute"]
requested = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else [*weapons,"glove","wreck",*zombies]
for name in requested:
    RNG.seed(1308)
    if name in weapons:
        hardware(name)
    elif name in zombies:
        zombie(name)
        RNG.seed(1308)
        zombie(name, alternate=True)
    elif name == "glove":
        glove()
    elif name == "wreck":
        wreck()
    else:
        raise ValueError(f"Unknown asset: {name}")

if RIG_DATA:
    rig_file = OUT.parent.parent / "art-source" / "enemy-rig.json"
    existing = json.loads(rig_file.read_text(encoding="utf-8")) if rig_file.exists() else {}
    existing.update(RIG_DATA)
    rig_file.write_text(json.dumps(existing, indent=2, sort_keys=True) + "\n", encoding="utf-8")
