"""Author the original runtime models. Run with Blender --background --python."""
import math
import random
import json
from pathlib import Path
import bpy
from mathutils import Vector

OUT = Path(__file__).resolve().parent.parent / "assets" / "art"
OUT.mkdir(parents=True, exist_ok=True)
RNG = random.Random(1308)
HIT_ANCHORS = {}


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
        "flashlight": (0, -.011, -.008),
    }[kind]
    empty("GripSocket", palm).parent = root
    empty("MuzzleSocket", (0, muzzle, muzzle_y)).parent = root
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


def zombie(kind):
    reset()
    height, width = {"shambler": (1.77, 1), "shrieker": (1.66, .82), "brute": (2.0, 1.32)}[kind]
    s = height / 1.77
    pal = {
        "shambler": ((.13,.151,.116), (.025,.045,.063), (.029,.035,.031)),
        "shrieker": ((.18,.142,.112), (.091,.037,.023), (.031,.030,.024)),
        "brute": ((.153,.167,.115), (.089,.107,.051), (.027,.032,.018)),
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
        weights[obj] = joint
        return obj

    part("Lower coat", (0,.02,.93), (.226,.15,.18), cloth, "Hips")
    part("Ribcage", (0,-.029,1.201), (.257,.158,.288), cloth, "Spine")
    part("Lapel L", (-.082,-.155,1.248), (.063,.025,.175), inner, "Spine").rotation_euler.y = -.24
    part("Lapel R", (.072,-.168,1.251), (.040,.019,.192), tear, "Spine").rotation_euler.y = .18
    part("Neck", (0,-.058,1.444), (.082,.084,.121), skin, "Spine")
    head_y = -.065 if kind != "shrieker" else -.16
    part("Skull", (0,head_y,1.615), (.113,.110,.143), skin, "Head", True)
    part("Jaw", (.007,head_y-.032,1.535), (.079,.083,.052), flesh, "Head")
    part("Mouth", (.011,head_y-.105,1.558), (.062,.020,.031 if kind == "shrieker" else .020), socket, "Head")
    part("Teeth", (.012,head_y-.120,1.572), (.040,.008,.008), bone, "Head")
    part("Nose", (.002,head_y-.113,1.614), (.020,.030,.036), skin, "Head")
    for side in [-1,1]:
        part("Ear", (side*.106,head_y-.008,1.622), (.023,.031,.041), flesh if side==1 else skin, "Head")
        part("Brow", (side*.043,head_y-.092,1.665), (.045,.031,.026), skin, "Head")
        part("Orbital shadow", (side*.044,head_y-.107,1.638), (.033,.015,.016), socket, "Head")
        part("Clouded eye", (side*.044,head_y-.119,1.637), (.012,.005,.009), eye, "Head")
        part("Cheekbone", (side*.072,head_y-.083,1.600), (.028,.025,.044), flesh, "Head")
        suffix = ".L" if side < 0 else ".R"
        part("Coat shoulder", (side*.230,.007,1.321), (.092,.108,.113), cloth, "Arm"+suffix)
        part("Upper arm", (side*.282,-.045,1.182), (.081,.078,.183), cloth, "Arm"+suffix)
        part("Elbow rags", (side*.298,-.114,1.030), (.066,.059,.068), tear, "Fore"+suffix)
        part("Forearm", (side*.313,-.151,.926), (.058,.054,.144), skin if side==1 else cloth, "Fore"+suffix)
        part("Fingers", (side*.322,-.182,.799), (.051,.055,.076), skin, "Fore"+suffix)
        part("Thigh", (side*.119,.020,.726), (.111,.112,.255), trousers, "Thigh"+suffix)
        part("Shin", (side*.133,.033,.308), (.079,.088,.239), trousers, "Shin"+suffix)
        part("Boot", (side*.136,-.046,.091), (.097,.171,.087), leather, "Shin"+suffix)
    if kind == "brute":
        part("Chest harness", (0,-.158,1.223), (.185,.049,.197), leather, "Spine")
        for sign in [-1, 1]:
            part("Harness straps", (sign*.103,-.185,1.267), (.029,.018,.157), inner, "Spine")
        part("Protective helmet", (0,head_y+.018,1.705), (.135,.129,.093), trousers, "Head")
        part("Forehead plate", (0,head_y-.098,1.701), (.124,.037,.041), cloth, "Head")
    elif kind == "shrieker":
        part("Back of torn hood", (0,.084,1.331), (.173,.080,.13), tear, "Spine")
        part("Torn shirt hem", (.110,-.041,.841), (.094,.085,.096), tear, "Hips")
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
    bone_at("Head", (0,-.044,1.495), (0,-.044,1.75), "Spine")
    for side in [-1,1]:
        suff = ".L" if side < 0 else ".R"
        bone_at("Arm"+suff,(side*.23,0,1.34),(side*.302,-.114,1.04),"Spine")
        bone_at("Fore"+suff,(side*.302,-.114,1.04),(side*.322,-.176,.81),"Arm"+suff)
        bone_at("Thigh"+suff,(side*.116,.01,.91),(side*.132,.03,.49),"Hips")
        bone_at("Shin"+suff,(side*.132,.03,.49),(side*.137,.026,.105),"Thigh"+suff)
    bpy.ops.object.mode_set(mode="OBJECT")

    bpy.ops.object.select_all(action="DESELECT")
    for obj, joint in weights.items():
        rgb = obj.active_material.diffuse_color
        palette = obj.data.color_attributes.new(name="Tint", type="FLOAT_COLOR", domain="POINT")
        for i, v in enumerate(palette.data):
            co = obj.data.vertices[i].co
            ridges = math.sin(co.z * 109 + math.cos(co.y * 35) * 2) * .10
            shade = .73 + RNG.random() * .31 + ridges
            v.color = (rgb[0]*shade, rgb[1]*shade, rgb[2]*shade, 1)
        obj.data.materials.clear()
        obj.data.materials.append(color)
        group = obj.vertex_groups.new(name=joint)
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
            ("Fore"+suffix, (side*.321,-.181,.796)),
            ("Thigh"+suffix, (side*.115,.020,.881)),
            ("Shin"+suffix, (side*.134,.033,.497)),
            ("Shin"+suffix, (side*.136,-.025,.109)),
        ])
        radii.extend([.082*width,.057*width,.108*width,.077*width])
    samples = {}
    rest_points = [(joint, arm_data.bones[joint].matrix_local.inverted() @
                    Vector((p[0]*width,p[1]*s,p[2]*s))) for joint,p in anchors]
    boot_soles = []
    for side, suffix in [(-1, ".L"), (1, ".R")]:
        joint = "Shin"+suffix
        inverse = arm_data.bones[joint].matrix_local.inverted()
        for heel_or_toe in [-.145,.063]:
            boot_soles.append((joint, inverse @ Vector((side*.136*width, heel_or_toe*s, .026*s))))

    def action(name, frames, motion):
        anim = bpy.data.actions.new(name)
        rig.animation_data_create()
        rig.animation_data.action = anim
        for frame in range(frames + 1):
            pose = motion(frame/frames)
            for b in rig.pose.bones:
                b.rotation_euler = pose.get(b.name, (0,0,0))
                b.keyframe_insert(data_path="rotation_euler", frame=frame, group=b.name)
            hips = rig.pose.bones["Hips"]
            hips.location = (0,pose.get("lift",0)*s,0)
            if name in ("Walk", "Stumble"):
                bpy.context.view_layer.update()
                foot = min((rig.pose.bones[joint].matrix @ point).z for joint,point in boot_soles)
                hips.location.y += max(-.070, min(.090, .016*s-foot))
            hips.keyframe_insert(data_path="location", frame=frame, group="Hips")
        output = []
        for frame in range(frames + 1):
            bpy.context.scene.frame_set(frame)
            coords = []
            for joint, point in rest_points:
                x, y, z = rig.pose.bones[joint].matrix @ point
                coords.extend(round(v, 4) for v in (x, z, -y))  # glTF coordinates
            output.append(coords)
        samples[name] = output
        rig.animation_data.action = None
        track = rig.animation_data.nla_tracks.new()
        track.name = name
        track.strips.new(name, 0, anim)
        track.mute = True

    def walking(t, stumble=False):
        angle = 2*math.pi*t
        a = angle + .28*math.sin(angle) - .13*math.sin(angle*2)
        stride = {"shambler":.46,"shrieker":.63,"brute":.39}[kind]
        lean = {"shambler":.19,"shrieker":.34,"brute":.12}[kind]
        reach = {"shambler":.70,"shrieker":.91,"brute":.56}[kind]
        sag = math.sin(math.pi*t)**2 if stumble else 0
        roll = .10*math.sin(a) + sag*.13
        set_pose = {
            "Hips": (0,.045*math.sin(a),-.07*math.sin(a)),
            "Spine": (lean + .12*math.sin(a*2+.4) + sag*.28,.13*math.sin(a+.6),roll),
            "Head": (-lean*.48-.08*math.sin(a*2)+sag*.08,.12*math.cos(a),-.15*math.sin(a-.35)-sag*.24),
            "lift": .016*math.cos(2*a)-.075*sag,
        }
        for index, suffix in enumerate([".L",".R"]):
            phase = a + (0 if index == 0 else math.pi + .31)
            foot = math.sin(phase)
            bias = 1 if index == 0 else (.59 if kind == "shambler" else .83)
            drag = sag * (.47 if index == 1 else -.15)
            set_pose["Thigh"+suffix] = (stride*foot*bias + drag,0,.055*foot)
            set_pose["Shin"+suffix] = (-max(0,-foot)*(.68 if index==0 else .41)-.24*sag,0,0)
            reach_wave = math.sin(phase-.42) * (.28 if index==0 else .40)
            set_pose["Arm"+suffix] = (-reach - reach_wave - sag*(.30 if index==0 else .65),.13*foot,
                                      (-.16 if index==0 else .14) + sag*(-.13 if index==0 else .24))
            set_pose["Fore"+suffix] = (-.24+.22*math.cos(phase)-.32*sag,0,.10*foot)
        return set_pose

    def lunge(t):
        reach = math.sin(math.pi * t) ** 1.48
        load = math.sin(min(1,t*2.2) * math.pi) if t < .455 else 0
        return {"Spine": (-.22+.39*reach-.28*load,.11*reach,0), "Head": (.12*load-.15*reach,0,0),
                "Arm.L": (-1.18*reach+.40*load,0,-.22*(1-reach)),
                "Arm.R": (-1.34*reach+.42*load,0,.20*(1-reach)),
                "Fore.L": (-.50*load-.17*reach,0,0), "Fore.R": (-.52*load-.13*reach,0,0)}

    def flinch(t):
        wave = math.sin(math.pi*t)
        return {"Spine": (-.33*wave,.19*wave,-.08*wave), "Head": (-.30*wave,0,.10*wave),
                "Arm.R": (-.36*wave,0,0), "Arm.L": (-.26*wave,0,0)}

    action("Walk", 25 if kind == "shrieker" else 36 if kind == "brute" else 32, walking)
    action("Stumble", 22, lambda t: walking(t, True))
    action("Attack", 24, lunge)
    action("Hit", 12, flinch)
    HIT_ANCHORS[kind] = {"radii": [round(r,4) for r in radii], "clips": samples}
    export(kind, True)


for weapon in ["pistol", "shotgun", "smg", "flashlight"]:
    hardware(weapon)
glove()
wreck()
for zombie_type in ["shambler","shrieker","brute"]:
    zombie(zombie_type)
(OUT.parent.parent / "src" / "hit-anchors.js").write_text(
    "// Generated from the Blender rig by scripts/author-assets.py.\nexport const HIT_ANCHORS = "
    + json.dumps(HIT_ANCHORS, separators=(",", ":")) + ";\n",
    encoding="utf-8"
)
